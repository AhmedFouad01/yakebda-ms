import { useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api";
import {
  Button,
  EmptyState,
  LoadingState,
  SectionCard,
  Select,
  TextInput,
  ToggleSwitch,
} from "../../components/ui/primitives";
import { toast } from "../../components/ui/overlays";

interface OrderSource {
  id: string;
  code: string;
  name_ar: string;
  is_active: boolean;
  supports_takeaway: boolean;
  supports_delivery: boolean;
  sort_order: number;
}

interface SourceProduct {
  id: string;
  name_ar: string;
  category_name_ar: string;
  base_price: string | number;
  image_url?: string | null;
  price_override: number | null;
  is_available: boolean;
}

export function SourcesSection({ editable }: { editable: boolean }) {
  const [sources, setSources] = useState<OrderSource[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [products, setProducts] = useState<SourceProduct[]>([]);
  const [newName, setNewName] = useState("");
  const [copyFrom, setCopyFrom] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [menuLoading, setMenuLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const selected = sources.find((source) => source.id === selectedId) ?? null;

  async function loadSources(preferredId?: string) {
    setLoading(true);
    setError("");
    try {
      const response = await api<{ data: OrderSource[] }>("/order-sources?active_only=false");
      setSources(response.data);
      const nextId = preferredId ?? selectedId ?? response.data[0]?.id ?? "";
      setSelectedId(response.data.some((source) => source.id === nextId) ? nextId : response.data[0]?.id ?? "");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadMenu(sourceId: string) {
    if (!sourceId) {
      setProducts([]);
      return;
    }
    setMenuLoading(true);
    setError("");
    try {
      const response = await api<{ data: { products: SourceProduct[] } }>("/order-sources/" + sourceId + "/menu");
      setProducts(response.data.products);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setMenuLoading(false);
    }
  }

  useEffect(() => {
    void loadSources();
  }, []);

  useEffect(() => {
    void loadMenu(selectedId);
  }, [selectedId]);

  const filteredProducts = useMemo(() => {
    const value = search.trim();
    if (!value) return products;
    return products.filter(
      (product) => product.name_ar.includes(value) || product.category_name_ar.includes(value)
    );
  }, [products, search]);

  function patchSelected(patch: Partial<OrderSource>) {
    if (!selectedId) return;
    setSources((rows) => rows.map((source) => (source.id === selectedId ? { ...source, ...patch } : source)));
  }

  async function createSource() {
    if (!newName.trim()) return;
    setSaving(true);
    setError("");
    try {
      const response = await api<{ data: OrderSource }>("/order-sources", {
        method: "POST",
        body: {
          name_ar: newName.trim(),
          is_active: true,
          supports_takeaway: true,
          supports_delivery: true,
          sort_order: sources.length,
          copy_from_source_id: copyFrom || null,
        },
      });
      setNewName("");
      setCopyFrom("");
      await loadSources(response.data.id);
      toast("تم إنشاء المصدر");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function saveSource() {
    if (!selected) return;
    setSaving(true);
    setError("");
    try {
      await api("/order-sources/" + selected.id, {
        method: "PATCH",
        body: {
          name_ar: selected.name_ar,
          is_active: selected.is_active,
          supports_takeaway: selected.supports_takeaway,
          supports_delivery: selected.supports_delivery,
          sort_order: selected.sort_order,
        },
      });
      await loadSources(selected.id);
      toast("تم حفظ إعدادات المصدر");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function saveMenu() {
    if (!selected) return;
    setSaving(true);
    setError("");
    try {
      await api("/order-sources/" + selected.id + "/menu", {
        method: "PUT",
        body: {
          items: products.map((product) => ({
            product_id: product.id,
            price_override: product.price_override,
            is_available: product.is_available,
          })),
        },
      });
      await loadMenu(selected.id);
      toast("تم حفظ أسعار وإتاحة المصدر");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <LoadingState label="جارٍ تحميل المصادر…" />;

  return (
    <div className="sources-section">
      <SectionCard
        title="المصادر"
        hint="منيو واحدة أساسية؛ كل مصدر يحدد الإتاحة والسعر الخاص به بدون تكرار الأصناف."
      >
        {error && <div className="alert">{error}</div>}
        {editable && (
          <div className="source-create">
            <label className="source-field">
              <span>اسم المصدر الجديد</span>
              <TextInput
                placeholder="مثال: طلبات الهاتف"
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
              />
            </label>
            <label className="source-field">
              <span>نسخ الإعدادات من</span>
              <Select value={copyFrom} onChange={(event) => setCopyFrom(event.target.value)}>
                <option value="">المنيو الأساسية — بدون أسعار مخصصة</option>
                {sources.map((source) => (
                  <option key={source.id} value={source.id}>{source.name_ar}</option>
                ))}
              </Select>
            </label>
            <Button variant="primary" disabled={!newName.trim() || saving} onClick={createSource}>
              إضافة مصدر
            </Button>
          </div>
        )}

        <div className="source-picker" role="list" aria-label="مصادر الطلب">
          {sources.map((source) => (
            <button
              key={source.id}
              type="button"
              className={"source-picker-card" + (selectedId === source.id ? " active" : "")}
              aria-pressed={selectedId === source.id}
              onClick={() => setSelectedId(source.id)}
            >
              <strong>{source.name_ar}</strong>
              <span>{source.is_active ? "نشط" : "موقوف"}</span>
              <small>
                {source.supports_takeaway ? "تيك أواي" : ""}
                {source.supports_takeaway && source.supports_delivery ? " + " : ""}
                {source.supports_delivery ? "دليفري" : ""}
              </small>
            </button>
          ))}
        </div>
      </SectionCard>

      {!selected && <EmptyState message="أضف مصدرًا للبدء." />}

      {selected && (
        <>
          <SectionCard title={"إعدادات المصدر — " + selected.name_ar}>
            <div className="source-settings-grid">
              <label className="source-field">
                <span>اسم المصدر</span>
                <TextInput
                  disabled={!editable}
                  value={selected.name_ar}
                  onChange={(event) => patchSelected({ name_ar: event.target.value })}
                />
              </label>
              <label className="source-field compact">
                <span>الترتيب</span>
                <input
                  className="uif-input uif-num"
                  type="number"
                  min={0}
                  disabled={!editable}
                  value={selected.sort_order}
                  onChange={(event) => patchSelected({ sort_order: Number(event.target.value) })}
                />
              </label>
              <ToggleSwitch
                checked={selected.is_active}
                disabled={!editable || selected.code === "direct"}
                label="المصدر نشط"
                onChange={(value) => patchSelected({ is_active: value })}
              />
              <ToggleSwitch
                checked={selected.supports_takeaway}
                disabled={!editable}
                label="متاح للتيك أواي"
                onChange={(value) => patchSelected({ supports_takeaway: value })}
              />
              <ToggleSwitch
                checked={selected.supports_delivery}
                disabled={!editable}
                label="متاح للدليفري"
                onChange={(value) => patchSelected({ supports_delivery: value })}
              />
            </div>
            {editable && (
              <div className="source-actions">
                <Button variant="primary" disabled={saving || !selected.name_ar.trim()} onClick={saveSource}>
                  حفظ إعدادات المصدر
                </Button>
              </div>
            )}
          </SectionCard>

          <SectionCard
            title="أسعار وإتاحة الأصناف"
            hint="اترك السعر فارغًا لاستخدام سعر الفرع أو السعر الأساسي."
          >
            <div className="source-menu-toolbar">
              <TextInput
                placeholder="ابحث باسم الصنف أو القسم…"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              <span>{filteredProducts.length} صنف</span>
              {editable && (
                <Button variant="primary" disabled={saving || menuLoading} onClick={saveMenu}>
                  حفظ أسعار المصدر
                </Button>
              )}
            </div>

            {menuLoading ? (
              <LoadingState label="جارٍ تحميل منيو المصدر…" />
            ) : (
              <div className="source-product-list">
                {filteredProducts.map((product) => (
                  <div key={product.id} className={"source-product-row" + (!product.is_available ? " unavailable" : "")}>
                    <div className="source-product-copy">
                      <strong>{product.name_ar}</strong>
                      <span>{product.category_name_ar}</span>
                    </div>
                    <div className="source-base-price">
                      <span>السعر الأساسي</span>
                      <strong>{Number(product.base_price).toFixed(2)} ج.م</strong>
                    </div>
                    <label className="source-price-field">
                      <span>سعر المصدر</span>
                      <input
                        className="uif-input uif-num"
                        type="number"
                        min={0}
                        step="0.01"
                        disabled={!editable}
                        placeholder="استخدم الأساسي"
                        value={product.price_override ?? ""}
                        onChange={(event) => {
                          const value = event.target.value;
                          setProducts((rows) =>
                            rows.map((row) =>
                              row.id === product.id
                                ? { ...row, price_override: value === "" ? null : Number(value) }
                                : row
                            )
                          );
                        }}
                      />
                    </label>
                    <ToggleSwitch
                      checked={product.is_available}
                      disabled={!editable}
                      label="متاح"
                      onChange={(value) =>
                        setProducts((rows) =>
                          rows.map((row) => (row.id === product.id ? { ...row, is_available: value } : row))
                        )
                      }
                    />
                  </div>
                ))}
                {!filteredProducts.length && <EmptyState message="لا توجد أصناف مطابقة." />}
              </div>
            )}
          </SectionCard>
        </>
      )}
    </div>
  );
}
