import { useEffect, useMemo, useState } from "react";
import { api, downloadFile, fileToBase64, resolveAssetUrl } from "../lib/api";
import { t } from "../lib/t";
import { useList } from "./hooks";
import { ProductEditor } from "./menu/ProductEditor";
import { YAKEBDA_TEMPLATE } from "./menu/yakebdaTemplate";

interface Category { id: string; name_ar: string; sort_order: number; is_active: boolean }
interface Variant { id: string; name_ar: string; price_delta: string | number }
interface Product { id: string; category_id: string; name_ar: string; base_price: string | number; sku?: string | null; description_ar?: string | null; image_url?: string | null; ingredients_ar?: string | null; portion_note_ar?: string | null; sort_order: number; is_active: boolean; variants: Variant[]; modifier_group_ids: string[] }
interface Group { id: string; name_ar: string; min_select: number; max_select: number; is_required: boolean; modifiers: Array<{ id: string; name_ar: string; price_delta: string | number }> }
type Tab = "products" | "import" | "categories" | "groups" | "branch";

export function Menu() {
  const [tab, setTab] = useState<Tab>("products");
  const tabs: Array<[Tab, string]> = [
    ["products", "الأصناف"],
    ["import", "استيراد المنيو"],
    ["categories", t.menu.categories],
    ["groups", "الإضافات"],
    ["branch", t.menu.branch],
  ];

  return (
    <div dir="rtl">
      <div className="page-head"><h1>{t.menu.title}</h1></div>
      <div className="seg" style={{ marginBottom: 16 }}>
        {tabs.map(([key, label]) => (
          <button key={key} className={tab === key ? "active" : ""} onClick={() => setTab(key)}>{label}</button>
        ))}
      </div>
      {tab === "categories" && <CategoriesTab />}
      {tab === "products" && <ProductsTab />}
      {tab === "import" && <ImportTab />}
      {tab === "groups" && <GroupsTab />}
      {tab === "branch" && <BranchTab />}
    </div>
  );
}

function CategoriesTab() {
  const { data, error, reload } = useList<Category>("/categories");
  const [name, setName] = useState("");
  const [err, setErr] = useState("");

  async function add() {
    try {
      await api("/categories", { method: "POST", body: { name_ar: name, sort_order: data.length } });
      setName("");
      setErr("");
      reload();
    } catch (e: any) {
      setErr(e.message);
    }
  }

  async function toggle(category: Category) {
    await api(`/categories/${category.id}`, { method: "PATCH", body: { is_active: !category.is_active } });
    reload();
  }

  return (
    <>
      {(error || err) && <div className="alert">{error || err}</div>}
      <div className="form-row">
        <input placeholder={t.menu.nameAr} value={name} onChange={(e) => setName(e.target.value)} />
        <button className="primary" onClick={add} disabled={!name}>{t.menu.addCategory}</button>
      </div>
      <div className="panel">
        <table>
          <thead><tr><th>{t.menu.nameAr}</th><th>{t.menu.sortOrder}</th><th /></tr></thead>
          <tbody>
            {data.map((category) => (
              <tr key={category.id}>
                <td>{category.name_ar}</td>
                <td>{category.sort_order}</td>
                <td><button onClick={() => toggle(category)}>{category.is_active ? t.common.active : t.common.inactive}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function ProductsTab() {
  const cats = useList<Category>("/categories");
  const { data, error, reload } = useList<Product>("/products");
  const [editorId, setEditorId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("");
  const [activeFilter, setActiveFilter] = useState<"" | "active" | "inactive">("");
  const [flagFilter, setFlagFilter] = useState<"" | "no_image" | "no_sku">("");

  const catName = (id: string) => cats.data.find((category) => category.id === id)?.name_ar ?? "—";

  const filtered = useMemo(() => data.filter((product) => {
    if (search && !product.name_ar.includes(search) && !(product.sku ?? "").toLowerCase().includes(search.toLowerCase())) return false;
    if (catFilter && product.category_id !== catFilter) return false;
    if (activeFilter === "active" && !product.is_active) return false;
    if (activeFilter === "inactive" && product.is_active) return false;
    if (flagFilter === "no_image" && product.image_url) return false;
    if (flagFilter === "no_sku" && product.sku) return false;
    return true;
  }), [data, search, catFilter, activeFilter, flagFilter]);

  async function patch(id: string, body: Record<string, unknown>) {
    try {
      await api(`/products/${id}`, { method: "PATCH", body });
      setErr("");
      reload();
    } catch (e: any) {
      setErr(e.message);
    }
  }

  async function duplicate(product: Product) {
    try {
      await api("/products", {
        method: "POST",
        body: {
          category_id: product.category_id,
          name_ar: `${product.name_ar} (نسخة)`,
          base_price: Number(product.base_price),
          sku: null,
          ingredients_ar: product.ingredients_ar ?? null,
          portion_note_ar: product.portion_note_ar ?? null,
          sort_order: data.length,
        },
      });
      setMsg("تم إنشاء نسخة");
      setErr("");
      reload();
    } catch (e: any) {
      setErr(e.message);
    }
  }

  async function removeProduct() {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    try {
      await api(`/products/${deleteTarget.id}`, { method: "DELETE" });
      setMsg(`تم حذف ${deleteTarget.name_ar}`);
      setErr("");
      setDeleteTarget(null);
      reload();
    } catch (e: any) {
      const reason = e?.details?.message;
      setErr(reason || e.message);
    } finally {
      setDeleteBusy(false);
    }
  }

  const missingImages = data.filter((product) => !product.image_url).length;
  const missingSkus = data.filter((product) => !product.sku).length;

  return (
    <>
      {(error || err) && <div className="alert">{error || err}</div>}
      {msg && <div className="ok">{msg}</div>}

      <div className="menu-toolbar">
        <input className="menu-search" placeholder="ابحث بالاسم أو SKU…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select value={catFilter} onChange={(e) => setCatFilter(e.target.value)}>
          <option value="">كل الفئات</option>
          {cats.data.map((category) => <option key={category.id} value={category.id}>{category.name_ar}</option>)}
        </select>
        <select value={activeFilter} onChange={(e) => setActiveFilter(e.target.value as typeof activeFilter)}>
          <option value="">الحالة: الكل</option>
          <option value="active">نشط فقط</option>
          <option value="inactive">غير نشط فقط</option>
        </select>
        <select value={flagFilter} onChange={(e) => setFlagFilter(e.target.value as typeof flagFilter)}>
          <option value="">بلا فلتر إضافي</option>
          <option value="no_image">بدون صورة{missingImages ? ` (${missingImages})` : ""}</option>
          <option value="no_sku">بدون SKU{missingSkus ? ` (${missingSkus})` : ""}</option>
        </select>
        <div className="menu-toolbar-actions">
          <button className="primary" onClick={() => setAddOpen(true)}>+ صنف جديد</button>
          <ExcelToolbar onDone={() => { setMsg("تم"); reload(); }} onError={setErr} />
        </div>
      </div>

      <div className="menu-count muted">عرض {filtered.length} من {data.length} صنف</div>

      <div className="panel">
        <table className="menu-table">
          <thead>
            <tr><th>الصورة</th><th>الصنف</th><th>الفئة</th><th>السعر</th><th>الأحجام</th><th>الحالة</th><th>إجراءات</th></tr>
          </thead>
          <tbody>
            {filtered.map((product) => (
              <tr key={product.id}>
                <td>
                  {product.image_url
                    ? <img className="menu-thumb" src={resolveAssetUrl(product.image_url)} alt="" />
                    : <span className="menu-thumb ph">{product.name_ar.trim().charAt(0)}</span>}
                </td>
                <td><b>{product.name_ar}</b><div className="muted mono">{product.sku || "بدون SKU"}</div></td>
                <td>{catName(product.category_id)}</td>
                <td className="mono">
                  <input
                    type="number"
                    min={0}
                    defaultValue={Number(product.base_price)}
                    className="menu-price-input"
                    onBlur={(e) => Number(e.target.value) !== Number(product.base_price) && patch(product.id, { base_price: Number(e.target.value) })}
                  />
                </td>
                <td className="muted">{product.variants.map((variant) => variant.name_ar).join("، ") || "—"}</td>
                <td>
                  <button className={`menu-status ${product.is_active ? "on" : "off"}`} onClick={() => patch(product.id, { is_active: !product.is_active })}>
                    {product.is_active ? "نشط" : "متوقف"}
                  </button>
                </td>
                <td>
                  <div className="menu-row-actions">
                    <button className="primary sm" onClick={() => setEditorId(product.id)}>تعديل</button>
                    <button className="sm" onClick={() => duplicate(product)}>نسخ</button>
                    <button className="sm danger" onClick={() => setDeleteTarget(product)}>حذف</button>
                  </div>
                </td>
              </tr>
            ))}
            {!filtered.length && <tr><td colSpan={7} className="muted" style={{ textAlign: "center", padding: 24 }}>لا أصناف مطابقة للفلاتر</td></tr>}
          </tbody>
        </table>
      </div>

      {deleteTarget && (
        <div className="modal-back" onClick={() => !deleteBusy && setDeleteTarget(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>حذف الصنف</h3>
            <p>سيتم حذف <b>{deleteTarget.name_ar}</b> نهائيًا إذا لم يكن مرتبطًا بطلبات سابقة.</p>
            <p className="muted">الأصناف المستخدمة في طلبات سابقة لا يمكن حذفها حفاظًا على سجل المبيعات، ويمكن إيقافها بدلًا من ذلك.</p>
            <div className="form-row">
              <button className="danger" onClick={removeProduct} disabled={deleteBusy}>{deleteBusy ? "جارٍ الحذف…" : "تأكيد الحذف"}</button>
              <button onClick={() => setDeleteTarget(null)} disabled={deleteBusy}>إلغاء</button>
            </div>
          </div>
        </div>
      )}

      {editorId && <ProductEditor productId={editorId} onClose={() => setEditorId(null)} onSaved={() => { setEditorId(null); reload(); }} />}
      {addOpen && <QuickAddProduct cats={cats.data} onClose={() => setAddOpen(false)} onCreated={(id) => { setAddOpen(false); reload(); setEditorId(id); }} />}
    </>
  );
}

function ExcelToolbar({ onDone, onError }: { onDone: () => void; onError: (message: string) => void }) {
  type PreviewRow = { row: number; name_ar: string; sku: string | null; action: string; matched_by: string | null; errors: string[] };
  type PreviewSummary = { created: number; updated: number; failed: number; total: number };
  const [preview, setPreview] = useState<null | { rows: PreviewRow[]; summary: PreviewSummary; b64: string }>(null);
  const [busy, setBusy] = useState(false);

  async function download(path: string, filename: string) {
    try { await downloadFile(path, filename); }
    catch (e: any) { onError(e.message); }
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    try {
      const b64 = await fileToBase64(file);
      const response = await api<{ data: { rows: PreviewRow[]; summary: PreviewSummary } }>("/products/import-excel", { method: "POST", body: { mode: "preview", data_base64: b64 } });
      setPreview({ rows: response.data.rows, summary: response.data.summary, b64 });
    } catch (e: any) {
      onError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function apply() {
    if (!preview) return;
    setBusy(true);
    try {
      await api("/products/import-excel", { method: "POST", body: { mode: "apply", data_base64: preview.b64 } });
      setPreview(null);
      onDone();
    } catch (e: any) {
      onError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button onClick={() => download("/products/export-excel", "yakebda-menu.xlsx")}>تصدير Excel</button>
      <button onClick={() => download("/products/import-template", "yakebda-menu-template.xlsx")}>قالب</button>
      <label className="menu-import-btn">
        استيراد Excel
        <input type="file" accept=".xlsx" hidden onChange={onFile} />
      </label>

      {preview && (
        <div className="modal-back" onClick={() => setPreview(null)}>
          <div className="modal wide" onClick={(e) => e.stopPropagation()}>
            <h3>معاينة الاستيراد (قبل الكتابة)</h3>
            <div className="import-summary">
              <span className="pill create">جديد: {preview.summary.created}</span>
              <span className="pill update">تحديث: {preview.summary.updated}</span>
              <span className="pill fail">أخطاء: {preview.summary.failed}</span>
              <span className="pill">الإجمالي: {preview.summary.total}</span>
            </div>
            <div className="panel import-preview">
              <table>
                <thead><tr><th>الصف</th><th>الصنف</th><th>SKU</th><th>الإجراء</th><th>المطابقة</th><th>ملاحظات</th></tr></thead>
                <tbody>
                  {preview.rows.map((row) => (
                    <tr key={row.row} className={row.action === "error" ? "row-error" : ""}>
                      <td>{row.row}</td><td>{row.name_ar || "—"}</td><td className="mono">{row.sku || "—"}</td>
                      <td><span className={`pill ${row.action === "create" ? "create" : row.action === "update" ? "update" : "fail"}`}>{row.action === "create" ? "جديد" : row.action === "update" ? "تحديث" : "خطأ"}</span></td>
                      <td>{row.matched_by === "sku" ? "SKU" : row.matched_by === "id" ? "معرف" : "—"}</td>
                      <td className="row-error-msg">{row.errors.join("، ") || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="form-row">
              <button className="primary" onClick={apply} disabled={busy || preview.summary.created + preview.summary.updated === 0}>تأكيد الاستيراد ({preview.summary.created + preview.summary.updated} صنف)</button>
              <button onClick={() => setPreview(null)}>إلغاء</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function QuickAddProduct({ cats, onClose, onCreated }: { cats: Category[]; onClose: () => void; onCreated: (id: string) => void }) {
  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState(cats[0]?.id ?? "");
  const [price, setPrice] = useState(0);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function create() {
    setBusy(true);
    try {
      const response = await api<{ data: Product }>("/products", { method: "POST", body: { name_ar: name, category_id: categoryId, base_price: Number(price), sort_order: 0 } });
      onCreated(response.data.id);
    } catch (e: any) {
      setErr(e.message);
      setBusy(false);
    }
  }

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>صنف جديد</h3>
        {err && <div className="alert">{err}</div>}
        <div className="stack">
          <input placeholder="اسم الصنف" value={name} onChange={(e) => setName(e.target.value)} />
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            {cats.map((category) => <option key={category.id} value={category.id}>{category.name_ar}</option>)}
          </select>
          <input type="number" min={0} placeholder="السعر" value={price} onChange={(e) => setPrice(Number(e.target.value))} />
        </div>
        <div className="form-row">
          <button className="primary" onClick={create} disabled={busy || !name || !categoryId}>إنشاء ومتابعة التعديل</button>
          <button onClick={onClose}>إلغاء</button>
        </div>
      </div>
    </div>
  );
}

function ImportTab() {
  const [text, setText] = useState(JSON.stringify({ items: YAKEBDA_TEMPLATE }, null, 2));
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const stats = useMemo(() => {
    try {
      const parsed = JSON.parse(text);
      return Array.isArray(parsed) ? parsed.length : parsed.items?.length ?? 0;
    } catch {
      return 0;
    }
  }, [text]);

  async function runImport() {
    try {
      const parsed = JSON.parse(text);
      const items = Array.isArray(parsed) ? parsed : parsed.items;
      const response = await api<{ data: { created: number; updated: number; total: number } }>("/products/import", { method: "POST", body: { items } });
      setMsg(`تم الاستيراد: ${response.data.total} صنف — جديد ${response.data.created} / تحديث ${response.data.updated}`);
      setErr("");
    } catch (e: any) {
      setErr(e.message);
    }
  }

  return (
    <div className="import-grid">
      <div className="panel import-panel">
        <h3>استيراد منيو يا كبدة بالكامل</h3>
        <p className="muted">قالب منظم لاستيراد الأصناف والفئات والأحجام والإضافات.</p>
        {err && <div className="alert">{err}</div>}
        {msg && <div className="ok">{msg}</div>}
        <div className="form-row">
          <button className="primary" onClick={() => setText(JSON.stringify({ items: YAKEBDA_TEMPLATE }, null, 2))}>تحميل القالب</button>
          <button onClick={runImport} disabled={!stats}>استيراد {stats} صنف</button>
        </div>
        <textarea className="json-import" dir="ltr" value={text} onChange={(e) => setText(e.target.value)} />
      </div>
    </div>
  );
}

function GroupsTab() {
  const { data, error, reload } = useList<Group>("/modifier-groups");
  const [groupName, setGroupName] = useState("");
  const [maxSelect, setMaxSelect] = useState(1);
  const [required, setRequired] = useState(false);
  const [modifierName, setModifierName] = useState("");
  const [modifierDelta, setModifierDelta] = useState(0);
  const [target, setTarget] = useState("");
  const [err, setErr] = useState("");

  async function addGroup() {
    try {
      await api("/modifier-groups", { method: "POST", body: { name_ar: groupName, max_select: maxSelect, is_required: required, min_select: required ? 1 : 0, sort_order: data.length } });
      setGroupName("");
      setErr("");
      reload();
    } catch (e: any) {
      setErr(e.message);
    }
  }

  async function addModifier() {
    try {
      await api(`/modifier-groups/${target}/modifiers`, { method: "POST", body: { name_ar: modifierName, price_delta: modifierDelta } });
      setModifierName("");
      setModifierDelta(0);
      setErr("");
      reload();
    } catch (e: any) {
      setErr(e.message);
    }
  }

  useEffect(() => {
    if (!target && data.length) setTarget(data[0].id);
  }, [data, target]);

  return (
    <>
      {(error || err) && <div className="alert">{error || err}</div>}
      <div className="form-row">
        <input placeholder={t.menu.nameAr} value={groupName} onChange={(e) => setGroupName(e.target.value)} />
        <input type="number" min={1} title={t.menu.maxSelect} value={maxSelect} onChange={(e) => setMaxSelect(Number(e.target.value))} />
        <label><input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} /> {t.menu.required}</label>
        <button className="primary" onClick={addGroup} disabled={!groupName}>{t.menu.addGroup}</button>
      </div>
      <div className="form-row">
        <select value={target} onChange={(e) => setTarget(e.target.value)}>{data.map((group) => <option key={group.id} value={group.id}>{group.name_ar}</option>)}</select>
        <input placeholder={t.menu.nameAr} value={modifierName} onChange={(e) => setModifierName(e.target.value)} />
        <input type="number" placeholder={t.menu.priceDelta} value={modifierDelta} onChange={(e) => setModifierDelta(Number(e.target.value))} />
        <button className="primary" onClick={addModifier} disabled={!modifierName || !target}>{t.menu.addModifier}</button>
      </div>
      <div className="panel">
        <table>
          <thead><tr><th>{t.menu.groups}</th><th>{t.menu.maxSelect}</th><th>{t.menu.required}</th><th>الإضافات</th></tr></thead>
          <tbody>{data.map((group) => <tr key={group.id}><td>{group.name_ar}</td><td>{group.max_select}</td><td>{group.is_required ? "نعم" : "لا"}</td><td>{group.modifiers.map((modifier) => `${modifier.name_ar}${Number(modifier.price_delta) ? ` (+${Number(modifier.price_delta)})` : ""}`).join("، ")}</td></tr>)}</tbody>
        </table>
      </div>
    </>
  );
}

function BranchTab() {
  const branches = useList<{ id: string; name: string }>("/branches");
  const [branchId, setBranchId] = useState("");
  const [rows, setRows] = useState<Array<{ id: string; name_ar: string; base_price: string | number; effective_price: number; is_available: boolean; availability_note_ar?: string | null }>>([]);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (!branchId && branches.data.length) setBranchId(branches.data[0].id);
  }, [branchId, branches.data]);

  async function load() {
    if (!branchId) return;
    const response = await api<{ data: { categories: Array<{ products: typeof rows }> } }>(`/branches/${branchId}/menu`);
    setRows(response.data.categories.flatMap((category) => category.products));
  }

  useEffect(() => {
    load().catch((e) => setErr(e.message));
  }, [branchId]);

  async function setPrice(productId: string, value: string) {
    try {
      await api(`/branches/${branchId}/menu-prices`, { method: "PATCH", body: { items: [{ product_id: productId, price_override: value === "" ? null : Number(value) }] } });
      setMsg(`${t.common.save} ✓`);
      setErr("");
      load();
    } catch (e: any) {
      setErr(e.message);
    }
  }

  async function setAvail(productId: string, isAvailable: boolean, note?: string) {
    try {
      await api(`/branches/${branchId}/menu-availability`, { method: "PATCH", body: { items: [{ product_id: productId, is_available: isAvailable, availability_note_ar: note ?? null }] } });
      setMsg(`${t.common.save} ✓`);
      setErr("");
      load();
    } catch (e: any) {
      setErr(e.message);
    }
  }

  return (
    <>
      {err && <div className="alert">{err}</div>}
      {msg && <div className="ok">{msg}</div>}
      <div className="form-row">
        <label>{t.menu.chooseBranch}</label>
        <select value={branchId} onChange={(e) => setBranchId(e.target.value)}>{branches.data.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select>
      </div>
      <div className="panel">
        <table>
          <thead><tr><th>{t.menu.products}</th><th>{t.menu.basePrice}</th><th>{t.menu.priceOverride}</th><th>{t.menu.available}</th><th>{t.menu.availabilityNote}</th></tr></thead>
          <tbody>
            {rows.map((product) => (
              <tr key={product.id}>
                <td>{product.name_ar}</td>
                <td>{Number(product.base_price).toFixed(2)}</td>
                <td><input type="number" min={0} style={{ width: 100 }} defaultValue={product.effective_price !== Number(product.base_price) ? product.effective_price : ""} onBlur={(e) => setPrice(product.id, e.target.value)} /></td>
                <td><button onClick={() => setAvail(product.id, !product.is_available, product.availability_note_ar ?? undefined)}>{product.is_available ? t.menu.available : t.menu.unavailable}</button></td>
                <td><input defaultValue={product.availability_note_ar ?? ""} onBlur={(e) => setAvail(product.id, product.is_available, e.target.value || undefined)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
