import { useEffect, useMemo, useState } from "react";
import { api, downloadFile, fileToBase64 } from "../lib/api";
import { t } from "../lib/t";
import { useList } from "./hooks";
import { ProductEditor } from "./menu/ProductEditor";

interface Category { id: string; name_ar: string; sort_order: number; is_active: boolean }
interface Variant { id: string; name_ar: string; price_delta: string | number }
interface Product { id: string; category_id: string; name_ar: string; base_price: string | number; sku?: string | null; description_ar?: string | null; image_url?: string | null; ingredients_ar?: string | null; portion_note_ar?: string | null; sort_order: number; is_active: boolean; variants: Variant[]; modifier_group_ids: string[] }
interface Group { id: string; name_ar: string; min_select: number; max_select: number; is_required: boolean; modifiers: Array<{ id: string; name_ar: string; price_delta: string | number }> }
type Tab = "products" | "import" | "categories" | "groups" | "branch";

const SANDWICH_ADDONS = { name_ar: "إضافات داخل الساندوتش", min_select: 0, max_select: 4, is_required: false, modifiers: [
  { name_ar: "طحينة", price_delta: 3 }, { name_ar: "باربيكيو", price_delta: 3 }, { name_ar: "شيدر", price_delta: 3 }, { name_ar: "بطاطس", price_delta: 3 },
] };
const sandwichVariants = (vino: number, hVino: number, siyahi: number, hSiyahi: number) => [
  { name_ar: "لقمة فينو", price_delta: 0 }, { name_ar: "هامر فينو", price_delta: hVino - vino }, { name_ar: "لقمة سياحي", price_delta: siyahi - vino }, { name_ar: "هامر سياحي", price_delta: hSiyahi - vino },
];
const hawawshiVariants = (capsule: number, loaf: number) => [{ name_ar: "كبسولة", price_delta: 0 }, { name_ar: "رغيف", price_delta: loaf - capsule }];
const YAKEBDA_TEMPLATE = [
  { category: "ساندوتشات", name_ar: "كبدة إسكندراني", sku: "SAN-KBD-ISK", base_price: 15, ingredients_ar: "كبدة إسكندراني", portion_note_ar: "لقمة / هامر — فينو أو سياحي", variants: sandwichVariants(15, 25, 15, 30), modifier_groups: [SANDWICH_ADDONS] },
  { category: "ساندوتشات", name_ar: "كبدة مشوية", sku: "SAN-KBD-GRL", base_price: 20, ingredients_ar: "كبدة مشوية", portion_note_ar: "لقمة / هامر — فينو أو سياحي", variants: sandwichVariants(20, 40, 20, 40), modifier_groups: [SANDWICH_ADDONS] },
  { category: "ساندوتشات", name_ar: "سجق إسكندراني", sku: "SAN-SGG-ISK", base_price: 15, ingredients_ar: "سجق إسكندراني", portion_note_ar: "لقمة / هامر — فينو أو سياحي", variants: sandwichVariants(15, 25, 15, 30), modifier_groups: [SANDWICH_ADDONS] },
  { category: "ساندوتشات", name_ar: "سجق مشوي", sku: "SAN-SGG-GRL", base_price: 15, ingredients_ar: "سجق مشوي", portion_note_ar: "لقمة / هامر — فينو أو سياحي", variants: sandwichVariants(15, 25, 15, 30), modifier_groups: [SANDWICH_ADDONS] },
  { category: "ساندوتشات", name_ar: "كفتة جريل", sku: "SAN-KFTA-GRL", base_price: 25, ingredients_ar: "كفتة جريل", portion_note_ar: "لقمة / هامر — فينو أو سياحي", variants: sandwichVariants(25, 40, 25, 40), modifier_groups: [SANDWICH_ADDONS] },
  { category: "ساندوتشات", name_ar: "بطاطس ساندوتش", sku: "SAN-FRIES", base_price: 10, ingredients_ar: "بطاطس", portion_note_ar: "لقمة / هامر — فينو أو سياحي", variants: sandwichVariants(10, 20, 10, 20), modifier_groups: [SANDWICH_ADDONS] },
  { category: "أطباق", name_ar: "أرز بسمتي سادة", sku: "DISH-RICE-PLAIN", base_price: 30, ingredients_ar: "أرز بسمتي", portion_note_ar: "طبق" },
  { category: "أطباق", name_ar: "أرز بكبدة إسكندراني", sku: "DISH-RICE-KBD-ISK", base_price: 50, ingredients_ar: "أرز بسمتي + كبدة إسكندراني", portion_note_ar: "يقدم مع طحينة أو طماطم متبلة" },
  { category: "أطباق", name_ar: "أرز بسجق إسكندراني أو مشوي", sku: "DISH-RICE-SGG", base_price: 50, ingredients_ar: "أرز بسمتي + سجق", portion_note_ar: "يقدم مع طحينة أو طماطم متبلة" },
  { category: "أطباق", name_ar: "أرز بكبدة مشوية", sku: "DISH-RICE-KBD-GRL", base_price: 60, ingredients_ar: "أرز بسمتي + كبدة مشوية", portion_note_ar: "يقدم مع طحينة أو طماطم متبلة" },
  { category: "أطباق", name_ar: "أرز بكفتة", sku: "DISH-RICE-KFTA", base_price: 60, ingredients_ar: "أرز بسمتي + كفتة", portion_note_ar: "يقدم مع طحينة أو طماطم متبلة" },
  { category: "أطباق", name_ar: "أرز كبدة وسجق ميكس", sku: "DISH-RICE-MIX", base_price: 55, ingredients_ar: "أرز بسمتي + كبدة وسجق", portion_note_ar: "يقدم مع طحينة أو طماطم متبلة" },
  { category: "وجبات", name_ar: "وجبة ربع كيلو كبدة إسكندراني", sku: "MEAL-KBD-ISK-250", base_price: 120, ingredients_ar: "عيش + أرز + طحينة + طماطم متبلة + 80 جم بطاطس", portion_note_ar: "ربع كيلو" },
  { category: "وجبات", name_ar: "وجبة ربع كيلو كبدة ردة", sku: "MEAL-KBD-RDA-250", base_price: 130, ingredients_ar: "عيش + أرز + طحينة + طماطم متبلة + 80 جم بطاطس", portion_note_ar: "ربع كيلو" },
  { category: "وجبات", name_ar: "وجبة ربع كيلو كبدة مشوية", sku: "MEAL-KBD-GRL-250", base_price: 140, ingredients_ar: "عيش + أرز + طحينة + طماطم متبلة + 80 جم بطاطس", portion_note_ar: "ربع كيلو" },
  { category: "وجبات", name_ar: "وجبة ربع كيلو سجق إسكندراني", sku: "MEAL-SGG-ISK-250", base_price: 120, ingredients_ar: "عيش + أرز + طحينة + طماطم متبلة + 80 جم بطاطس", portion_note_ar: "ربع كيلو" },
  { category: "وجبات", name_ar: "وجبة ربع كيلو سجق مشوي", sku: "MEAL-SGG-GRL-250", base_price: 120, ingredients_ar: "عيش + أرز + طحينة + طماطم متبلة + 80 جم بطاطس", portion_note_ar: "ربع كيلو" },
  { category: "وجبات", name_ar: "وجبة ربع كيلو كفتة جريل", sku: "MEAL-KFTA-GRL-250", base_price: 140, ingredients_ar: "عيش + أرز + طحينة + طماطم متبلة + 80 جم بطاطس", portion_note_ar: "ربع كيلو" },
  { category: "وجبات", name_ar: "وجبة ربع كيلو كبدة وسجق ميكس", sku: "MEAL-MIX-250", base_price: 120, ingredients_ar: "عيش + أرز + طحينة + طماطم متبلة + 80 جم بطاطس", portion_note_ar: "ربع كيلو" },
  { category: "الحواوشي", name_ar: "حواوشي لحمة سادة", sku: "HAW-MEAT", base_price: 25, ingredients_ar: "حواوشي لحمة", portion_note_ar: "كبسولة / رغيف", variants: hawawshiVariants(25, 50) },
  { category: "الحواوشي", name_ar: "حواوشي ميكس جبن", sku: "HAW-MIX-CHEESE", base_price: 30, ingredients_ar: "حواوشي ميكس جبن", portion_note_ar: "كبسولة / رغيف", variants: hawawshiVariants(30, 60) },
  { category: "الحواوشي", name_ar: "حواوشي سجق", sku: "HAW-SGG", base_price: 35, ingredients_ar: "حواوشي سجق", portion_note_ar: "كبسولة / رغيف", variants: hawawshiVariants(35, 65) },
  { category: "البطاطس", name_ar: "بطاطس سادة", sku: "FRY-PLAIN", base_price: 15 },
  { category: "البطاطس", name_ar: "بطاطس شيدر", sku: "FRY-CHEDDAR", base_price: 30 },
  { category: "البطاطس", name_ar: "بطاطس بسجق مشوي", sku: "FRY-SGG", base_price: 30 },
  { category: "البطاطس", name_ar: "بطاطس بكفتة", sku: "FRY-KFTA", base_price: 35 },
  { category: "فواتح الشهية", name_ar: "طحينة", sku: "APP-TAHINA", base_price: 10 },
  { category: "فواتح الشهية", name_ar: "مخلل", sku: "APP-PICKLES", base_price: 5 },
  { category: "فواتح الشهية", name_ar: "صوص شيدر", sku: "APP-CHEDDAR", base_price: 15 },
  { category: "فواتح الشهية", name_ar: "باربيكيو", sku: "APP-BBQ", base_price: 10 },
  { category: "فواتح الشهية", name_ar: "طماطم متبلة", sku: "APP-TOMATO", base_price: 5 },
  { category: "فواتح الشهية", name_ar: "كول سلو", sku: "APP-COLESLAW", base_price: 15 },
  { category: "إضافات", name_ar: "إضافة طحينة داخل الساندوتش", sku: "ADD-TAHINA", base_price: 3 },
  { category: "إضافات", name_ar: "إضافة باربيكيو داخل الساندوتش", sku: "ADD-BBQ", base_price: 3 },
  { category: "إضافات", name_ar: "إضافة شيدر داخل الساندوتش", sku: "ADD-CHEDDAR", base_price: 3 },
  { category: "إضافات", name_ar: "إضافة بطاطس داخل الساندوتش", sku: "ADD-FRIES", base_price: 3 },
  { category: "مشروبات", name_ar: "مياه صغيرة", sku: "DRK-WATER-S", base_price: 5 },
  { category: "مشروبات", name_ar: "ماكسي كول", sku: "DRK-MAXI-COLA", base_price: 10 },
  { category: "مشروبات", name_ar: "لا كول", sku: "DRK-LA-COLA", base_price: 20 },
];

export function Menu() {
  const [tab, setTab] = useState<Tab>("products");
  const tabs: Array<[Tab, string]> = [["products", "الأصناف"], ["import", "استيراد المنيو"], ["categories", t.menu.categories], ["groups", "الإضافات"], ["branch", t.menu.branch]];
  return <div dir="rtl"><div className="page-head"><h1>{t.menu.title}</h1></div><div className="seg" style={{ marginBottom: 16 }}>{tabs.map(([k, label]) => <button key={k} className={tab === k ? "active" : ""} onClick={() => setTab(k)}>{label}</button>)}</div>{tab === "categories" && <CategoriesTab />}{tab === "products" && <ProductsTab />}{tab === "import" && <ImportTab />}{tab === "groups" && <GroupsTab />}{tab === "branch" && <BranchTab />}</div>;
}

function CategoriesTab() {
  const { data, error, reload } = useList<Category>("/categories");
  const [name, setName] = useState("");
  const [err, setErr] = useState("");
  async function add() { try { await api("/categories", { method: "POST", body: { name_ar: name, sort_order: data.length } }); setName(""); setErr(""); reload(); } catch (e: any) { setErr(e.message); } }
  async function toggle(c: Category) { await api(`/categories/${c.id}`, { method: "PATCH", body: { is_active: !c.is_active } }); reload(); }
  return <>{(error || err) && <div className="alert">{error || err}</div>}<div className="form-row"><input placeholder={t.menu.nameAr} value={name} onChange={(e) => setName(e.target.value)} /><button className="primary" onClick={add} disabled={!name}>{t.menu.addCategory}</button></div><div className="panel"><table><thead><tr><th>{t.menu.nameAr}</th><th>{t.menu.sortOrder}</th><th></th></tr></thead><tbody>{data.map((c) => <tr key={c.id}><td>{c.name_ar}</td><td>{c.sort_order}</td><td><button onClick={() => toggle(c)}>{c.is_active ? t.common.active : t.common.inactive}</button></td></tr>)}</tbody></table></div></>;
}

function ProductsTab() {
  const cats = useList<Category>("/categories");
  const { data, error, reload } = useList<Product>("/products");
  const [editorId, setEditorId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  // فلاتر
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("");
  const [activeFilter, setActiveFilter] = useState<"" | "active" | "inactive">("");
  const [flagFilter, setFlagFilter] = useState<"" | "no_image" | "no_sku">("");

  const catName = (id: string) => cats.data.find((c) => c.id === id)?.name_ar ?? "—";

  const filtered = useMemo(() => {
    return data.filter((p) => {
      if (search && !p.name_ar.includes(search) && !(p.sku ?? "").toLowerCase().includes(search.toLowerCase())) return false;
      if (catFilter && p.category_id !== catFilter) return false;
      if (activeFilter === "active" && !p.is_active) return false;
      if (activeFilter === "inactive" && p.is_active) return false;
      if (flagFilter === "no_image" && p.image_url) return false;
      if (flagFilter === "no_sku" && p.sku) return false;
      return true;
    });
  }, [data, search, catFilter, activeFilter, flagFilter]);

  async function patch(id: string, body: Record<string, unknown>) {
    try { await api(`/products/${id}`, { method: "PATCH", body }); setErr(""); reload(); }
    catch (e: any) { setErr(e.message); }
  }
  async function duplicate(p: Product) {
    try {
      await api("/products", { method: "POST", body: { category_id: p.category_id, name_ar: `${p.name_ar} (نسخة)`, base_price: Number(p.base_price), sku: null, ingredients_ar: p.ingredients_ar ?? null, portion_note_ar: p.portion_note_ar ?? null, sort_order: data.length } });
      setMsg("تم إنشاء نسخة"); setErr(""); reload();
    } catch (e: any) { setErr(e.message); }
  }

  const missingImages = data.filter((p) => !p.image_url).length;
  const missingSkus = data.filter((p) => !p.sku).length;

  return (
    <>
      {(error || err) && <div className="alert">{error || err}</div>}
      {msg && <div className="ok">{msg}</div>}

      {/* شريط الأدوات: بحث + فلاتر + إجراءات */}
      <div className="menu-toolbar">
        <input className="menu-search" placeholder="ابحث بالاسم أو SKU…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select value={catFilter} onChange={(e) => setCatFilter(e.target.value)}>
          <option value="">كل الفئات</option>
          {cats.data.map((c) => <option key={c.id} value={c.id}>{c.name_ar}</option>)}
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
            {filtered.map((p) => (
              <tr key={p.id}>
                <td>{p.image_url ? <img className="menu-thumb" src={p.image_url} alt="" /> : <span className="menu-thumb ph">{p.name_ar.trim().charAt(0)}</span>}</td>
                <td><b>{p.name_ar}</b><div className="muted mono">{p.sku || "بدون SKU"}</div></td>
                <td>{catName(p.category_id)}</td>
                <td className="mono">
                  <input type="number" min={0} defaultValue={Number(p.base_price)} className="menu-price-input" onBlur={(e) => Number(e.target.value) !== Number(p.base_price) && patch(p.id, { base_price: Number(e.target.value) })} />
                </td>
                <td className="muted">{p.variants.map((v) => v.name_ar).join("، ") || "—"}</td>
                <td>
                  <button className={`menu-status ${p.is_active ? "on" : "off"}`} onClick={() => patch(p.id, { is_active: !p.is_active })}>
                    {p.is_active ? "نشط" : "متوقف"}
                  </button>
                </td>
                <td>
                  <div className="menu-row-actions">
                    <button className="primary sm" onClick={() => setEditorId(p.id)}>تعديل</button>
                    <button className="sm" onClick={() => duplicate(p)}>نسخ</button>
                  </div>
                </td>
              </tr>
            ))}
            {!filtered.length && <tr><td colSpan={7} className="muted" style={{ textAlign: "center", padding: 24 }}>لا أصناف مطابقة للفلاتر</td></tr>}
          </tbody>
        </table>
      </div>

      {editorId && <ProductEditor productId={editorId} onClose={() => setEditorId(null)} onSaved={() => { setEditorId(null); reload(); }} />}
      {addOpen && <QuickAddProduct cats={cats.data} onClose={() => setAddOpen(false)} onCreated={(id) => { setAddOpen(false); reload(); setEditorId(id); }} />}
    </>
  );
}

/** رفع/تصدير Excel: قالب، تصدير، استيراد بمعاينة قبل الكتابة. */
function ExcelToolbar({ onDone, onError }: { onDone: () => void; onError: (m: string) => void }) {
  const [preview, setPreview] = useState<null | { rows: Array<{ row: number; name_ar: string; sku: string | null; action: string; matched_by: string | null; errors: string[] }>; summary: { created: number; updated: number; failed: number; total: number }; b64: string }>(null);
  const [busy, setBusy] = useState(false);

  async function download(path: string, filename: string) {
    try {
      await downloadFile(path, filename);
    } catch (e: any) { onError(e.message); }
  }

  type PreviewRow = { row: number; name_ar: string; sku: string | null; action: string; matched_by: string | null; errors: string[] };
  type PreviewSummary = { created: number; updated: number; failed: number; total: number };

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    try {
      const b64 = await fileToBase64(file);
      const res = await api<{ data: { rows: PreviewRow[]; summary: PreviewSummary } }>("/products/import-excel", { method: "POST", body: { mode: "preview", data_base64: b64 } });
      setPreview({ rows: res.data.rows, summary: res.data.summary, b64 });
    } catch (e: any) { onError(e.message); }
    finally { setBusy(false); }
  }

  async function apply() {
    if (!preview) return;
    setBusy(true);
    try {
      await api("/products/import-excel", { method: "POST", body: { mode: "apply", data_base64: preview.b64 } });
      setPreview(null); onDone();
    } catch (e: any) { onError(e.message); }
    finally { setBusy(false); }
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
                  {preview.rows.map((r) => (
                    <tr key={r.row} className={r.action === "error" ? "row-error" : ""}>
                      <td>{r.row}</td><td>{r.name_ar || "—"}</td><td className="mono">{r.sku || "—"}</td>
                      <td><span className={`pill ${r.action === "create" ? "create" : r.action === "update" ? "update" : "fail"}`}>{r.action === "create" ? "جديد" : r.action === "update" ? "تحديث" : "خطأ"}</span></td>
                      <td>{r.matched_by === "sku" ? "SKU" : r.matched_by === "id" ? "معرف" : "—"}</td>
                      <td className="row-error-msg">{r.errors.join("، ") || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="form-row">
              <button className="primary" onClick={apply} disabled={busy || preview.summary.created + preview.summary.updated === 0}>
                تأكيد الاستيراد ({preview.summary.created + preview.summary.updated} صنف)
              </button>
              <button onClick={() => setPreview(null)}>إلغاء</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/** إضافة سريعة لصنف ثم فتح المحرر الكامل. */
function QuickAddProduct({ cats, onClose, onCreated }: { cats: Category[]; onClose: () => void; onCreated: (id: string) => void }) {
  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState(cats[0]?.id ?? "");
  const [price, setPrice] = useState(0);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  async function create() {
    setBusy(true);
    try {
      const res = await api<{ data: Product }>("/products", { method: "POST", body: { name_ar: name, category_id: categoryId, base_price: Number(price), sort_order: 0 } });
      onCreated(res.data.id);
    } catch (e: any) { setErr(e.message); setBusy(false); }
  }
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>صنف جديد</h3>
        {err && <div className="alert">{err}</div>}
        <div className="stack">
          <input placeholder="اسم الصنف" value={name} onChange={(e) => setName(e.target.value)} />
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            {cats.map((c) => <option key={c.id} value={c.id}>{c.name_ar}</option>)}
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

function ImportTab() { const [text, setText] = useState(JSON.stringify({ items: YAKEBDA_TEMPLATE }, null, 2)); const [msg, setMsg] = useState(""); const [err, setErr] = useState(""); const stats = useMemo(() => { try { const p = JSON.parse(text); return Array.isArray(p) ? p.length : p.items?.length ?? 0; } catch { return 0; } }, [text]); async function runImport() { try { const parsed = JSON.parse(text); const items = Array.isArray(parsed) ? parsed : parsed.items; const res = await api<{ data: { created: number; updated: number; total: number } }>("/products/import", { method: "POST", body: { items } }); setMsg(`تم الاستيراد: ${res.data.total} صنف — جديد ${res.data.created} / تحديث ${res.data.updated}`); setErr(""); } catch (e: any) { setErr(e.message); } } return <div className="import-grid"><div className="panel import-panel"><h3>استيراد منيو يا كبدة بالكامل</h3><p className="muted">القالب مبني على صورة قائمة الطعام: ساندوتشات، أطباق، وجبات، حواوشي، بطاطس، فواتح، إضافات، مشروبات.</p>{err && <div className="alert">{err}</div>}{msg && <div className="ok">{msg}</div>}<div className="form-row"><button className="primary" onClick={() => setText(JSON.stringify({ items: YAKEBDA_TEMPLATE }, null, 2))}>تحميل قالب يا كبدة</button><button onClick={runImport} disabled={!stats}>استيراد {stats} صنف</button></div><textarea className="json-import" dir="ltr" value={text} onChange={(e) => setText(e.target.value)} /></div></div>; }

function GroupsTab() { const { data, error, reload } = useList<Group>("/modifier-groups"); const [gName, setGName] = useState(""); const [maxSelect, setMaxSelect] = useState(1); const [required, setRequired] = useState(false); const [mName, setMName] = useState(""); const [mDelta, setMDelta] = useState(0); const [target, setTarget] = useState(""); const [err, setErr] = useState(""); async function addGroup() { try { await api("/modifier-groups", { method: "POST", body: { name_ar: gName, max_select: maxSelect, is_required: required, min_select: required ? 1 : 0, sort_order: data.length } }); setGName(""); setErr(""); reload(); } catch (e: any) { setErr(e.message); } } async function addModifier() { try { await api(`/modifier-groups/${target}/modifiers`, { method: "POST", body: { name_ar: mName, price_delta: mDelta } }); setMName(""); setMDelta(0); setErr(""); reload(); } catch (e: any) { setErr(e.message); } } useEffect(() => { if (!target && data.length) setTarget(data[0].id); }, [data]); return <>{(error || err) && <div className="alert">{error || err}</div>}<div className="form-row"><input placeholder={t.menu.nameAr} value={gName} onChange={(e) => setGName(e.target.value)} /><input type="number" min={1} title={t.menu.maxSelect} value={maxSelect} onChange={(e) => setMaxSelect(Number(e.target.value))} /><label><input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} /> {t.menu.required}</label><button className="primary" onClick={addGroup} disabled={!gName}>{t.menu.addGroup}</button></div><div className="form-row"><select value={target} onChange={(e) => setTarget(e.target.value)}>{data.map((g) => <option key={g.id} value={g.id}>{g.name_ar}</option>)}</select><input placeholder={t.menu.nameAr} value={mName} onChange={(e) => setMName(e.target.value)} /><input type="number" placeholder={t.menu.priceDelta} value={mDelta} onChange={(e) => setMDelta(Number(e.target.value))} /><button className="primary" onClick={addModifier} disabled={!mName || !target}>{t.menu.addModifier}</button></div><div className="panel"><table><thead><tr><th>{t.menu.groups}</th><th>{t.menu.maxSelect}</th><th>{t.menu.required}</th><th>الإضافات</th></tr></thead><tbody>{data.map((g) => <tr key={g.id}><td>{g.name_ar}</td><td>{g.max_select}</td><td>{g.is_required ? "نعم" : "لا"}</td><td>{g.modifiers.map((m) => `${m.name_ar}${Number(m.price_delta) ? ` (+${Number(m.price_delta)})` : ""}`).join("، ")}</td></tr>)}</tbody></table></div></>; }

function BranchTab() { const branches = useList<{ id: string; name: string }>("/branches"); const [branchId, setBranchId] = useState(""); const [rows, setRows] = useState<Array<{ id: string; name_ar: string; base_price: string | number; effective_price: number; is_available: boolean; availability_note_ar?: string | null }>>([]); const [err, setErr] = useState(""); const [msg, setMsg] = useState(""); useEffect(() => { if (!branchId && branches.data.length) setBranchId(branches.data[0].id); }, [branches.data]); async function load() { if (!branchId) return; const res = await api<{ data: { categories: Array<{ products: typeof rows }> } }>(`/branches/${branchId}/menu`); setRows(res.data.categories.flatMap((c) => c.products)); } useEffect(() => { load().catch((e) => setErr(e.message)); }, [branchId]); async function setPrice(productId: string, value: string) { try { await api(`/branches/${branchId}/menu-prices`, { method: "PATCH", body: { items: [{ product_id: productId, price_override: value === "" ? null : Number(value) }] } }); setMsg(t.common.save + " ✓"); setErr(""); load(); } catch (e: any) { setErr(e.message); } } async function setAvail(productId: string, is_available: boolean, note?: string) { try { await api(`/branches/${branchId}/menu-availability`, { method: "PATCH", body: { items: [{ product_id: productId, is_available, availability_note_ar: note ?? null }] } }); setMsg(t.common.save + " ✓"); setErr(""); load(); } catch (e: any) { setErr(e.message); } } return <>{err && <div className="alert">{err}</div>}{msg && <div className="ok">{msg}</div>}<div className="form-row"><label>{t.menu.chooseBranch}</label><select value={branchId} onChange={(e) => setBranchId(e.target.value)}>{branches.data.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div><div className="panel"><table><thead><tr><th>{t.menu.products}</th><th>{t.menu.basePrice}</th><th>{t.menu.priceOverride}</th><th>{t.menu.available}</th><th>{t.menu.availabilityNote}</th></tr></thead><tbody>{rows.map((p) => <tr key={p.id}><td>{p.name_ar}</td><td>{Number(p.base_price).toFixed(2)}</td><td><input type="number" min={0} style={{ width: 100 }} defaultValue={p.effective_price !== Number(p.base_price) ? p.effective_price : ""} onBlur={(e) => setPrice(p.id, e.target.value)} /></td><td><button onClick={() => setAvail(p.id, !p.is_available, p.availability_note_ar ?? undefined)}>{p.is_available ? t.menu.available : t.menu.unavailable}</button></td><td><input defaultValue={p.availability_note_ar ?? ""} onBlur={(e) => setAvail(p.id, p.is_available, e.target.value || undefined)} /></td></tr>)}</tbody></table></div></>; }
