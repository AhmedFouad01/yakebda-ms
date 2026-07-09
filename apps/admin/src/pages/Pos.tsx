import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { t } from "../lib/t";
import { Receipt, FullOrder } from "../components/Receipt";
import { brand } from "../config/brand";

interface MenuModifier { id: string; name_ar: string; price_delta: string | number }
interface MenuGroup { id: string; name_ar: string; min_select: number; max_select: number; is_required: boolean; modifiers: MenuModifier[] }
interface MenuVariant { id: string; name_ar: string; price_delta: string | number }
interface MenuProduct {
  id: string; name_ar: string; effective_price: number; is_available: boolean;
  availability_note_ar?: string | null; variants: MenuVariant[]; modifier_groups: MenuGroup[];
}
interface MenuCategory { id: string; name_ar: string; products: MenuProduct[] }
interface Branch { id: string; name: string }
interface CartLine {
  key: string; product: MenuProduct; variant?: MenuVariant | null;
  modifiers: MenuModifier[]; qty: number; notes: string;
}
interface ShiftSummary {
  id: string; branch_id: string; opened_at: string; opening_cash: string | number; status: string;
  totals: { cash_sales: number; card_sales: number; wallet_sales: number; cash_in: number; cash_out: number; expected_cash: number; orders_count: number };
}

const money = (v: number) => `${v.toFixed(2)} ${t.reports.egp}`;
const unitPrice = (l: CartLine) =>
  l.product.effective_price + Number(l.variant?.price_delta ?? 0) + l.modifiers.reduce((s, m) => s + Number(m.price_delta), 0);

export function Pos() {
  const [params] = useSearchParams();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState(params.get("branch") ?? "");
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [activeCat, setActiveCat] = useState("");
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [picking, setPicking] = useState<MenuProduct | null>(null);
  const [orderType, setOrderType] = useState<"dine_in" | "takeaway" | "delivery">(params.get("table") ? "dine_in" : "takeaway");
  const [tableId, setTableId] = useState(params.get("table") ?? "");
  const [tables, setTables] = useState<Array<{ id: string; name_ar: string; status: string }>>([]);
  const [customers, setCustomers] = useState<Array<{ id: string; name: string; phone?: string; address?: string }>>([]);
  const [customerId, setCustomerId] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [deliveryFee, setDeliveryFee] = useState(0);
  const [discount, setDiscount] = useState(0);
  const [orderNotes, setOrderNotes] = useState("");
  const [payment, setPayment] = useState<"cash" | "card" | "wallet" | "unpaid">("cash");
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState<FullOrder | null>(null);
  const [busy, setBusy] = useState(false);
  const [shift, setShift] = useState<ShiftSummary | null>(null);
  const [openingCash, setOpeningCash] = useState(500);
  const [actualCash, setActualCash] = useState(0);
  const [moveAmount, setMoveAmount] = useState(0);
  const [moveReason, setMoveReason] = useState("");

  async function loadShift(nextBranchId = branchId) {
    if (!nextBranchId) return;
    const r = await api<{ data: ShiftSummary | null }>(`/shifts/current?branch_id=${nextBranchId}`).catch(() => ({ data: null }));
    setShift(r.data);
    if (r.data) setActualCash(Number(r.data.totals.expected_cash ?? 0));
  }

  async function openShift() {
    setError(""); setMsg("");
    try {
      const r = await api<{ data: ShiftSummary }>("/shifts/open", { method: "POST", body: { branch_id: branchId, opening_cash: openingCash } });
      setShift(r.data);
      setActualCash(Number(r.data.totals.expected_cash ?? openingCash));
      setMsg(`${t.pos.openShift} ✓`);
    } catch (e: any) { setError(e.message); }
  }

  async function cashMove(type: "cash-in" | "cash-out") {
    if (!shift || moveAmount <= 0 || !moveReason) return;
    setError(""); setMsg("");
    try {
      const r = await api<{ data: ShiftSummary }>(`/shifts/${shift.id}/${type}`, { method: "POST", body: { amount: moveAmount, reason: moveReason } });
      setShift(r.data); setActualCash(Number(r.data.totals.expected_cash)); setMoveAmount(0); setMoveReason(""); setMsg(`${type === "cash-in" ? t.pos.cashIn : t.pos.cashOut} ✓`);
    } catch (e: any) { setError(e.message); }
  }

  async function closeShift() {
    if (!shift) return;
    setError(""); setMsg("");
    try {
      const r = await api<{ data: ShiftSummary }>(`/shifts/${shift.id}/close`, { method: "POST", body: { actual_cash: actualCash } });
      setShift(null); setMsg(`${t.pos.closeShift} ✓ — المتوقع ${money(Number(r.data.totals.expected_cash))}`);
    } catch (e: any) { setError(e.message); }
  }

  useEffect(() => {
    api<{ data: Branch[] }>("/branches").then((r) => {
      setBranches(r.data);
      const initial = branchId || r.data[0]?.id || "";
      if (!branchId) setBranchId(initial);
      if (initial) loadShift(initial);
    });
    api<{ data: typeof customers }>("/customers").then((r) => setCustomers(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!branchId) return;
    api<{ data: { categories: MenuCategory[] } }>(`/branches/${branchId}/menu`).then((r) => {
      setCategories(r.data.categories);
      setActiveCat(r.data.categories[0]?.id ?? "");
    });
    api<{ data: typeof tables }>(`/tables?branch_id=${branchId}`).then((r) => setTables(r.data)).catch(() => {});
    loadShift(branchId);
  }, [branchId]);

  const visible = useMemo(() => {
    const cat = categories.find((c) => c.id === activeCat);
    const list = search
      ? categories.flatMap((c) => c.products).filter((p) => p.name_ar.includes(search))
      : cat?.products ?? [];
    return list;
  }, [categories, activeCat, search]);

  const subtotal = cart.reduce((s, l) => s + unitPrice(l) * l.qty, 0);
  const total = Math.max(0, subtotal - discount) + (orderType === "delivery" ? deliveryFee : 0);
  const canPay = payment !== "cash" || !!shift;

  function addProduct(p: MenuProduct, variant?: MenuVariant | null, modifiers: MenuModifier[] = []) {
    const key = `${p.id}|${variant?.id ?? ""}|${modifiers.map((m) => m.id).sort().join(",")}`;
    setCart((c) => {
      const found = c.find((l) => l.key === key && !l.notes);
      if (found) return c.map((l) => (l === found ? { ...l, qty: l.qty + 1 } : l));
      return [...c, { key, product: p, variant, modifiers, qty: 1, notes: "" }];
    });
  }

  function pick(p: MenuProduct) {
    if (!p.is_available) return;
    if (p.variants.length || p.modifier_groups.length) setPicking(p);
    else addProduct(p);
  }

  async function submit() {
    setError(""); setMsg("");
    if (!cart.length || busy) return;
    if (!canPay) { setError(t.pos.noShift); return; }
    setBusy(true);
    try {
      const res = await api<{ data: FullOrder }>("/orders", {
        method: "POST",
        body: {
          branch_id: branchId,
          order_type: orderType,
          table_id: orderType === "dine_in" && tableId ? tableId : null,
          customer_id: orderType === "delivery" && customerId ? customerId : null,
          delivery_address: orderType === "delivery" ? deliveryAddress || null : null,
          delivery_fee: orderType === "delivery" ? deliveryFee : 0,
          discount,
          notes: orderNotes || null,
          items: cart.map((l) => ({ product_id: l.product.id, variant_id: l.variant?.id ?? null, qty: l.qty, notes: l.notes || null, modifier_ids: l.modifiers.map((m) => m.id) })),
        },
      });
      let order = res.data;
      if (payment !== "unpaid") {
        await api(`/orders/${order.id}/payments`, { method: "POST", body: { method: payment, amount: Number(order.total) } });
        order = (await api<{ data: FullOrder }>(`/orders/${order.id}`)).data;
        await loadShift(branchId);
      }
      setDone(order); setCart([]); setDiscount(0); setOrderNotes(""); setMsg(`${t.pos.orderCreated} ${order.order_no}`);
    } catch (e: any) { setError(e.message); }
    finally { setBusy(false); }
  }

  async function printReceipt() {
    if (!done) return;
    try { await api(`/orders/${done.id}/print`, { method: "POST", body: {} }); setMsg(`${t.pos.orderCreated} ${done.order_no} — ${t.pos.printReceipt} ✓`); }
    catch (e: any) { setError(e.message); }
  }

  return (
    <div className="pos" dir="rtl">
      <div className="pos-menu">
        <div className="pos-top">
          <img src={brand.logoPath} alt={brand.nameAr} className="pos-logo" />
          <select value={branchId} onChange={(e) => setBranchId(e.target.value)}>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
          <input placeholder={t.pos.search} value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="shift-strip">
          {shift ? (
            <>
              <b>{t.pos.currentShift}</b><span>{t.pos.shiftOpened}</span><span>{t.pos.expectedCash}: {money(Number(shift.totals.expected_cash))}</span><span>{t.reports.ordersToday}: {shift.totals.orders_count}</span>
            </>
          ) : <span className="danger-text">{t.pos.noShift}</span>}
        </div>
        <div className="pos-cats">{categories.map((c) => <button key={c.id} className={c.id === activeCat && !search ? "cat active" : "cat"} onClick={() => { setActiveCat(c.id); setSearch(""); }}>{c.name_ar}</button>)}</div>
        <div className="pos-grid">{visible.map((p) => <button key={p.id} className={p.is_available ? "pos-card" : "pos-card off"} onClick={() => pick(p)}><span className="pos-card-name">{p.name_ar}</span><span className="pos-card-price">{money(p.effective_price)}</span>{!p.is_available && <span className="pos-card-off">{p.availability_note_ar ?? t.menu.unavailable}</span>}</button>)}</div>
      </div>

      <div className="pos-cart">
        <h3>{t.pos.cart}</h3>
        {error && <div className="alert">{error}</div>}{msg && <div className="ok">{msg}</div>}
        {!shift && <div className="shift-panel"><label>{t.pos.openingCash}</label><input type="number" min={0} value={openingCash} onChange={(e) => setOpeningCash(Number(e.target.value))} /><button className="primary wide" onClick={openShift}>{t.pos.openShift}</button></div>}
        {shift && <div className="shift-panel mini"><div className="receipt-row"><span>{t.pos.openingCash}</span><b>{money(Number(shift.opening_cash))}</b></div><div className="receipt-row"><span>{t.pos.cashIn}</span><b>{money(shift.totals.cash_in)}</b></div><div className="receipt-row"><span>{t.pos.cashOut}</span><b>{money(shift.totals.cash_out)}</b></div><div className="cash-move"><input type="number" min={0} placeholder="المبلغ" value={moveAmount || ""} onChange={(e) => setMoveAmount(Number(e.target.value))} /><input placeholder={t.pos.cashReason} value={moveReason} onChange={(e) => setMoveReason(e.target.value)} /></div><div className="pos-actions"><button onClick={() => cashMove("cash-in")}>{t.pos.cashIn}</button><button onClick={() => cashMove("cash-out")}>{t.pos.cashOut}</button></div></div>}
        {!cart.length && <div className="muted">{t.pos.emptyCart}</div>}
        {cart.map((l, idx) => <div key={idx} className="cart-line"><div className="cart-line-head"><span>{l.product.name_ar}{l.variant ? ` (${l.variant.name_ar})` : ""}</span><span>{money(unitPrice(l) * l.qty)}</span></div>{l.modifiers.length > 0 && <div className="cart-mods">{l.modifiers.map((m) => m.name_ar).join("، ")}</div>}<div className="cart-line-actions"><button onClick={() => setCart((c) => c.map((x, i) => (i === idx ? { ...x, qty: x.qty + 1 } : x)))}>+</button><span>{l.qty}</span><button onClick={() => setCart((c) => c.flatMap((x, i) => (i === idx ? (x.qty > 1 ? [{ ...x, qty: x.qty - 1 }] : []) : [x])))}>−</button><input placeholder={t.pos.itemNotes} value={l.notes} onChange={(e) => setCart((c) => c.map((x, i) => (i === idx ? { ...x, notes: e.target.value } : x)))} /></div></div>)}
        <div className="pos-opts">
          <label>{t.pos.orderType}</label><div className="seg">{(["dine_in", "takeaway", "delivery"] as const).map((k) => <button key={k} className={orderType === k ? "active" : ""} onClick={() => setOrderType(k)}>{t.orders.types[k]}</button>)}</div>
          {orderType === "dine_in" && <select value={tableId} onChange={(e) => setTableId(e.target.value)}><option value="">{t.pos.table}…</option>{tables.map((x) => <option key={x.id} value={x.id}>{x.name_ar} — {t.tables.statuses[x.status]}</option>)}</select>}
          {orderType === "delivery" && <><select value={customerId} onChange={(e) => { setCustomerId(e.target.value); const c = customers.find((x) => x.id === e.target.value); if (c?.address) setDeliveryAddress(c.address); }}><option value="">{t.pos.customer}…</option>{customers.map((c) => <option key={c.id} value={c.id}>{c.name} {c.phone ? `— ${c.phone}` : ""}</option>)}</select><input placeholder={t.pos.deliveryAddress} value={deliveryAddress} onChange={(e) => setDeliveryAddress(e.target.value)} /><label>{t.pos.deliveryFee}</label><input type="number" min={0} value={deliveryFee} onChange={(e) => setDeliveryFee(Number(e.target.value))} /></>}
          <label>{t.pos.discount}</label><input type="number" min={0} value={discount} onChange={(e) => setDiscount(Number(e.target.value))} /><input placeholder={t.pos.orderNotes} value={orderNotes} onChange={(e) => setOrderNotes(e.target.value)} />
          <label>{t.pos.payment}</label><div className="seg">{(["cash", "card", "wallet", "unpaid"] as const).map((k) => <button key={k} className={payment === k ? "active" : ""} onClick={() => setPayment(k)}>{t.pos[k]}</button>)}</div>
        </div>
        <div className="pos-totals"><div className="receipt-row"><span>{t.pos.subtotal}</span><span>{money(subtotal)}</span></div><div className="receipt-row receipt-total"><span>{t.pos.total}</span><span>{money(total)}</span></div></div>
        <div className="pos-actions"><button className="primary" disabled={!cart.length || busy || !canPay} onClick={submit}>{t.pos.submit}</button><button onClick={() => setCart([])}>{t.pos.clear}</button></div>
        {shift && <div className="shift-close"><label>{t.pos.actualCash}</label><input type="number" min={0} value={actualCash} onChange={(e) => setActualCash(Number(e.target.value))} /><button className="danger wide" onClick={closeShift}>{t.pos.closeShift}</button></div>}
      </div>

      {picking && <OptionPicker product={picking} onCancel={() => setPicking(null)} onAdd={(variant, mods) => { addProduct(picking, variant, mods); setPicking(null); }} />}
      {done && <div className="modal-back" onClick={() => setDone(null)}><div className="modal" onClick={(e) => e.stopPropagation()}><Receipt order={done} /><div className="pos-actions"><button className="primary" onClick={printReceipt}>{t.pos.printReceipt}</button><button onClick={() => setDone(null)}>{t.pos.close}</button></div></div></div>}
    </div>
  );
}

function OptionPicker({
  product,
  onAdd,
  onCancel,
}: {
  product: MenuProduct;
  onAdd: (variant: MenuVariant | null, mods: MenuModifier[]) => void;
  onCancel: () => void;
}) {
  const [variant, setVariant] = useState<MenuVariant | null>(product.variants[0] ?? null);
  const [mods, setMods] = useState<MenuModifier[]>([]);

  function toggleMod(g: MenuGroup, m: MenuModifier) {
    setMods((cur) => {
      if (cur.some((x) => x.id === m.id)) return cur.filter((x) => x.id !== m.id);
      const inGroup = cur.filter((x) => g.modifiers.some((gm) => gm.id === x.id));
      if (inGroup.length >= g.max_select) return cur; // احترام أقصى اختيار
      return [...cur, m];
    });
  }

  const valid = product.modifier_groups.every((g) => {
    const n = mods.filter((x) => g.modifiers.some((gm) => gm.id === x.id)).length;
    return n >= (g.is_required ? Math.max(1, g.min_select) : g.min_select);
  });

  return (
    <div className="modal-back" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()} dir="rtl">
        <h3>{t.pos.chooseOptions} — {product.name_ar}</h3>
        {product.variants.length > 0 && (
          <div className="seg wrap">
            {product.variants.map((v) => (
              <button key={v.id} className={variant?.id === v.id ? "active" : ""} onClick={() => setVariant(v)}>
                {v.name_ar}
                {Number(v.price_delta) ? ` (+${Number(v.price_delta)})` : ""}
              </button>
            ))}
          </div>
        )}
        {product.modifier_groups.map((g) => (
          <div key={g.id} className="mod-group">
            <div className="mod-group-name">
              {g.name_ar} {g.is_required ? `— ${t.menu.required}` : ""}
            </div>
            <div className="seg wrap">
              {g.modifiers.map((m) => (
                <button key={m.id} className={mods.some((x) => x.id === m.id) ? "active" : ""} onClick={() => toggleMod(g, m)}>
                  {m.name_ar}
                  {Number(m.price_delta) ? ` (+${Number(m.price_delta)})` : ""}
                </button>
              ))}
            </div>
          </div>
        ))}
        <div className="pos-actions">
          <button className="primary" disabled={!valid} onClick={() => onAdd(variant, mods)}>
            {t.pos.addToCart}
          </button>
          <button onClick={onCancel}>{t.common.cancel}</button>
        </div>
      </div>
    </div>
  );
}
