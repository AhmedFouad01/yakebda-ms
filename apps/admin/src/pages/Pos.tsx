import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { t } from "../lib/t";
import { Receipt, FullOrder } from "../components/Receipt";
import { brand } from "../config/brand";
import { useMe } from "../lib/me";

/**
 * YKMS-02C — شاشة كاشير حقيقية (مساحة عمل داكنة) لمطعم يا كبدة.
 * كل زر ظاهر ينفذ endpoint حقيقيًا أو يُخفى/يُعطل مع سبب واضح — لا أزرار وهمية.
 */

interface MenuModifier { id: string; name_ar: string; price_delta: string | number }
interface MenuGroup { id: string; name_ar: string; min_select: number; max_select: number; is_required: boolean; modifiers: MenuModifier[] }
interface MenuVariant { id: string; name_ar: string; price_delta: string | number }
interface MenuProduct {
  id: string; name_ar: string; effective_price: number; is_available: boolean; image_url?: string | null;
  availability_note_ar?: string | null; variants: MenuVariant[]; modifier_groups: MenuGroup[];
}
interface MenuCategory { id: string; name_ar: string; products: MenuProduct[] }
interface Branch { id: string; name: string }
interface Shift { id: string; opened_at: string; opening_cash: string | number }
interface Settings {
  show_product_images: boolean;
  require_open_shift_for_cash: boolean;
  enabled_payment_methods: string[];
  receipt_printing_enabled: boolean;
  allow_discounts: boolean;
}
interface CartLine {
  key: string; product: MenuProduct; variant?: MenuVariant | null;
  modifiers: MenuModifier[]; qty: number; notes: string;
}

const money = (v: number) => `${v.toFixed(2)} ${t.reports.egp}`;
const unitPrice = (l: CartLine) =>
  l.product.effective_price + Number(l.variant?.price_delta ?? 0) + l.modifiers.reduce((s, m) => s + Number(m.price_delta), 0);

export function Pos() {
  const [params] = useSearchParams();
  const { can } = useMe();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState(params.get("branch") ?? "");
  const [settings, setSettings] = useState<Settings | null>(null);
  const [shift, setShift] = useState<Shift | null>(null);
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
  const [payment, setPayment] = useState("cash");
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState<FullOrder | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ data: Branch[] }>("/branches").then((r) => {
      setBranches(r.data);
      if (!branchId && r.data.length) setBranchId(r.data[0].id);
    });
    if (can("customers.manage")) {
      api<{ data: typeof customers }>("/customers").then((r) => setCustomers(r.data)).catch(() => {});
    }
  }, [can]);

  async function loadShift(b: string) {
    try {
      const r = await api<{ data: Shift | null }>(`/shifts/current?branch_id=${b}`);
      setShift(r.data);
    } catch {
      setShift(null);
    }
  }

  useEffect(() => {
    if (!branchId) return;
    api<{ data: { categories: MenuCategory[] } }>(`/branches/${branchId}/menu`).then((r) => {
      setCategories(r.data.categories);
      setActiveCat(r.data.categories[0]?.id ?? "");
    });
    api<{ data: Settings }>(`/settings?branch_id=${branchId}`).then((r) => {
      setSettings(r.data);
      setPayment((p) => (r.data.enabled_payment_methods.includes(p) ? p : r.data.enabled_payment_methods[0]));
    });
    api<{ data: typeof tables }>(`/tables?branch_id=${branchId}`).then((r) => setTables(r.data)).catch(() => {});
    loadShift(branchId);
  }, [branchId]);

  const visible = useMemo(() => {
    const cat = categories.find((c) => c.id === activeCat);
    return search
      ? categories.flatMap((c) => c.products).filter((p) => p.name_ar.includes(search))
      : cat?.products ?? [];
  }, [categories, activeCat, search]);

  const subtotal = cart.reduce((s, l) => s + unitPrice(l) * l.qty, 0);
  const total = Math.max(0, subtotal - discount) + (orderType === "delivery" ? deliveryFee : 0);
  const cashBlocked = payment === "cash" && !!settings?.require_open_shift_for_cash && !shift;

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

  async function openShift() {
    const cash = window.prompt(t.shift.openingCash, "0");
    if (cash == null) return;
    try {
      await api("/shifts/open", { method: "POST", body: { branch_id: branchId, opening_cash: Number(cash) || 0 } });
      await loadShift(branchId);
      setError("");
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function closeShift() {
    if (!shift) return;
    const cash = window.prompt(t.shift.closingCash, "0");
    if (cash == null) return;
    try {
      await api(`/shifts/${shift.id}/close`, { method: "POST", body: { actual_cash: Number(cash) || 0 } });
      await loadShift(branchId);
      setError("");
    } catch (e: any) {
      setError(e.message);
    }
  }

  /**
   * KOT: إنشاء + إرسال للمطبخ (submit=true).
   * فاتورة: إنشاء كمسودة بدون مطبخ (submit=false).
   * فاتورة+دفع / فاتورة+طباعة: إرسال للمطبخ + دفع/طباعة.
   */
  async function fireOrder(opts: { submit: boolean; pay: boolean; print: boolean }) {
    setError("");
    setMsg("");
    if (!cart.length || busy) return;
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
          submit: opts.submit,
          discount: settings?.allow_discounts ? discount : 0,
          notes: orderNotes || null,
          items: cart.map((l) => ({
            product_id: l.product.id,
            variant_id: l.variant?.id ?? null,
            qty: l.qty,
            notes: l.notes || null,
            modifier_ids: l.modifiers.map((m) => m.id),
          })),
        },
      });
      let order = res.data;
      if (opts.pay && payment !== "unpaid") {
        await api(`/orders/${order.id}/payments`, { method: "POST", body: { method: payment, amount: Number(order.total) } });
      }
      if (opts.print && settings?.receipt_printing_enabled) {
        await api(`/orders/${order.id}/print`, { method: "POST", body: {} });
      }
      order = (await api<{ data: FullOrder }>(`/orders/${order.id}`)).data;
      setDone(order);
      setCart([]);
      setDiscount(0);
      setOrderNotes("");
      setMsg(`${t.pos.orderCreated} ${order.order_no}`);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const enabledMethods = settings?.enabled_payment_methods ?? ["cash", "card", "wallet", "unpaid"];

  return (
    <div className="posx" dir="rtl">
      {/* ---------- header ---------- */}
      <header className="posx-head">
        <div className="posx-brand">
          <img src={brand.logoPath} alt={brand.nameAr} />
          <div>
            <strong>{brand.nameAr}</strong>
            <span>{brand.systemName}</span>
          </div>
        </div>
        <select value={branchId} onChange={(e) => setBranchId(e.target.value)}>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
        <div className={shift ? "posx-shift on" : "posx-shift off"}>
          {shift ? t.shift.openTitle : t.shift.noShift}
          {can("shifts.manage") && (
            <button onClick={shift ? closeShift : openShift}>{shift ? t.shift.close : t.shift.open}</button>
          )}
        </div>
        <input className="posx-search" placeholder={t.pos.search} value={search} onChange={(e) => setSearch(e.target.value)} />
      </header>

      <div className="posx-body">
        {/* ---------- menu ---------- */}
        <section className="posx-menu">
          <div className="posx-cats">
            {categories.map((c) => (
              <button
                key={c.id}
                className={c.id === activeCat && !search ? "active" : ""}
                onClick={() => { setActiveCat(c.id); setSearch(""); }}
              >
                {c.name_ar}
              </button>
            ))}
          </div>
          <div className="posx-grid">
            {visible.map((p) => (
              <button key={p.id} className={p.is_available ? "posx-card" : "posx-card off"} onClick={() => pick(p)}>
                {settings?.show_product_images !== false && (
                  p.image_url
                    ? <img className="posx-card-img" src={p.image_url} alt={p.name_ar} />
                    : <span className="posx-card-img ph">{p.name_ar.trim().charAt(0)}</span>
                )}
                <span className="posx-card-name">{p.name_ar}</span>
                <span className="posx-card-price">{money(p.effective_price)}</span>
                {!p.is_available && <span className="posx-card-off">{p.availability_note_ar ?? t.menu.unavailable}</span>}
              </button>
            ))}
          </div>
        </section>

        {/* ---------- cart ---------- */}
        <aside className="posx-cart">
          <h3>{t.pos.cart}</h3>
          {error && <div className="alert">{error}</div>}
          {msg && <div className="ok">{msg}</div>}
          <div className="posx-cart-lines">
            {!cart.length && <div className="posx-empty">{t.pos.emptyCart}</div>}
            {cart.map((l, idx) => (
              <div key={idx} className="posx-line">
                <div className="posx-line-head">
                  <span>{l.product.name_ar}{l.variant ? ` (${l.variant.name_ar})` : ""}</span>
                  <span>{money(unitPrice(l) * l.qty)}</span>
                </div>
                {l.modifiers.length > 0 && <div className="posx-line-mods">{l.modifiers.map((m) => m.name_ar).join("، ")}</div>}
                <div className="posx-line-actions">
                  <button onClick={() => setCart((c) => c.map((x, i) => (i === idx ? { ...x, qty: x.qty + 1 } : x)))}>+</button>
                  <span>{l.qty}</span>
                  <button onClick={() => setCart((c) => c.map((x, i) => (i === idx && x.qty > 1 ? { ...x, qty: x.qty - 1 } : x)))}>−</button>
                  <button className="rm" onClick={() => setCart((c) => c.filter((_, i) => i !== idx))}>✕</button>
                  <input
                    placeholder={t.pos.itemNotes}
                    value={l.notes}
                    onChange={(e) => setCart((c) => c.map((x, i) => (i === idx ? { ...x, notes: e.target.value } : x)))}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="posx-opts">
            <div className="seg dark">
              {(["dine_in", "takeaway", "delivery"] as const).map((k) => (
                <button key={k} className={orderType === k ? "active" : ""} onClick={() => setOrderType(k)}>
                  {t.orders.types[k]}
                </button>
              ))}
            </div>
            {orderType === "dine_in" && (
              <select value={tableId} onChange={(e) => setTableId(e.target.value)}>
                <option value="">{t.pos.table}…</option>
                {tables.map((x) => (
                  <option key={x.id} value={x.id}>{x.name_ar} — {t.tables.statuses[x.status]}</option>
                ))}
              </select>
            )}
            {orderType === "delivery" && (
              <>
                <select
                  value={customerId}
                  onChange={(e) => {
                    setCustomerId(e.target.value);
                    const c = customers.find((x) => x.id === e.target.value);
                    if (c?.address) setDeliveryAddress(c.address);
                  }}
                >
                  <option value="">{t.pos.customer}…</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}{c.phone ? ` — ${c.phone}` : ""}</option>
                  ))}
                </select>
                <input placeholder={t.pos.deliveryAddress} value={deliveryAddress} onChange={(e) => setDeliveryAddress(e.target.value)} />
                <input type="number" min={0} placeholder={t.pos.deliveryFee} value={deliveryFee || ""} onChange={(e) => setDeliveryFee(Number(e.target.value))} />
              </>
            )}
            {settings?.allow_discounts !== false && (
              <input type="number" min={0} placeholder={t.pos.discount} value={discount || ""} onChange={(e) => setDiscount(Number(e.target.value))} />
            )}
            <input placeholder={t.pos.orderNotes} value={orderNotes} onChange={(e) => setOrderNotes(e.target.value)} />
            <div className="seg dark wrap">
              {enabledMethods.map((k) => (
                <button key={k} className={payment === k ? "active" : ""} onClick={() => setPayment(k)}>
                  {t.pos[k as "cash" | "card" | "wallet" | "unpaid"]}
                </button>
              ))}
            </div>
            {cashBlocked && <div className="posx-warn">{t.shift.cashNeedsShift}</div>}
          </div>

          <div className="posx-totals">
            <div className="receipt-row"><span>{t.pos.subtotal}</span><span>{money(subtotal)}</span></div>
            <div className="receipt-row posx-total"><span>{t.pos.total}</span><span>{money(total)}</span></div>
          </div>

          {/* أزرار حقيقية فقط: KOT / فاتورة / فاتورة+دفع / فاتورة+طباعة */}
          <div className="posx-fire">
            <button disabled={!cart.length || busy} onClick={() => fireOrder({ submit: true, pay: false, print: false })}>
              {t.pos.kot}
            </button>
            <button disabled={!cart.length || busy} onClick={() => fireOrder({ submit: false, pay: false, print: false })}>
              {t.pos.bill}
            </button>
            <button
              className="hot"
              disabled={!cart.length || busy || payment === "unpaid" || cashBlocked}
              title={cashBlocked ? t.shift.cashNeedsShift : undefined}
              onClick={() => fireOrder({ submit: true, pay: true, print: false })}
            >
              {t.pos.billPay}
            </button>
            {settings?.receipt_printing_enabled && (
              <button
                className="hot"
                disabled={!cart.length || busy || cashBlocked}
                title={cashBlocked ? t.shift.cashNeedsShift : undefined}
                onClick={() => fireOrder({ submit: true, pay: payment !== "unpaid", print: true })}
              >
                {t.pos.billPrint}
              </button>
            )}
            <button className="ghost" disabled={!cart.length} onClick={() => setCart([])}>{t.pos.clear}</button>
          </div>
        </aside>
      </div>

      {picking && (
        <OptionPicker
          product={picking}
          onCancel={() => setPicking(null)}
          onAdd={(variant, mods) => {
            addProduct(picking, variant, mods);
            setPicking(null);
          }}
        />
      )}

      {done && (
        <div className="modal-back" onClick={() => setDone(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <Receipt order={done} />
            <div className="pos-actions">
              {settings?.receipt_printing_enabled && (
                <button
                  className="primary"
                  onClick={async () => {
                    try {
                      await api(`/orders/${done.id}/print`, { method: "POST", body: {} });
                      setMsg(`${t.pos.orderCreated} ${done.order_no} — ${t.pos.printReceipt} ✓`);
                    } catch (e: any) {
                      setError(e.message);
                    }
                  }}
                >
                  {t.pos.printReceipt}
                </button>
              )}
              <button onClick={() => setDone(null)}>{t.pos.close}</button>
            </div>
          </div>
        </div>
      )}
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
      if (inGroup.length >= g.max_select) return cur;
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
                {v.name_ar}{Number(v.price_delta) ? ` (+${Number(v.price_delta)})` : ""}
              </button>
            ))}
          </div>
        )}
        {product.modifier_groups.map((g) => (
          <div key={g.id} className="mod-group">
            <div className="mod-group-name">{g.name_ar} {g.is_required ? `— ${t.menu.required}` : ""}</div>
            <div className="seg wrap">
              {g.modifiers.map((m) => (
                <button key={m.id} className={mods.some((x) => x.id === m.id) ? "active" : ""} onClick={() => toggleMod(g, m)}>
                  {m.name_ar}{Number(m.price_delta) ? ` (+${Number(m.price_delta)})` : ""}
                </button>
              ))}
            </div>
          </div>
        ))}
        <div className="pos-actions">
          <button className="primary" disabled={!valid} onClick={() => onAdd(variant, mods)}>{t.pos.addToCart}</button>
          <button onClick={onCancel}>{t.common.cancel}</button>
        </div>
      </div>
    </div>
  );
}
