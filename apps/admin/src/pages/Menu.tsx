import { Fragment, useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { t } from "../lib/t";
import { useList } from "./hooks";

interface Category { id: string; name_ar: string; sort_order: number; is_active: boolean }
interface Variant { id: string; name_ar: string; price_delta: string | number }
interface Product {
  id: string; category_id: string; name_ar: string; base_price: string | number; sku?: string | null;
  description_ar?: string | null; image_url?: string | null; ingredients_ar?: string | null; portion_note_ar?: string | null;
  cost_price?: string | number | null; prep_time_minutes?: number | null;
  sort_order: number; is_active: boolean; variants: Variant[]; modifier_group_ids: string[];
}
interface Group {
  id: string; name_ar: string; min_select: number; max_select: number; is_required: boolean;
  modifiers: Array<{ id: string; name_ar: string; price_delta: string | number }>;
}

type Tab = "categories" | "products" | "import" | "groups" | "branch";

// قالب تشغيل محافظ: لا نضيف صوص/شطة غير موجودين. الإضافات فقط هي التي تظهر كاختيارات.
const YK_EXTRAS = {
  name_ar: "إضافات",
  min_select: 0,
  max_select: 4,
  is_required: false,
  modifiers: [
    { name_ar: "جبنة", price_delta: 5 },
    { name_ar: "مخلل زيادة", price_delta: 3 },
    { name_ar: "عيش زيادة", price_delta: 2 },
  ],
};
const YK_SIZES = [
  { name_ar: "لقمة", price_delta: 0 },
  { name_ar: "هامر", price_delta: 10 },
];
const YAKEBDA_TEMPLATE = [
  { category: "ساندوتشات", name_ar: "ساندوتش كبدة", sku: "SAN-KBD", base_price: 25, ingredients_ar: "كبدة", portion_note_ar: "لقمة / هامر", variants: YK_SIZES, modifier_groups: [YK_EXTRAS] },
  { category: "ساندوتشات", name_ar: "ساندوتش سجق", sku: "SAN-SGG", base_price: 27, ingredients_ar: "سجق", portion_note_ar: "لقمة / هامر", variants: YK_SIZES, modifier_groups: [YK_EXTRAS] },
  { category: "ساندوتشات", name_ar: "ساندوتش كبدة ميكس", sku: "SAN-MIX", base_price: 30, ingredients_ar: "كبدة ميكس", portion_note_ar: "لقمة / هامر", variants: [{ name_ar: "لقمة", price_delta: 0 }, { name_ar: "هامر", price_delta: 15 }], modifier_groups: [YK_EXTRAS] },
  { category: "أطباق", name_ar: "طبق كبدة ربع كيلو", sku: "PLT-KBD-250", base_price: 60, ingredients_ar: "كبدة", portion_note_ar: "ربع كيلو" },
  { category: "أطباق", name_ar: "طبق كبدة نص كيلو", sku: "PLT-KBD-500", base_price: 105, ingredients_ar: "كبدة", portion_note_ar: "نص كيلو" },
  { category: "وجبات", name_ar: "وجبة كبدة كاملة", sku: "MEAL-KBD", base_price: 75, ingredients_ar: "ساندوتش كبدة + إضافة + مشروب", portion_note_ar: "كومبو" },
  { category: "إضافات", name_ar: "بطاطس", sku: "EXT-FRIES", base_price: 15, ingredients_ar: "بطاطس", portion_note_ar: "علبة" },
  { category: "إضافات", name_ar: "مخلل", sku: "EXT-PICKLES", base_price: 5, ingredients_ar: "مخلل", portion_note_ar: "علبة صغيرة" },
  { category: "إضافات", name_ar: "عيش زيادة", sku: "EXT-BREAD", base_price: 2, ingredients_ar: "عيش", portion_note_ar: "قطعة" },
  { category: "مشروبات", name_ar: "بيبسي", sku: "DRK-PEPSI", base_price: 10, ingredients_ar: "مشروب غازي", portion_note_ar: "كانز" },
  { category: "مشروبات", name_ar: "مياه", sku: "DRK-WATER", base_price: 5, ingredients_ar: "مياه معدنية", portion_note_ar: "زجاجة" },
];

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
        {tabs.map(([k, label]) => <button key={k} className={tab === k ? "active" : ""} onClick={() => setTab(k)}>{label}</button>)}
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
      setName(""); setErr(""); reload();
    } catch (e: any) { setErr(e.message); }
  }
  async function toggle(c: Category) { await api(`/categories/${c.id}`, { method: "PATCH", body: { is_active: !c.is_active } }); reload(); }
  return <>{(error || err) && <div className="alert">{error || err}</div>}<div className="form-row"><input placeholder={t.menu.nameAr} value={name} onChange={(e) => setName(e.target.value)} /><button className="primary" onClick={add} disabled={!name}>{t.menu.addCategory}</button></div><div className="panel"><table><thead><tr><th>{t.menu.nameAr}</th><th>{t.menu.sortOrder}</th><th></th></tr></thead><tbody>{data.map((c) => <tr key={c.id}><td>{c.name_ar}</td><td>{c.sort_order}</td><td><button onClick={() => toggle(c)}>{c.is_active ? t.common.active : t.common.inactive}</button></td></tr>)}</tbody></table></div></>;
}

function ProductsTab() {
  const cats = useList<Category>("/categories");
  const groups = useList<Group>("/modifier-groups");
  const { data, error, reload } = useList<Product>("/products");
  const [form, setForm] = useState({ name_ar: "", category_id: "", base_price: 0, sku: "", image_url: "", ingredients_ar: "", portion_note_ar: "", description_ar: "" });
  const [expanded, setExpanded] = useState("");
  const [vName, setVName] = useState("لقمة");
  const [vDelta, setVDelta] = useState(0);
  const [err, setErr] = useState("");

  useEffect(() => { if (!form.category_id && cats.data.length) setForm((f) => ({ ...f, category_id: cats.data[0].id })); }, [cats.data]);

  async function add() {
    try {
      const created = await api<{ data: Product }>("/products", { method: "POST", body: { ...form, sku: form.sku || null, image_url: form.image_url || null, ingredients_ar: form.ingredients_ar || null, portion_note_ar: form.portion_note_ar || null, description_ar: form.description_ar || null, base_price: Number(form.base_price), sort_order: data.length } });
      if (cats.data.find((c) => c.id === form.category_id)?.name_ar === "ساندوتشات") {
        await api(`/products/${created.data.id}/variants`, { method: "POST", body: { name_ar: "لقمة", price_delta: 0 } });
        await api(`/products/${created.data.id}/variants`, { method: "POST", body: { name_ar: "هامر", price_delta: 10 } });
      }
      setForm({ ...form, name_ar: "", base_price: 0, sku: "", image_url: "", ingredients_ar: "", portion_note_ar: "", description_ar: "" });
      setErr(""); reload();
    } catch (e: any) { setErr(e.message); }
  }
  async function patch(id: string, body: Record<string, unknown>) { try { await api(`/products/${id}`, { method: "PATCH", body }); setErr(""); reload(); } catch (e: any) { setErr(e.message); } }
  async function addVariant(p: Product) { try { await api(`/products/${p.id}/variants`, { method: "POST", body: { name_ar: vName, price_delta: vDelta } }); setVName(""); setVDelta(0); setErr(""); reload(); } catch (e: any) { setErr(e.message); } }
  async function toggleGroup(p: Product, gid: string) {
    const next = p.modifier_group_ids.includes(gid) ? p.modifier_group_ids.filter((x) => x !== gid) : [...p.modifier_group_ids, gid];
    try { await api(`/products/${p.id}/modifier-groups`, { method: "PUT", body: { modifier_group_ids: next } }); setErr(""); reload(); } catch (e: any) { setErr(e.message); }
  }

  return (
    <>
      {(error || err) && <div className="alert">{error || err}</div>}
      <div className="form-row menu-product-form">
        <input placeholder="اسم الصنف" value={form.name_ar} onChange={(e) => setForm({ ...form, name_ar: e.target.value })} />
        <select value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })}>{cats.data.map((c) => <option key={c.id} value={c.id}>{c.name_ar}</option>)}</select>
        <input type="number" min={0} placeholder="السعر" value={form.base_price} onChange={(e) => setForm({ ...form, base_price: Number(e.target.value) })} />
        <input placeholder="SKU" dir="ltr" value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
        <input placeholder="رابط الصورة" dir="ltr" value={form.image_url} onChange={(e) => setForm({ ...form, image_url: e.target.value })} />
        <input placeholder="المكونات" value={form.ingredients_ar} onChange={(e) => setForm({ ...form, ingredients_ar: e.target.value })} />
        <input placeholder="الحجم/الوصف: لقمة / هامر" value={form.portion_note_ar} onChange={(e) => setForm({ ...form, portion_note_ar: e.target.value })} />
        <button className="primary" onClick={add} disabled={!form.name_ar || !form.category_id}>إضافة صنف كامل</button>
      </div>
      <div className="panel"><table><thead><tr><th>الصنف</th><th>الفئة</th><th>السعر</th><th>التفاصيل</th><th>الأحجام</th><th></th></tr></thead><tbody>
        {data.map((p) => <Fragment key={p.id}><tr><td><b>{p.name_ar}</b><div className="muted">{p.sku || "بدون SKU"}</div></td><td>{cats.data.find((c) => c.id === p.category_id)?.name_ar}</td><td><input type="number" min={0} defaultValue={Number(p.base_price)} style={{ width: 90 }} onBlur={(e) => Number(e.target.value) !== Number(p.base_price) && patch(p.id, { base_price: Number(e.target.value) })} /></td><td><div>{p.ingredients_ar || "—"}</div><div className="muted">{p.portion_note_ar || "—"}</div></td><td>{p.variants.map((v) => v.name_ar).join("، ") || "—"}</td><td><button onClick={() => setExpanded(expanded === p.id ? "" : p.id)}>{expanded === p.id ? t.pos.close : t.orders.details}</button>{" "}<button onClick={() => patch(p.id, { is_active: !p.is_active })}>{p.is_active ? t.common.active : t.common.inactive}</button></td></tr>{expanded === p.id && <tr><td colSpan={6}><div className="form-row"><input placeholder="اسم الصنف" defaultValue={p.name_ar} onBlur={(e) => patch(p.id, { name_ar: e.target.value })} /><input placeholder="المكونات" defaultValue={p.ingredients_ar ?? ""} onBlur={(e) => patch(p.id, { ingredients_ar: e.target.value || null })} /><input placeholder="الحجم/وصف الحصة" defaultValue={p.portion_note_ar ?? ""} onBlur={(e) => patch(p.id, { portion_note_ar: e.target.value || null })} /><input placeholder="رابط الصورة" dir="ltr" defaultValue={p.image_url ?? ""} onBlur={(e) => patch(p.id, { image_url: e.target.value || null })} /></div><div className="form-row"><input placeholder="اسم الحجم" value={vName} onChange={(e) => setVName(e.target.value)} /><input type="number" placeholder={t.menu.priceDelta} value={vDelta} onChange={(e) => setVDelta(Number(e.target.value))} /><button onClick={() => addVariant(p)} disabled={!vName}>{t.menu.addVariant}</button></div><div className="mod-group-name">الإضافات المرتبطة بالصنف</div><div className="seg wrap">{groups.data.map((g) => <button key={g.id} className={p.modifier_group_ids.includes(g.id) ? "active" : ""} onClick={() => toggleGroup(p, g.id)}>{g.name_ar}</button>)}</div></td></tr>}</Fragment>)}
      </tbody></table></div>
    </>
  );
}

function ImportTab() {
  const [text, setText] = useState(JSON.stringify({ items: YAKEBDA_TEMPLATE }, null, 2));
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const stats = useMemo(() => { try { const p = JSON.parse(text); return Array.isArray(p) ? p.length : p.items?.length ?? 0; } catch { return 0; } }, [text]);
  async function runImport() {
    try { const parsed = JSON.parse(text); const items = Array.isArray(parsed) ? parsed : parsed.items; const res = await api<{ data: { created: number; updated: number; total: number } }>("/products/import", { method: "POST", body: { items } }); setMsg(`تم الاستيراد: ${res.data.total} صنف — جديد ${res.data.created} / تحديث ${res.data.updated}`); setErr(""); }
    catch (e: any) { setErr(e.message); }
  }
  return <div className="import-grid"><div className="panel import-panel"><h3>استيراد منيو يا كبدة</h3><p className="muted">الصيغة JSON. القالب لا يحتوي على اختيارات صوص/شطة. عدّل القائمة والأسعار حسب المنيو الرسمي ثم استورد.</p>{err && <div className="alert">{err}</div>}{msg && <div className="ok">{msg}</div>}<div className="form-row"><button className="primary" onClick={() => setText(JSON.stringify({ items: YAKEBDA_TEMPLATE }, null, 2))}>تحميل قالب يا كبدة</button><button onClick={runImport} disabled={!stats}>استيراد {stats} صنف</button></div><textarea className="json-import" dir="ltr" value={text} onChange={(e) => setText(e.target.value)} /></div></div>;
}

function GroupsTab() {
  const { data, error, reload } = useList<Group>("/modifier-groups");
  const [gName, setGName] = useState("");
  const [maxSelect, setMaxSelect] = useState(1);
  const [required, setRequired] = useState(false);
  const [mName, setMName] = useState("");
  const [mDelta, setMDelta] = useState(0);
  const [target, setTarget] = useState("");
  const [err, setErr] = useState("");
  async function addGroup() { try { await api("/modifier-groups", { method: "POST", body: { name_ar: gName, max_select: maxSelect, is_required: required, min_select: required ? 1 : 0, sort_order: data.length } }); setGName(""); setErr(""); reload(); } catch (e: any) { setErr(e.message); } }
  async function addModifier() { try { await api(`/modifier-groups/${target}/modifiers`, { method: "POST", body: { name_ar: mName, price_delta: mDelta } }); setMName(""); setMDelta(0); setErr(""); reload(); } catch (e: any) { setErr(e.message); } }
  useEffect(() => { if (!target && data.length) setTarget(data[0].id); }, [data]);
  return <>{(error || err) && <div className="alert">{error || err}</div>}<div className="form-row"><input placeholder="اسم مجموعة الإضافات" value={gName} onChange={(e) => setGName(e.target.value)} /><input type="number" min={1} title={t.menu.maxSelect} value={maxSelect} onChange={(e) => setMaxSelect(Number(e.target.value))} /><label><input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} /> {t.menu.required}</label><button className="primary" onClick={addGroup} disabled={!gName}>{t.menu.addGroup}</button></div><div className="form-row"><select value={target} onChange={(e) => setTarget(e.target.value)}>{data.map((g) => <option key={g.id} value={g.id}>{g.name_ar}</option>)}</select><input placeholder="اسم الإضافة" value={mName} onChange={(e) => setMName(e.target.value)} /><input type="number" placeholder={t.menu.priceDelta} value={mDelta} onChange={(e) => setMDelta(Number(e.target.value))} /><button className="primary" onClick={addModifier} disabled={!mName || !target}>{t.menu.addModifier}</button></div><div className="panel"><table><thead><tr><th>{t.menu.groups}</th><th>{t.menu.maxSelect}</th><th>{t.menu.required}</th><th>الإضافات</th></tr></thead><tbody>{data.map((g) => <tr key={g.id}><td>{g.name_ar}</td><td>{g.max_select}</td><td>{g.is_required ? "نعم" : "لا"}</td><td>{g.modifiers.map((m) => `${m.name_ar}${Number(m.price_delta) ? ` (+${Number(m.price_delta)})` : ""}`).join("، ")}</td></tr>)}</tbody></table></div></>;
}

function BranchTab() {
  const branches = useList<{ id: string; name: string }>("/branches");
  const [branchId, setBranchId] = useState("");
  const [rows, setRows] = useState<Array<{ id: string; name_ar: string; base_price: string | number; effective_price: number; is_available: boolean; availability_note_ar?: string | null }>>([]);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  useEffect(() => { if (!branchId && branches.data.length) setBranchId(branches.data[0].id); }, [branches.data]);
  async function load() { if (!branchId) return; const res = await api<{ data: { categories: Array<{ products: typeof rows }> } }>(`/branches/${branchId}/menu`); setRows(res.data.categories.flatMap((c) => c.products)); }
  useEffect(() => { load().catch((e) => setErr(e.message)); }, [branchId]);
  async function setPrice(productId: string, value: string) { try { await api(`/branches/${branchId}/menu-prices`, { method: "PATCH", body: { items: [{ product_id: productId, price_override: value === "" ? null : Number(value) }] } }); setMsg(t.common.save + " ✓"); setErr(""); load(); } catch (e: any) { setErr(e.message); } }
  async function setAvail(productId: string, is_available: boolean, note?: string) { try { await api(`/branches/${branchId}/menu-availability`, { method: "PATCH", body: { items: [{ product_id: productId, is_available, availability_note_ar: note ?? null }] } }); setMsg(t.common.save + " ✓"); setErr(""); load(); } catch (e: any) { setErr(e.message); } }
  return <>{err && <div className="alert">{err}</div>}{msg && <div className="ok">{msg}</div>}<div className="form-row"><label>{t.menu.chooseBranch}</label><select value={branchId} onChange={(e) => setBranchId(e.target.value)}>{branches.data.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div><div className="panel"><table><thead><tr><th>{t.menu.products}</th><th>{t.menu.basePrice}</th><th>{t.menu.priceOverride}</th><th>{t.menu.available}</th><th>{t.menu.availabilityNote}</th></tr></thead><tbody>{rows.map((p) => <tr key={p.id}><td>{p.name_ar}</td><td>{Number(p.base_price).toFixed(2)}</td><td><input type="number" min={0} style={{ width: 100 }} defaultValue={p.effective_price !== Number(p.base_price) ? p.effective_price : ""} onBlur={(e) => setPrice(p.id, e.target.value)} /></td><td><button onClick={() => setAvail(p.id, !p.is_available, p.availability_note_ar ?? undefined)}>{p.is_available ? t.menu.available : t.menu.unavailable}</button></td><td><input defaultValue={p.availability_note_ar ?? ""} onBlur={(e) => setAvail(p.id, p.is_available, e.target.value || undefined)} /></td></tr>)}</tbody></table></div></>;
}
