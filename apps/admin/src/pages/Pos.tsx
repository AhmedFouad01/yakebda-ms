import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { t } from "../lib/t";
import { Receipt, FullOrder } from "../components/Receipt";
import { useMe } from "../lib/me";

interface MenuModifier { id: string; name_ar: string; price_delta: string | number }
interface MenuGroup { id: string; name_ar: string; min_select: number; max_select: number; is_required: boolean; modifiers: MenuModifier[] }
interface MenuVariant { id: string; name_ar: string; price_delta: string | number }
interface MenuProduct { id: string; name_ar: string; effective_price: number; is_available: boolean; image_url?: string | null; ingredients_ar?: string | null; portion_note_ar?: string | null; availability_note_ar?: string | null; variants: MenuVariant[]; modifier_groups: MenuGroup[] }
interface MenuCategory { id: string; name_ar: string; products: MenuProduct[] }
interface Branch { id: string; name: string }
interface Shift { id: string; opened_at: string; opening_cash: string | number; totals?: { cash_sales: number; card_sales: number; wallet_sales: number; expected_cash: number; orders_count: number } }
interface Settings { show_product_images: boolean; require_open_shift_for_cash: boolean; enabled_payment_methods: string[]; receipt_printing_enabled: boolean; allow_discounts: boolean }
interface CartLine { key: string; product: MenuProduct; variant?: MenuVariant | null; modifiers: MenuModifier[]; qty: number; notes: string }
interface AdminCategory { id: string; name_ar: string }
interface AdminProduct { id: string; category_id: string; name_ar: string; base_price: string | number; sku?: string | null; image_url?: string | null; ingredients_ar?: string | null; portion_note_ar?: string | null; is_active: boolean; variants: MenuVariant[] }

type OrderType = "takeaway" | "delivery";
type AdminPanel = "items" | "shift" | "offers" | null;
const CAT_ORDER = ["الكل", "ساندوتشات", "أطباق", "وجبات", "الحواوشي", "البطاطس", "فواتح الشهية", "إضافات", "مشروبات"];
const money = (v: number) => `${v.toFixed(2)} ${t.reports.egp}`;
const unitPrice = (l: CartLine) => l.product.effective_price + Number(l.variant?.price_delta ?? 0) + l.modifiers.reduce((s, m) => s + Number(m.price_delta), 0);
const catRank = (name: string) => { const i = CAT_ORDER.indexOf(name); return i === -1 ? 99 : i; };
function safeCalc(expression: string): string { const cleaned = expression.replace(/[×]/g, "*").replace(/[÷]/g, "/"); if (!/^[0-9+\-*/().\s]+$/.test(cleaned)) return "خطأ"; try { const result = Function(`"use strict"; return (${cleaned || 0})`)(); return Number.isFinite(result) ? String(Number(result.toFixed(2))) : "خطأ"; } catch { return "خطأ"; } }

export function Pos() {
  const [params] = useSearchParams();
  const { can } = useMe();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState(params.get("branch") ?? "");
  const [settings, setSettings] = useState<Settings | null>(null);
  const [shift, setShift] = useState<Shift | null>(null);
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [activeCat, setActiveCat] = useState("الكل");
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [picking, setPicking] = useState<MenuProduct | null>(null);
  const [orderType, setOrderType] = useState<OrderType>("takeaway");
  const [customers, setCustomers] = useState<Array<{ id: string; name: string; phone?: string; address?: string }>>([]);
  const [customerId, setCustomerId] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [deliveryFee, setDeliveryFee] = useState(0);
  const [discount, setDiscount] = useState(0);
  const [orderNotes, setOrderNotes] = useState("");
  const [payment, setPayment] = useState("cash");
  const [calc, setCalc] = useState("");
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState<FullOrder | null>(null);
  const [busy, setBusy] = useState(false);

  const [adminPanel, setAdminPanel] = useState<AdminPanel>(null);
  const [adminProducts, setAdminProducts] = useState<AdminProduct[]>([]);
  const [adminCategories, setAdminCategories] = useState<AdminCategory[]>([]);
  const [adminSearch, setAdminSearch] = useState("");
  const [editing, setEditing] = useState<AdminProduct | null>(null);
  const [editForm, setEditForm] = useState({ name_ar: "", base_price: 0, image_url: "", ingredients_ar: "", portion_note_ar: "" });

  useEffect(() => {
    api<{ data: Branch[] }>("/branches").then((r) => { setBranches(r.data); if (!branchId && r.data.length) setBranchId(r.data[0].id); });
    if (can("customers.manage")) api<{ data: typeof customers }>("/customers").then((r) => setCustomers(r.data)).catch(() => {});
  }, [can]);

  async function loadShift(b: string) { try { const r = await api<{ data: Shift | null }>(`/shifts/current?branch_id=${b}`); setShift(r.data); } catch { setShift(null); } }
  async function loadMenu(b = branchId) {
    if (!b) return;
    const r = await api<{ data: { categories: MenuCategory[] } }>(`/branches/${b}/menu`);
    const sorted = [...r.data.categories].sort((a, b) => catRank(a.name_ar) - catRank(b.name_ar));
    setCategories(sorted); setActiveCat("الكل");
  }
  useEffect(() => {
    if (!branchId) return;
    loadMenu(branchId).catch((e: any) => setError(e.message));
    api<{ data: Settings }>(`/settings?branch_id=${branchId}`).then((r) => { setSettings(r.data); setPayment((p) => (r.data.enabled_payment_methods.includes(p) ? p : r.data.enabled_payment_methods[0])); });
    loadShift(branchId);
  }, [branchId]);

  const allProducts = useMemo(() => categories.flatMap((c) => c.products), [categories]);
  const visible = useMemo(() => {
    if (search) return allProducts.filter((p) => p.name_ar.includes(search) || p.ingredients_ar?.includes(search) || p.portion_note_ar?.includes(search));
    if (activeCat === "الكل") return allProducts;
    return categories.find((c) => c.name_ar === activeCat)?.products ?? [];
  }, [categories, allProducts, activeCat, search]);
  const subtotal = cart.reduce((s, l) => s + unitPrice(l) * l.qty, 0);
  const total = Math.max(0, subtotal - discount) + (orderType === "delivery" ? deliveryFee : 0);
  const cashBlocked = payment === "cash" && !!settings?.require_open_shift_for_cash && !shift;
  const enabledMethods = settings?.enabled_payment_methods ?? ["cash", "card", "wallet", "unpaid"];
  const itemCount = cart.reduce((s, l) => s + l.qty, 0);

  function addProduct(p: MenuProduct, variant?: MenuVariant | null, modifiers: MenuModifier[] = []) {
    const key = `${p.id}|${variant?.id ?? ""}|${modifiers.map((m) => m.id).sort().join(",")}`;
    setCart((c) => { const found = c.find((l) => l.key === key && !l.notes); if (found) return c.map((l) => (l === found ? { ...l, qty: l.qty + 1 } : l)); return [...c, { key, product: p, variant, modifiers, qty: 1, notes: "" }]; });
  }
  function quickAdd(p: MenuProduct) { if (!p.is_available) return; addProduct(p, p.variants[0] ?? null, []); }
  function quickRemove(p: MenuProduct) { setCart((rows) => { const idx = rows.findIndex((l) => l.product.id === p.id); if (idx === -1) return rows; return rows.flatMap((l, i) => i !== idx ? [l] : l.qty > 1 ? [{ ...l, qty: l.qty - 1 }] : []); }); }
  function productQty(p: MenuProduct) { return cart.filter((l) => l.product.id === p.id).reduce((s, l) => s + l.qty, 0); }
  function pick(p: MenuProduct) { if (!p.is_available) return; if (p.variants.length || p.modifier_groups.length) setPicking(p); else addProduct(p); }

  async function openShift() { const cash = window.prompt(t.shift.openingCash, "0"); if (cash == null) return; try { await api("/shifts/open", { method: "POST", body: { branch_id: branchId, opening_cash: Number(cash) || 0 } }); await loadShift(branchId); setError(""); } catch (e: any) { setError(e.message); } }
  async function closeShift() { if (!shift) return; const cash = window.prompt(t.shift.closingCash, "0"); if (cash == null) return; try { await api(`/shifts/${shift.id}/close`, { method: "POST", body: { actual_cash: Number(cash) || 0 } }); await loadShift(branchId); setError(""); } catch (e: any) { setError(e.message); } }
  async function fireOrder(opts: { submit: boolean; pay: boolean; print: boolean }) {
    setError(""); setMsg(""); if (!cart.length || busy) return; setBusy(true);
    try {
      const res = await api<{ data: FullOrder }>("/orders", { method: "POST", body: { branch_id: branchId, order_type: orderType, table_id: null, customer_id: orderType === "delivery" && customerId ? customerId : null, delivery_address: orderType === "delivery" ? deliveryAddress || null : null, delivery_fee: orderType === "delivery" ? deliveryFee : 0, submit: opts.submit, discount: settings?.allow_discounts ? discount : 0, notes: orderNotes || null, items: cart.map((l) => ({ product_id: l.product.id, variant_id: l.variant?.id ?? null, qty: l.qty, notes: l.notes || null, modifier_ids: l.modifiers.map((m) => m.id) })) }});
      let order = res.data;
      if (opts.pay && payment !== "unpaid") await api(`/orders/${order.id}/payments`, { method: "POST", body: { method: payment, amount: Number(order.total) } });
      if (opts.print && settings?.receipt_printing_enabled) await api(`/orders/${order.id}/print`, { method: "POST", body: {} });
      order = (await api<{ data: FullOrder }>(`/orders/${order.id}`)).data;
      setDone(order); setCart([]); setDiscount(0); setOrderNotes(""); setMsg(`${t.pos.orderCreated} ${order.order_no}`); await loadShift(branchId);
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  }
  function calcPress(k: string) { if (k === "C") return setCalc(""); if (k === "⌫") return setCalc((v) => v.slice(0, -1)); if (k === "=") return setCalc((v) => safeCalc(v)); if (k === "خصم") return setDiscount(Number(calc || 0)); if (k === "دليفري") return setDeliveryFee(Number(calc || 0)); setCalc((v) => v + k); }

  async function loadAdminProducts() {
    const [ps, cs] = await Promise.all([api<{ data: AdminProduct[] }>("/products"), api<{ data: AdminCategory[] }>("/categories")]);
    setAdminProducts(ps.data); setAdminCategories(cs.data);
  }
  async function openItemsPanel() { setAdminPanel("items"); setEditing(null); setError(""); try { await loadAdminProducts(); } catch (e: any) { setError(e.message); } }
  function startEdit(p: AdminProduct | MenuProduct) {
    const row = "base_price" in p ? p : { ...p, category_id: "", base_price: p.effective_price, is_active: p.is_available, sku: null, variants: p.variants } as AdminProduct;
    setEditing(row);
    setEditForm({ name_ar: row.name_ar, base_price: Number(row.base_price), image_url: row.image_url ?? "", ingredients_ar: row.ingredients_ar ?? "", portion_note_ar: row.portion_note_ar ?? "" });
    setAdminPanel("items");
  }
  async function saveProduct() {
    if (!editing) return;
    try {
      await api(`/products/${editing.id}`, { method: "PATCH", body: { name_ar: editForm.name_ar, base_price: Number(editForm.base_price), image_url: editForm.image_url || null, ingredients_ar: editForm.ingredients_ar || null, portion_note_ar: editForm.portion_note_ar || null } });
      setEditing(null); setMsg("تم حفظ الصنف"); await loadAdminProducts(); await loadMenu();
    } catch (e: any) { setError(e.message); }
  }
  async function toggleProduct(p: AdminProduct) {
    try { await api(`/products/${p.id}`, { method: "PATCH", body: { is_active: !p.is_active } }); await loadAdminProducts(); await loadMenu(); } catch (e: any) { setError(e.message); }
  }
  const adminVisible = adminProducts.filter((p) => !adminSearch || p.name_ar.includes(adminSearch) || p.sku?.includes(adminSearch));

  return (
    <div className="posx" dir="rtl">
      <header className="posx-head">
        <div className="posx-brand"><div className="posx-brand-mark">يا كبدة</div><div><strong>نظام الكاشير</strong><span>Fast Food POS</span></div></div>
        <select value={branchId} onChange={(e) => setBranchId(e.target.value)}>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
        <div className={shift ? "posx-shift on" : "posx-shift off"}>{shift ? t.shift.openTitle : t.shift.noShift}{can("shifts.manage") && <button onClick={shift ? closeShift : openShift}>{shift ? t.shift.close : t.shift.open}</button>}</div>
        {can("menu.manage") && <button className="posx-admin-link" onClick={openItemsPanel}>إدارة الأصناف</button>}
        {can("shifts.manage") && <button className="posx-admin-link" onClick={() => setAdminPanel("shift")}>إدارة الشيفت</button>}
        <button className="posx-admin-link muted" onClick={() => setAdminPanel("offers")}>إدارة العروض</button>
        <input className="posx-search" placeholder="ابحث باسم الصنف أو المكونات…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </header>

      <div className="posx-body">
        <section className="posx-menu">
          <div className="posx-cats"><button className={activeCat === "الكل" && !search ? "active" : ""} onClick={() => { setActiveCat("الكل"); setSearch(""); }}>الكل</button>{categories.map((c) => <button key={c.id} className={c.name_ar === activeCat && !search ? "active" : ""} onClick={() => { setActiveCat(c.name_ar); setSearch(""); }}>{c.name_ar}</button>)}</div>
          <div className="posx-grid">
            {visible.map((p) => { const qty = productQty(p); return <div key={p.id} className={p.is_available ? "posx-card" : "posx-card off"} onClick={() => pick(p)}>{settings?.show_product_images !== false && (p.image_url ? <img className="posx-card-img" src={p.image_url} alt={p.name_ar} /> : <span className="posx-card-img ph">{p.name_ar.trim().charAt(0)}</span>)}<span className="posx-card-name">{p.name_ar}</span>{p.portion_note_ar && <span className="posx-card-size">{p.portion_note_ar}</span>}<span className="posx-card-price">{money(p.effective_price)}</span>{p.ingredients_ar && <span className="posx-card-ing">{p.ingredients_ar}</span>}{!p.is_available && <span className="posx-card-off">{p.availability_note_ar ?? t.menu.unavailable}</span>}<div className="posx-card-actions" onClick={(e) => e.stopPropagation()}><button onClick={() => quickRemove(p)} disabled={!qty}>−</button><span>{qty}</span><button onClick={() => quickAdd(p)} disabled={!p.is_available}>+</button>{(p.variants.length > 0 || p.modifier_groups.length > 0) && <button className="details" onClick={() => pick(p)}>تفاصيل</button>}{can("menu.manage") && <button className="details edit" onClick={() => startEdit(p)}>تعديل</button>}</div></div>; })}
          </div>
        </section>

        <aside className="posx-cart">
          <div className="posx-cart-head"><h3>{t.pos.cart}</h3><strong>{itemCount} صنف</strong></div>
          <div className="posx-shift-stats"><div><span>افتتاحي</span><b>{money(Number(shift?.opening_cash ?? 0))}</b></div><div><span>نقدي</span><b>{money(Number(shift?.totals?.cash_sales ?? 0))}</b></div><div><span>طلبات</span><b>{shift?.totals?.orders_count ?? 0}</b></div><div><span>متوقع</span><b>{money(Number(shift?.totals?.expected_cash ?? 0))}</b></div></div>
          {error && <div className="alert dark-alert">{error}</div>}{msg && <div className="ok dark-ok">{msg}</div>}
          <div className="posx-cart-lines">{!cart.length && <div className="posx-empty">{t.pos.emptyCart}</div>}{cart.map((l, idx) => <div key={idx} className="posx-line"><div className="posx-line-head"><span>{l.product.name_ar}{l.variant ? ` (${l.variant.name_ar})` : ""}</span><span>{money(unitPrice(l) * l.qty)}</span></div>{l.modifiers.length > 0 && <div className="posx-line-mods">{l.modifiers.map((m) => m.name_ar).join("، ")}</div>}<div className="posx-line-actions"><button onClick={() => setCart((c) => c.map((x, i) => (i === idx ? { ...x, qty: x.qty + 1 } : x)))}>+</button><span>{l.qty}</span><button onClick={() => setCart((c) => c.map((x, i) => (i === idx && x.qty > 1 ? { ...x, qty: x.qty - 1 } : x)))}>−</button><button className="rm" onClick={() => setCart((c) => c.filter((_, i) => i !== idx))}>✕</button><input placeholder={t.pos.itemNotes} value={l.notes} onChange={(e) => setCart((c) => c.map((x, i) => (i === idx ? { ...x, notes: e.target.value } : x)))} /></div></div>)}</div>
          <div className="posx-opts"><div className="seg dark">{(["takeaway", "delivery"] as const).map((k) => <button key={k} className={orderType === k ? "active" : ""} onClick={() => setOrderType(k)}>{t.orders.types[k]}</button>)}</div>{orderType === "delivery" && <><select value={customerId} onChange={(e) => { setCustomerId(e.target.value); const c = customers.find((x) => x.id === e.target.value); if (c?.address) setDeliveryAddress(c.address); }}><option value="">{t.pos.customer}…</option>{customers.map((c) => <option key={c.id} value={c.id}>{c.name}{c.phone ? ` — ${c.phone}` : ""}</option>)}</select><input placeholder={t.pos.deliveryAddress} value={deliveryAddress} onChange={(e) => setDeliveryAddress(e.target.value)} /><input type="number" min={0} placeholder={t.pos.deliveryFee} value={deliveryFee || ""} onChange={(e) => setDeliveryFee(Number(e.target.value))} /></>}{settings?.allow_discounts !== false && <input type="number" min={0} placeholder={t.pos.discount} value={discount || ""} onChange={(e) => setDiscount(Number(e.target.value))} />}<input placeholder={t.pos.orderNotes} value={orderNotes} onChange={(e) => setOrderNotes(e.target.value)} /><div className="seg dark wrap">{enabledMethods.map((k) => <button key={k} className={payment === k ? "active" : ""} onClick={() => setPayment(k)}>{t.pos[k as "cash" | "card" | "wallet" | "unpaid"]}</button>)}</div>{cashBlocked && <div className="posx-warn">{t.shift.cashNeedsShift}</div>}</div>
          <details className="posx-calc-box"><summary>الآلة الحاسبة</summary><div className="posx-calc"><div className="posx-calc-display" dir="ltr">{calc || "0"}</div>{["7","8","9","÷","4","5","6","×","1","2","3","-","0",".","=","+","C","⌫","خصم","دليفري"].map((k) => <button key={k} onClick={() => calcPress(k)}>{k}</button>)}</div></details>
          <div className="posx-totals"><div className="receipt-row"><span>{t.pos.subtotal}</span><span>{money(subtotal)}</span></div>{discount > 0 && <div className="receipt-row"><span>{t.pos.discount}</span><span>{money(discount)}</span></div>}{orderType === "delivery" && deliveryFee > 0 && <div className="receipt-row"><span>{t.pos.deliveryFee}</span><span>{money(deliveryFee)}</span></div>}<div className="receipt-row posx-total"><span>{t.pos.total}</span><span>{money(total)}</span></div></div>
          <div className="posx-fire"><button disabled={!cart.length || busy} onClick={() => fireOrder({ submit: true, pay: false, print: false })}>{t.pos.kot}</button><button disabled={!cart.length || busy} onClick={() => fireOrder({ submit: false, pay: false, print: false })}>{t.pos.bill}</button><button className="hot" disabled={!cart.length || busy || payment === "unpaid" || cashBlocked} onClick={() => fireOrder({ submit: true, pay: true, print: false })}>{t.pos.billPay}</button>{settings?.receipt_printing_enabled && <button className="hot" disabled={!cart.length || busy || cashBlocked} onClick={() => fireOrder({ submit: true, pay: payment !== "unpaid", print: true })}>{t.pos.billPrint}</button>}<button className="ghost" disabled={!cart.length} onClick={() => setCart([])}>{t.pos.clear}</button></div>
        </aside>
      </div>

      {picking && <OptionPicker product={picking} onCancel={() => setPicking(null)} onAdd={(variant, mods) => { addProduct(picking, variant, mods); setPicking(null); }} />}
      {done && <div className="modal-back" onClick={() => setDone(null)}><div className="modal receipt-modal" onClick={(e) => e.stopPropagation()}><Receipt order={done} /><div className="pos-actions">{settings?.receipt_printing_enabled && <button className="primary" onClick={async () => { try { await api(`/orders/${done.id}/print`, { method: "POST", body: {} }); setMsg(`${t.pos.orderCreated} ${done.order_no} — ${t.pos.printReceipt} ✓`); } catch (e: any) { setError(e.message); } }}>{t.pos.printReceipt}</button>}<button onClick={() => setDone(null)}>{t.pos.close}</button></div></div></div>}
      {adminPanel && <div className="modal-back" onClick={() => setAdminPanel(null)}><div className="modal posx-admin-modal" onClick={(e) => e.stopPropagation()}>{adminPanel === "items" && <ItemManager products={adminVisible} categories={adminCategories} search={adminSearch} setSearch={setAdminSearch} editing={editing} editForm={editForm} setEditForm={setEditForm} startEdit={startEdit} saveProduct={saveProduct} cancelEdit={() => setEditing(null)} toggleProduct={toggleProduct} />}{adminPanel === "shift" && <ShiftPanel shift={shift} money={money} openShift={openShift} closeShift={closeShift} />}{adminPanel === "offers" && <OffersPanel />}</div></div>}
    </div>
  );
}

function ItemManager({ products, categories, search, setSearch, editing, editForm, setEditForm, startEdit, saveProduct, cancelEdit, toggleProduct }: { products: AdminProduct[]; categories: AdminCategory[]; search: string; setSearch: (v: string) => void; editing: AdminProduct | null; editForm: { name_ar: string; base_price: number; image_url: string; ingredients_ar: string; portion_note_ar: string }; setEditForm: (v: { name_ar: string; base_price: number; image_url: string; ingredients_ar: string; portion_note_ar: string }) => void; startEdit: (p: AdminProduct) => void; saveProduct: () => void; cancelEdit: () => void; toggleProduct: (p: AdminProduct) => void }) {
  return <div className="posx-admin-grid"><section><h3>إدارة الأصناف</h3><input className="posx-admin-search" placeholder="ابحث عن صنف أو SKU" value={search} onChange={(e) => setSearch(e.target.value)} /><div className="posx-admin-list">{products.map((p) => <div key={p.id} className={p.is_active ? "posx-admin-row" : "posx-admin-row off"><div><b>{p.name_ar}</b><span>{categories.find((c) => c.id === p.category_id)?.name_ar ?? "—"} · {Number(p.base_price).toFixed(2)} ج.م</span></div><button onClick={() => startEdit(p)}>تعديل</button><button onClick={() => toggleProduct(p)}>{p.is_active ? "تعطيل" : "تفعيل"}</button></div>)}</div></section><section className="posx-edit-card"><h3>{editing ? "تعديل الصنف" : "اختار صنف للتعديل"}</h3>{editing ? <><div className="image-rec">الصورة المقترحة: مربعة 1:1 — 800×800px — JPG/WebP — أقل من 400KB</div>{editForm.image_url && <img className="posx-edit-preview" src={editForm.image_url} alt={editForm.name_ar} />}<label>اسم الصنف<input value={editForm.name_ar} onChange={(e) => setEditForm({ ...editForm, name_ar: e.target.value })} /></label><label>السعر<input type="number" min={0} value={editForm.base_price} onChange={(e) => setEditForm({ ...editForm, base_price: Number(e.target.value) })} /></label><label>رابط صورة مربعة<input dir="ltr" value={editForm.image_url} onChange={(e) => setEditForm({ ...editForm, image_url: e.target.value })} /></label><label>المكونات<input value={editForm.ingredients_ar} onChange={(e) => setEditForm({ ...editForm, ingredients_ar: e.target.value })} /></label><label>وصف الحجم/الحصة<input value={editForm.portion_note_ar} onChange={(e) => setEditForm({ ...editForm, portion_note_ar: e.target.value })} /></label><div className="pos-actions"><button className="primary" onClick={saveProduct}>حفظ</button><button onClick={cancelEdit}>إلغاء</button></div><p className="muted">رفع الصور كملف مباشر يحتاج endpoint تخزين ملفات. الحالي يدعم رابط صورة مع preview.</p></> : <p className="muted">اضغط تعديل أمام أي صنف. كل تغيير في السعر أو الاسم أو الصورة ينعكس مباشرة على POS بعد الحفظ.</p>}</section></div>;
}

function ShiftPanel({ shift, money, openShift, closeShift }: { shift: Shift | null; money: (v: number) => string; openShift: () => void; closeShift: () => void }) {
  return <div><h3>إدارة الشيفت</h3><div className="posx-shift-stats large"><div><span>حالة الشيفت</span><b>{shift ? "مفتوح" : "مغلق"}</b></div><div><span>افتتاحي</span><b>{money(Number(shift?.opening_cash ?? 0))}</b></div><div><span>نقدي</span><b>{money(Number(shift?.totals?.cash_sales ?? 0))}</b></div><div><span>طلبات</span><b>{shift?.totals?.orders_count ?? 0}</b></div><div><span>المتوقع</span><b>{money(Number(shift?.totals?.expected_cash ?? 0))}</b></div></div><div className="pos-actions"><button className="primary" onClick={shift ? closeShift : openShift}>{shift ? "إغلاق الشيفت" : "فتح شيفت"}</button></div></div>;
}

function OffersPanel() {
  return <div><h3>إدارة العروض</h3><p className="muted">العروض لم تُفعّل كـ backend module في YKMS-02D. الخصم اليدوي الحالي مرتبط بالفاتورة والتقارير. تنفيذ العروض يحتاج جدول rules وربطها بالمنتجات قبل الدفع.</p></div>;
}

function OptionPicker({ product, onAdd, onCancel }: { product: MenuProduct; onAdd: (variant: MenuVariant | null, mods: MenuModifier[]) => void; onCancel: () => void }) {
  const [variant, setVariant] = useState<MenuVariant | null>(product.variants[0] ?? null);
  const [mods, setMods] = useState<MenuModifier[]>([]);
  function toggleMod(g: MenuGroup, m: MenuModifier) { setMods((cur) => { if (cur.some((x) => x.id === m.id)) return cur.filter((x) => x.id !== m.id); const inGroup = cur.filter((x) => g.modifiers.some((gm) => gm.id === x.id)); if (inGroup.length >= g.max_select) return cur; return [...cur, m]; }); }
  const valid = product.modifier_groups.every((g) => { const n = mods.filter((x) => g.modifiers.some((gm) => gm.id === x.id)).length; return n >= (g.is_required ? Math.max(1, g.min_select) : g.min_select); });
  return <div className="modal-back" onClick={onCancel}><div className="modal posx-picker" onClick={(e) => e.stopPropagation()} dir="rtl"><h3>{t.pos.chooseOptions} — {product.name_ar}</h3>{product.ingredients_ar && <p className="muted">{product.ingredients_ar}</p>}{product.variants.length > 0 && <div className="seg wrap">{product.variants.map((v) => <button key={v.id} className={variant?.id === v.id ? "active" : ""} onClick={() => setVariant(v)}>{v.name_ar}{Number(v.price_delta) ? ` (+${Number(v.price_delta)})` : ""}</button>)}</div>}{product.modifier_groups.map((g) => <div key={g.id} className="mod-group"><div className="mod-group-name">{g.name_ar} {g.is_required ? `— ${t.menu.required}` : ""}</div><div className="seg wrap">{g.modifiers.map((m) => <button key={m.id} className={mods.some((x) => x.id === m.id) ? "active" : ""} onClick={() => toggleMod(g, m)}>{m.name_ar}{Number(m.price_delta) ? ` (+${Number(m.price_delta)})` : ""}</button>)}</div></div>)}<div className="pos-actions"><button className="primary" disabled={!valid} onClick={() => onAdd(variant, mods)}>{t.pos.addToCart}</button><button onClick={onCancel}>{t.common.cancel}</button></div></div></div>;
}
