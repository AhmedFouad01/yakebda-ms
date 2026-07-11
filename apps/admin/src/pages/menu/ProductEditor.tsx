import { useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api";
import { Drawer, ConfirmDialog, toast } from "../../components/ui/overlays";
import { ImageUpload } from "./ImageUpload";
import {
  FormField,
  TextInput,
  NumberInput,
  TextArea,
  Select,
  ToggleSwitch,
  Tabs,
  SaveButton,
  CancelButton,
  LoadingState,
  ErrorState,
  useUnsavedWarning,
} from "../../components/ui/primitives";

/**
 * YKMS-02F — محرر الأصناف الكامل (Drawer عريض).
 * - يفتح فوق POS دون تدمير السلة/الفئة/التمرير (overlay فقط).
 * - أقسام: أساسي / التسعير والأحجام / الإتاحة / المطبخ / الإضافات / الفروع.
 * - أحجام يا كبدة الحقيقية فقط (لقمة/هامر فينو وسياحي — كبسولة/رغيف)
 *   وإضافاتها الحقيقية (طحينة/باربيكيو/شيدر/بطاطس) — لا اختراع أصناف.
 * - dirty tracking + تحذير مغادرة + تأكيد إغلاق + شريط حفظ ثابت.
 */

interface Variant {
  id: string;
  name_ar: string;
  price_delta: string | number;
  is_active: boolean;
}
interface FullProduct {
  id: string;
  category_id: string;
  name_ar: string;
  name_en?: string | null;
  sku?: string | null;
  description_ar?: string | null;
  ingredients_ar?: string | null;
  portion_note_ar?: string | null;
  image_url?: string | null;
  base_price: string | number;
  cost_price?: string | number;
  discountable: boolean;
  is_active: boolean;
  pos_visible: boolean;
  kitchen_printable: boolean;
  unavailability_reason_ar?: string | null;
  prep_station_id?: string | null;
  prep_time_minutes: number;
  variants: Variant[];
  modifier_group_ids: string[];
  branch_prices: Array<{ branch_id: string; price_override: string | number }>;
  branch_availability: Array<{ branch_id: string; is_available: boolean; availability_note_ar?: string | null }>;
}
interface Station {
  id: string;
  name_ar: string;
  is_active: boolean;
}
interface Category {
  id: string;
  name_ar: string;
}
interface Group {
  id: string;
  name_ar: string;
  modifiers: Array<{ id: string; name_ar: string; price_delta: string | number }>;
}
interface Branch {
  id: string;
  name: string;
}

interface FormState {
  name_ar: string;
  name_en: string;
  category_id: string;
  sku: string;
  description_ar: string;
  ingredients_ar: string;
  image_url: string;
  base_price: number;
  discountable: boolean;
  is_active: boolean;
  pos_visible: boolean;
  kitchen_printable: boolean;
  unavailability_reason_ar: string;
  prep_station_id: string;
  prep_time_minutes: number;
  modifier_group_ids: string[];
}

function toForm(p: FullProduct): FormState {
  return {
    name_ar: p.name_ar,
    name_en: p.name_en ?? "",
    category_id: p.category_id,
    sku: p.sku ?? "",
    description_ar: p.description_ar ?? "",
    ingredients_ar: p.ingredients_ar ?? "",
    image_url: p.image_url ?? "",
    base_price: Number(p.base_price),
    discountable: p.discountable,
    is_active: p.is_active,
    pos_visible: p.pos_visible,
    kitchen_printable: p.kitchen_printable,
    unavailability_reason_ar: p.unavailability_reason_ar ?? "",
    prep_station_id: p.prep_station_id ?? "",
    prep_time_minutes: p.prep_time_minutes ?? 0,
    modifier_group_ids: [...p.modifier_group_ids],
  };
}

const TABS: Array<[string, string]> = [
  ["basic", "أساسي"],
  ["pricing", "التسعير والأحجام"],
  ["availability", "الإتاحة"],
  ["kitchen", "المطبخ"],
  ["modifiers", "الإضافات"],
  ["branches", "الفروع"],
];

export function ProductEditor({ productId, onClose, onSaved }: { productId: string; onClose: () => void; onSaved: () => void }) {
  const [tab, setTab] = useState("basic");
  const [product, setProduct] = useState<FullProduct | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [initial, setInitial] = useState("");
  const [stations, setStations] = useState<Station[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [savedOnce, setSavedOnce] = useState(false);

  const dirty = useMemo(() => (form ? JSON.stringify(form) !== initial : false), [form, initial]);
  useUnsavedWarning(dirty);

  async function load() {
    setLoadError("");
    try {
      const [p, st, cats, grps, brs] = await Promise.all([
        api<{ data: FullProduct }>(`/products/${productId}`),
        api<{ data: Station[] }>("/prep-stations"),
        api<{ data: Category[] }>("/categories"),
        api<{ data: Group[] }>("/modifier-groups"),
        api<{ data: Branch[] }>("/branches"),
      ]);
      setProduct(p.data);
      const f = toForm(p.data);
      setForm(f);
      setInitial(JSON.stringify(f));
      setStations(st.data);
      setCategories(cats.data);
      setGroups(grps.data);
      setBranches(brs.data);
    } catch (e: any) {
      setLoadError(e.message);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId]);

  function set<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm((cur) => (cur ? { ...cur, [k]: v } : cur));
  }

  function validate(f: FormState): Record<string, string> {
    const e: Record<string, string> = {};
    if (!f.name_ar.trim()) e.name_ar = "اسم الصنف مطلوب";
    if (!(f.base_price >= 0)) e.base_price = "السعر يجب أن يكون صفرًا أو أكبر";
    if (!f.category_id) e.category_id = "القسم مطلوب";
    return e;
  }

  async function save() {
    if (!form || saving) return;
    const v = validate(form);
    setErrors(v);
    if (Object.keys(v).length) {
      setTab("basic");
      return;
    }
    setSaving(true);
    try {
      await api(`/products/${productId}`, {
        method: "PATCH",
        body: {
          name_ar: form.name_ar.trim(),
          name_en: form.name_en.trim() || null,
          category_id: form.category_id,
          sku: form.sku.trim() || null,
          description_ar: form.description_ar.trim() || null,
          ingredients_ar: form.ingredients_ar.trim() || null,
          image_url: form.image_url.trim() || null,
          base_price: form.base_price,
          discountable: form.discountable,
          is_active: form.is_active,
          pos_visible: form.pos_visible,
          kitchen_printable: form.kitchen_printable,
          unavailability_reason_ar: form.unavailability_reason_ar.trim() || null,
          prep_station_id: form.prep_station_id || null,
          prep_time_minutes: form.prep_time_minutes,
        },
      });
      await api(`/products/${productId}/modifier-groups`, {
        method: "PUT",
        body: { modifier_group_ids: form.modifier_group_ids },
      });
      setInitial(JSON.stringify(form));
      setSavedOnce(true);
      toast("تم حفظ الصنف ✓");
    } catch (e: any) {
      toast(e.message, "error");
    } finally {
      setSaving(false);
    }
  }

  function requestClose() {
    if (dirty) setConfirmClose(true);
    else {
      if (savedOnce) onSaved();
      onClose();
    }
  }

  const title = product ? `تعديل: ${product.name_ar}` : "تعديل صنف";

  return (
    <>
      <Drawer open onClose={requestClose} title={title} wide
        footer={
          <div className="uif-sticky-actions" style={{ justifyContent: "space-between", display: "flex", width: "100%" }}>
            <span className="uif-dirty-dot" style={{ visibility: dirty ? "visible" : "hidden" }}>● تغييرات غير محفوظة</span>
            <span style={{ display: "flex", gap: 8 }}>
              <SaveButton busy={saving} disabled={!form} onClick={save} />
              <CancelButton onClick={requestClose}>إغلاق</CancelButton>
            </span>
          </div>
        }
      >
        {loadError && <ErrorState message={loadError} onRetry={load} />}
        {!loadError && !form && <LoadingState label="جارٍ تحميل الصنف…" />}
        {form && product && (
          <>
            <Tabs tabs={TABS} active={tab} onChange={setTab} />

            {tab === "basic" && (
              <div>
                <div className="pedit-image-row">
                  <div style={{ flex: 1 }}>
                    <FormField label="صورة الصنف (مربعة 1:1 — تُعرض 800×800)" hint="ارفع صورة أو الصق رابطًا">
                      <ImageUpload value={form.image_url || null} productId={productId} onChange={(url) => set("image_url", url ?? "")} />
                    </FormField>
                    <FormField label="أو رابط صورة خارجي" hint="https://…">
                      <TextInput dir="ltr" placeholder="https://…" value={form.image_url} onChange={(e) => set("image_url", e.target.value)} />
                    </FormField>
                  </div>
                </div>
                <FormField label="اسم الصنف بالعربية" error={errors.name_ar}>
                  <TextInput value={form.name_ar} onChange={(e) => set("name_ar", e.target.value)} />
                </FormField>
                <FormField label="الاسم بالإنجليزية (اختياري)">
                  <TextInput dir="ltr" value={form.name_en} onChange={(e) => set("name_en", e.target.value)} />
                </FormField>
                <FormField label="القسم" error={errors.category_id}>
                  <Select value={form.category_id} onChange={(e) => set("category_id", e.target.value)}>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>{c.name_ar}</option>
                    ))}
                  </Select>
                </FormField>
                <FormField label="SKU (اختياري)">
                  <TextInput dir="ltr" value={form.sku} onChange={(e) => set("sku", e.target.value)} />
                </FormField>
                <FormField label="الوصف">
                  <TextArea value={form.description_ar} onChange={(e) => set("description_ar", e.target.value)} />
                </FormField>
                <FormField label="المكونات">
                  <TextArea value={form.ingredients_ar} onChange={(e) => set("ingredients_ar", e.target.value)} />
                </FormField>
              </div>
            )}

            {tab === "pricing" && (
              <div>
                <FormField label="السعر الأساسي (ج.م)" error={errors.base_price}>
                  <NumberInput min={0} step="0.5" value={form.base_price} onChange={(e) => set("base_price", Number(e.target.value))} />
                </FormField>
                <ToggleSwitch checked={form.discountable} onChange={(v) => set("discountable", v)} label="قابل للخصم" />
                <VariantsEditor productId={productId} variants={product.variants} onChanged={load} />
              </div>
            )}

            {tab === "availability" && (
              <div>
                <ToggleSwitch checked={form.is_active} onChange={(v) => set("is_active", v)} label="نشِط (يظهر في المنيو)" />
                <ToggleSwitch checked={form.pos_visible} onChange={(v) => set("pos_visible", v)} label="يظهر في شاشة الكاشير POS" />
                {!form.is_active && (
                  <FormField label="سبب عدم الإتاحة (يظهر للكاشير)">
                    <TextInput value={form.unavailability_reason_ar} onChange={(e) => set("unavailability_reason_ar", e.target.value)} />
                  </FormField>
                )}
                <div className="uif-hint" style={{ marginTop: 8 }}>
                  إتاحة كل فرع على حدة من تبويب «الفروع».
                </div>
              </div>
            )}

            {tab === "kitchen" && (
              <div>
                <ToggleSwitch checked={form.kitchen_printable} onChange={(v) => set("kitchen_printable", v)} label="يُرسل/يُطبع للمطبخ" />
                <FormField label="محطة التحضير">
                  <Select value={form.prep_station_id} onChange={(e) => set("prep_station_id", e.target.value)}>
                    <option value="">حسب القسم (افتراضي)</option>
                    {stations.filter((s) => s.is_active).map((s) => (
                      <option key={s.id} value={s.id}>{s.name_ar}</option>
                    ))}
                  </Select>
                </FormField>
                <FormField label="وقت التحضير (دقائق)" hint="صفر = افتراضي القسم/النظام">
                  <NumberInput min={0} value={form.prep_time_minutes} onChange={(e) => set("prep_time_minutes", Number(e.target.value))} />
                </FormField>
              </div>
            )}

            {tab === "modifiers" && (
              <div>
                <div className="uif-hint" style={{ marginBottom: 10 }}>
                  الإضافات الحقيقية المعتمدة فقط (طحينة/باربيكيو/شيدر/بطاطس) — الربط هنا، وإدارة المجموعات من صفحة المنيو.
                </div>
                {groups.length === 0 && <div className="uif-hint">لا توجد مجموعات إضافات معرفة.</div>}
                {groups.map((g) => (
                  <div key={g.id} className="pedit-group">
                    <ToggleSwitch
                      checked={form.modifier_group_ids.includes(g.id)}
                      onChange={(v) =>
                        set(
                          "modifier_group_ids",
                          v ? [...form.modifier_group_ids, g.id] : form.modifier_group_ids.filter((x) => x !== g.id)
                        )
                      }
                      label={g.name_ar}
                    />
                    <div className="pedit-group-mods">
                      {g.modifiers.map((m) => (
                        <span key={m.id} className="stub">
                          {m.name_ar}
                          {Number(m.price_delta) ? ` (+${Number(m.price_delta)})` : ""}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {tab === "branches" && (
              <BranchOverrides product={product} branches={branches} onChanged={load} />
            )}
          </>
        )}
      </Drawer>

      <ConfirmDialog
        open={confirmClose}
        title="تغييرات غير محفوظة"
        message="لديك تعديلات لم تُحفظ. هل تريد الإغلاق وتجاهلها؟"
        confirmLabel="إغلاق بدون حفظ"
        danger
        onConfirm={() => {
          setConfirmClose(false);
          if (savedOnce) onSaved();
          onClose();
        }}
        onCancel={() => setConfirmClose(false)}
      />
    </>
  );
}

/** الأحجام الحقيقية: تعديل فرق السعر/التعطيل/الحذف + إضافة حجم — عمليات فورية. */
function VariantsEditor({ productId, variants, onChanged }: { productId: string; variants: Variant[]; onChanged: () => void }) {
  const [name, setName] = useState("");
  const [delta, setDelta] = useState(0);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Variant | null>(null);

  async function run(fn: () => Promise<unknown>, ok: string) {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
      toast(ok);
      onChanged();
    } catch (e: any) {
      toast(e.message, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="pedit-variants">
      <h4>الأحجام</h4>
      {variants.length === 0 && <div className="uif-hint">لا أحجام — الصنف بسعر واحد.</div>}
      {variants.map((v) => (
        <div key={v.id} className="pedit-variant-row">
          <span className="pedit-variant-name">{v.name_ar}</span>
          <NumberInput
            step="0.5"
            defaultValue={Number(v.price_delta)}
            title="فرق السعر"
            onBlur={(e) => {
              const next = Number(e.target.value);
              if (next !== Number(v.price_delta)) run(() => api(`/products/variants/${v.id}`, { method: "PATCH", body: { price_delta: next } }), "تم تحديث فرق السعر ✓");
            }}
          />
          <ToggleSwitch
            checked={v.is_active}
            onChange={(on) => run(() => api(`/products/variants/${v.id}`, { method: "PATCH", body: { is_active: on } }), on ? "تم تفعيل الحجم ✓" : "تم تعطيل الحجم ✓")}
            label={v.is_active ? "مفعل" : "معطل"}
          />
          <button type="button" className="uif-btn danger" disabled={busy} onClick={() => setConfirmDelete(v)}>حذف</button>
        </div>
      ))}
      <div className="pedit-variant-add">
        <TextInput placeholder="اسم الحجم (مثال: لقمة فينو)" value={name} onChange={(e) => setName(e.target.value)} />
        <NumberInput placeholder="فرق السعر" step="0.5" value={delta || ""} onChange={(e) => setDelta(Number(e.target.value))} />
        <button
          type="button"
          className="uif-btn primary"
          disabled={busy || !name.trim()}
          onClick={() =>
            run(async () => {
              await api(`/products/${productId}/variants`, { method: "POST", body: { name_ar: name.trim(), price_delta: delta } });
              setName("");
              setDelta(0);
            }, "تمت إضافة الحجم ✓")
          }
        >
          إضافة حجم
        </button>
      </div>
      <ConfirmDialog
        open={!!confirmDelete}
        title="حذف حجم"
        message={confirmDelete ? `حذف «${confirmDelete.name_ar}»؟ لو الحجم مستخدم في طلبات سابقة سيُعطَّل بدل الحذف حفاظًا على السجل.` : ""}
        confirmLabel="حذف"
        danger
        onConfirm={() => {
          const v = confirmDelete!;
          setConfirmDelete(null);
          run(() => api(`/products/variants/${v.id}`, { method: "DELETE" }), "تم حذف الحجم ✓");
        }}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
}

/** أسعار وإتاحة الفروع — حفظ فوري لكل فرع عبر endpoints الفروع الموجودة. */
function BranchOverrides({ product, branches, onChanged }: { product: FullProduct; branches: Branch[]; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const priceOf = (branchId: string) => product.branch_prices.find((r) => r.branch_id === branchId)?.price_override;
  const availOf = (branchId: string) => product.branch_availability.find((r) => r.branch_id === branchId)?.is_available ?? true;

  async function run(fn: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
      toast("تم حفظ إعداد الفرع ✓");
      onChanged();
    } catch (e: any) {
      toast(e.message, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="uif-hint" style={{ marginBottom: 10 }}>
        فارغ = السعر الأساسي ({Number(product.base_price).toFixed(2)} ج.م). التغييرات هنا تُحفظ فورًا.
      </div>
      <table className="pedit-branches">
        <thead>
          <tr><th>الفرع</th><th>سعر خاص</th><th>متاح</th></tr>
        </thead>
        <tbody>
          {branches.map((b) => (
            <tr key={b.id}>
              <td>{b.name}</td>
              <td>
                <NumberInput
                  min={0}
                  step="0.5"
                  placeholder="—"
                  defaultValue={priceOf(b.id) != null ? Number(priceOf(b.id)) : undefined}
                  onBlur={(e) => {
                    const raw = e.target.value.trim();
                    const next = raw === "" ? null : Number(raw);
                    const cur = priceOf(b.id) != null ? Number(priceOf(b.id)) : null;
                    if (next !== cur) {
                      run(() => api(`/branches/${b.id}/menu-prices`, { method: "PATCH", body: { items: [{ product_id: product.id, price_override: next }] } }));
                    }
                  }}
                />
              </td>
              <td>
                <ToggleSwitch
                  checked={availOf(b.id)}
                  onChange={(on) =>
                    run(() => api(`/branches/${b.id}/menu-availability`, { method: "PATCH", body: { items: [{ product_id: product.id, is_available: on }] } }))
                  }
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
