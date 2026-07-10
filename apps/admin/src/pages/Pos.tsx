import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { t } from "../lib/t";
import { Receipt, FullOrder } from "../components/Receipt";
import { useMe } from "../lib/me";

interface MenuModifier {
  id: string;
  name_ar: string;
  price_delta: string | number;
}
interface MenuGroup {
  id: string;
  name_ar: string;
  min_select: number;
  max_select: number;
  is_required: boolean;
  modifiers: MenuModifier[];
}
interface MenuVariant {
  id: string;
  name_ar: string;
  price_delta: string | number;
}
interface MenuProduct {
  id: string;
  name_ar: string;
  effective_price: number;
  is_available: boolean;
  pos_visible?: boolean;
  image_url?: string | null;
  ingredients_ar?: string | null;
  portion_note_ar?: string | null;
  availability_note_ar?: string | null;
  variants: MenuVariant[];
  modifier_groups: MenuGroup[];
}
interface MenuCategory {
  id: string;
  name_ar: string;
  products: MenuProduct[];
}
interface Branch {
  id: string;
  name: string;
}
interface Shift {
  id: string;
  opened_at: string;
  opening_cash: string | number;
  totals?: {
    cash_sales: number;
    card_sales: number;
    wallet_sales: number;
    expected_cash: number;
    orders_count: number;
  };
}
interface Settings {
  show_product_images: boolean;
  require_open_shift_for_cash: boolean;
  enabled_payment_methods: string[];
  receipt_printing_enabled: boolean;
  allow_discounts: boolean;
  // YKMS-02E — الإعدادات مصدر الحقيقة
  order_type_takeaway_enabled: boolean;
  order_type_delivery_enabled: boolean;
  default_delivery_fee: number;
  min_delivery_order: number;
  max_discount_without_manager: number;
  max_cashier_discount_percent: number;
  discount_reason_required: boolean;
  vat_enabled: boolean;
  vat_percentage: number;
  prices_include_vat: boolean;
  service_fee_enabled: boolean;
  service_fee_type: "percent" | "fixed";
  service_fee_value: number;
  rounding_rule: "none" | "nearest_050" | "nearest_1";
  require_customer_for_delivery: boolean;
  require_address_for_delivery: boolean;
}
interface CartLine {
  key: string;
  product: MenuProduct;
  variant?: MenuVariant | null;
  modifiers: MenuModifier[];
  qty: number;
  notes: string;
}
interface AdminCategory {
  id: string;
  name_ar: string;
}
interface AdminProduct {
  id: string;
  category_id: string;
  name_ar: string;
  base_price: string | number;
  sku?: string | null;
  image_url?: string | null;
  ingredients_ar?: string | null;
  portion_note_ar?: string | null;
  is_active: boolean;
  variants: MenuVariant[];
}

type OrderType = "takeaway" | "delivery";
type AdminPanel = "items" | "shift" | "offers" | null;
type PaymentMethod = "cash" | "card" | "wallet" | "unpaid";

const CAT_ORDER = ["الكل", "ساندوتشات", "أطباق", "وجبات", "الحواوشي", "البطاطس", "فواتح الشهية", "إضافات", "مشروبات"];
const paymentLabels: Record<PaymentMethod, string> = {
  cash: t.pos.cash,
  card: t.pos.card,
  wallet: t.pos.wallet,
  unpaid: t.pos.unpaid,
};

const money = (v: number) => `${v.toFixed(2)} ${t.reports.egp}`;
const unitPrice = (line: CartLine) =>
  line.product.effective_price +
  Number(line.variant?.price_delta ?? 0) +
  line.modifiers.reduce((sum, mod) => sum + Number(mod.price_delta), 0);
const catRank = (name: string) => {
  const index = CAT_ORDER.indexOf(name);
  return index === -1 ? 99 : index;
};

function safeCalc(expression: string): string {
  const cleaned = expression.replace(/[×]/g, "*").replace(/[÷]/g, "/");
  if (!/^[0-9+\-*/().\s]+$/.test(cleaned)) return "خطأ";
  try {
    const result = Function(`"use strict"; return (${cleaned || 0})`)();
    return Number.isFinite(result) ? String(Number(result.toFixed(2))) : "خطأ";
  } catch {
    return "خطأ";
  }
}

export function Pos() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
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
  const [discountReason, setDiscountReason] = useState("");
  const [orderNotes, setOrderNotes] = useState("");
  const [payment, setPayment] = useState<PaymentMethod>("cash");
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
  const [editForm, setEditForm] = useState({
    name_ar: "",
    base_price: 0,
    image_url: "",
    ingredients_ar: "",
    portion_note_ar: "",
  });

  useEffect(() => {
    api<{ data: Branch[] }>("/branches").then((response) => {
      setBranches(response.data);
      if (!branchId && response.data.length) setBranchId(response.data[0].id);
    });
    if (can("customers.manage")) {
      api<{ data: typeof customers }>("/customers")
        .then((response) => setCustomers(response.data))
        .catch(() => {});
    }
  }, [branchId, can]);

  async function loadShift(currentBranchId: string) {
    try {
      const response = await api<{ data: Shift | null }>(`/shifts/current?branch_id=${currentBranchId}`);
      setShift(response.data);
    } catch {
      setShift(null);
    }
  }

  async function loadMenu(currentBranchId = branchId) {
    if (!currentBranchId) return;
    const response = await api<{ data: { categories: MenuCategory[] } }>(`/branches/${currentBranchId}/menu`);
    const sorted = [...response.data.categories].sort((a, b) => catRank(a.name_ar) - catRank(b.name_ar));
    setCategories(sorted);
    setActiveCat("الكل");
  }

  useEffect(() => {
    if (!branchId) return;
    loadMenu(branchId).catch((e: Error) => setError(e.message));
    api<{ data: Settings }>(`/settings?branch_id=${branchId}`).then((response) => {
      setSettings(response.data);
      setPayment((current) =>
        response.data.enabled_payment_methods.includes(current) ? current : (response.data.enabled_payment_methods[0] as PaymentMethod)
      );
      // YKMS-02E: النوع الافتراضي يتبع الإعدادات (الصالة مخفية أصلًا)
      setOrderType((current) => {
        if (current === "takeaway" && !response.data.order_type_takeaway_enabled && response.data.order_type_delivery_enabled) return "delivery";
        if (current === "delivery" && !response.data.order_type_delivery_enabled && response.data.order_type_takeaway_enabled) return "takeaway";
        return current;
      });
    });
    loadShift(branchId);
  }, [branchId]);

  // YKMS-02E: إخفاء الأصناف غير المرئية في POS (pos_visible === false)
  const allProducts = useMemo(
    () => categories.flatMap((category) => category.products).filter((p) => p.pos_visible !== false),
    [categories]
  );
  const visibleProducts = useMemo(() => {
    if (search) {
      return allProducts.filter(
        (product) =>
          product.name_ar.includes(search) ||
          product.ingredients_ar?.includes(search) ||
          product.portion_note_ar?.includes(search)
      );
    }
    if (activeCat === "الكل") return allProducts;
    return (categories.find((category) => category.name_ar === activeCat)?.products ?? []).filter((p) => p.pos_visible !== false);
  }, [categories, allProducts, activeCat, search]);

  const subtotal = cart.reduce((sum, line) => sum + unitPrice(line) * line.qty, 0);
  // YKMS-02E: أنواع الطلب المفعّلة (الصالة تبقى مخفية) + تقدير الرسوم/الضريبة مطابق للخادم
  const enabledOrderTypes = (["takeaway", "delivery"] as const).filter((type) =>
    type === "takeaway" ? settings?.order_type_takeaway_enabled !== false : settings?.order_type_delivery_enabled !== false
  );
  const afterDiscount = Math.max(0, subtotal - discount);
  const activeDeliveryFee = orderType === "delivery" ? deliveryFee : 0;
  const serviceFeeEstimate = settings?.service_fee_enabled
    ? settings.service_fee_type === "percent"
      ? Math.round(afterDiscount * (settings.service_fee_value / 100) * 100) / 100
      : settings.service_fee_value
    : 0;
  let vatEstimate = 0;
  let total = afterDiscount + serviceFeeEstimate + activeDeliveryFee;
  if (settings?.vat_enabled && settings.vat_percentage > 0) {
    const rate = settings.vat_percentage / 100;
    if (settings.prices_include_vat) {
      vatEstimate = Math.round((total - total / (1 + rate)) * 100) / 100;
    } else {
      vatEstimate = Math.round((afterDiscount + serviceFeeEstimate) * rate * 100) / 100;
      total += vatEstimate;
    }
  }
  if (settings && settings.rounding_rule !== "none") {
    const step = settings.rounding_rule === "nearest_050" ? 0.5 : 1;
    total = Math.round(total / step) * step;
  }
  total = Math.round(total * 100) / 100;
  const belowMinDelivery = orderType === "delivery" && (settings?.min_delivery_order ?? 0) > 0 && subtotal < (settings?.min_delivery_order ?? 0);
  const discountOverLimit =
    discount > 0 &&
    !!settings &&
    (discount > settings.max_discount_without_manager ||
      (subtotal > 0 && (discount / subtotal) * 100 > settings.max_cashier_discount_percent));
  const discountReasonMissing = discount > 0 && !!settings?.discount_reason_required && !discountReason.trim();
  const cashBlocked = payment === "cash" && !!settings?.require_open_shift_for_cash && !shift;
  const enabledMethods = (settings?.enabled_payment_methods ?? ["cash", "card", "wallet", "unpaid"]) as PaymentMethod[];
  const itemCount = cart.reduce((sum, line) => sum + line.qty, 0);

  function addProduct(product: MenuProduct, variant?: MenuVariant | null, modifiers: MenuModifier[] = []) {
    const key = `${product.id}|${variant?.id ?? ""}|${modifiers.map((modifier) => modifier.id).sort().join(",")}`;
    setCart((current) => {
      const found = current.find((line) => line.key === key && !line.notes);
      if (found) {
        return current.map((line) => (line === found ? { ...line, qty: line.qty + 1 } : line));
      }
      return [...current, { key, product, variant, modifiers, qty: 1, notes: "" }];
    });
  }

  function quickAdd(product: MenuProduct) {
    if (!product.is_available) return;
    addProduct(product, product.variants[0] ?? null, []);
  }

  function quickRemove(product: MenuProduct) {
    setCart((rows) => {
      const index = rows.findIndex((line) => line.product.id === product.id);
      if (index === -1) return rows;
      return rows.flatMap((line, i) => {
        if (i !== index) return [line];
        return line.qty > 1 ? [{ ...line, qty: line.qty - 1 }] : [];
      });
    });
  }

  function productQty(product: MenuProduct) {
    return cart.filter((line) => line.product.id === product.id).reduce((sum, line) => sum + line.qty, 0);
  }

  function pick(product: MenuProduct) {
    if (!product.is_available) return;
    if (product.variants.length || product.modifier_groups.length) setPicking(product);
    else addProduct(product);
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

  async function fireOrder(opts: { submit: boolean; pay: boolean; print: boolean }) {
    setError("");
    setMsg("");
    if (!cart.length || busy) return;
    setBusy(true);
    try {
      const response = await api<{ data: FullOrder }>("/orders", {
        method: "POST",
        body: {
          branch_id: branchId,
          order_type: orderType,
          table_id: null,
          customer_id: orderType === "delivery" && customerId ? customerId : null,
          delivery_address: orderType === "delivery" ? deliveryAddress || null : null,
          delivery_fee: orderType === "delivery" ? deliveryFee : 0,
          submit: opts.submit,
          discount: settings?.allow_discounts ? discount : 0,
          discount_reason: discount > 0 ? discountReason || null : null,
          notes: orderNotes || null,
          items: cart.map((line) => ({
            product_id: line.product.id,
            variant_id: line.variant?.id ?? null,
            qty: line.qty,
            notes: line.notes || null,
            modifier_ids: line.modifiers.map((modifier) => modifier.id),
          })),
        },
      });
      let order = response.data;
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
      setDiscountReason("");
      setOrderNotes("");
      setMsg(`${t.pos.orderCreated} ${order.order_no}`);
      await loadShift(branchId);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  function calcPress(key: string) {
    if (key === "C") return setCalc("");
    if (key === "⌫") return setCalc((value) => value.slice(0, -1));
    if (key === "=") return setCalc((value) => safeCalc(value));
    if (key === "خصم") return setDiscount(Number(calc || 0));
    if (key === "دليفري") return setDeliveryFee(Number(calc || 0));
    setCalc((value) => value + key);
  }

  async function loadAdminProducts() {
    const [productsResponse, categoriesResponse] = await Promise.all([
      api<{ data: AdminProduct[] }>("/products"),
      api<{ data: AdminCategory[] }>("/categories"),
    ]);
    setAdminProducts(productsResponse.data);
    setAdminCategories(categoriesResponse.data);
  }

  async function openItemsPanel() {
    setAdminPanel("items");
    setEditing(null);
    setError("");
    try {
      await loadAdminProducts();
    } catch (e: any) {
      setError(e.message);
    }
  }

  function startEdit(product: AdminProduct | MenuProduct) {
    const row: AdminProduct =
      "base_price" in product
        ? product
        : {
            ...product,
            category_id: "",
            base_price: product.effective_price,
            is_active: product.is_available,
            sku: null,
            variants: product.variants,
          };
    setEditing(row);
    setEditForm({
      name_ar: row.name_ar,
      base_price: Number(row.base_price),
      image_url: row.image_url ?? "",
      ingredients_ar: row.ingredients_ar ?? "",
      portion_note_ar: row.portion_note_ar ?? "",
    });
    setAdminPanel("items");
  }

  async function saveProduct() {
    if (!editing) return;
    try {
      await api(`/products/${editing.id}`, {
        method: "PATCH",
        body: {
          name_ar: editForm.name_ar,
          base_price: Number(editForm.base_price),
          image_url: editForm.image_url || null,
          ingredients_ar: editForm.ingredients_ar || null,
          portion_note_ar: editForm.portion_note_ar || null,
        },
      });
      setEditing(null);
      setMsg("تم حفظ الصنف");
      await loadAdminProducts();
      await loadMenu();
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function toggleProduct(product: AdminProduct) {
    try {
      await api(`/products/${product.id}`, { method: "PATCH", body: { is_active: !product.is_active } });
      await loadAdminProducts();
      await loadMenu();
    } catch (e: any) {
      setError(e.message);
    }
  }

  const adminVisible = adminProducts.filter(
    (product) => !adminSearch || product.name_ar.includes(adminSearch) || product.sku?.includes(adminSearch)
  );

  return (
    <div className="posx" dir="rtl">
      <header className="posx-head">
        <div className="posx-brand">
          <div className="posx-brand-mark">يا كبدة</div>
          <div>
            <strong>نظام الكاشير</strong>
            <span>Fast Food POS</span>
          </div>
        </div>
        <select value={branchId} onChange={(e) => setBranchId(e.target.value)} title="الفرع">
          {branches.map((branch) => (
            <option key={branch.id} value={branch.id}>{branch.name}</option>
          ))}
        </select>
        <div className={shift ? "posx-shift on" : "posx-shift off"}>
          {shift ? t.shift.openTitle : t.shift.noShift}
          {can("shifts.manage") && <button onClick={shift ? closeShift : openShift}>{shift ? t.shift.close : t.shift.open}</button>}
        </div>
        {/* YKMS-02F: أدوات الإدارة كلها تحت قائمة واحدة — لا أزرار كبيرة دائمة */}
        <details className="posx-adminmenu">
          <summary>الإدارة ▾</summary>
          <div className="posx-adminmenu-items" onClick={(e) => (e.currentTarget.closest("details") as HTMLDetailsElement).open = false}>
            {can("menu.manage") && <button onClick={openItemsPanel}>إدارة الأصناف</button>}
            {can("shifts.manage") && <button onClick={() => setAdminPanel("shift")}>إدارة الشيفت</button>}
            <button onClick={() => setAdminPanel("offers")}>إدارة العروض</button>
            {can("settings.manage") && <button onClick={() => navigate("/settings")}>{t.nav.settings}</button>}
          </div>
        </details>
        <input className="posx-search" placeholder="ابحث باسم الصنف أو المكونات…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </header>

      <div className="posx-body">
        <section className="posx-menu">
          <div className="posx-cats">
            <button className={activeCat === "الكل" && !search ? "active" : ""} onClick={() => { setActiveCat("الكل"); setSearch(""); }}>الكل</button>
            {categories.map((category) => (
              <button key={category.id} className={category.name_ar === activeCat && !search ? "active" : ""} onClick={() => { setActiveCat(category.name_ar); setSearch(""); }}>
                {category.name_ar}
              </button>
            ))}
          </div>
          <div className="posx-grid">
            {visibleProducts.map((product) => {
              const qty = productQty(product);
              return (
                <div key={product.id} className={product.is_available ? "posx-card" : "posx-card off"} onClick={() => pick(product)}>
                  {settings?.show_product_images !== false && (
                    product.image_url ? <img className="posx-card-img" src={product.image_url} alt={product.name_ar} /> : <span className="posx-card-img ph">{product.name_ar.trim().charAt(0)}</span>
                  )}
                  <span className="posx-card-name">{product.name_ar}</span>
                  {product.portion_note_ar && <span className="posx-card-size">{product.portion_note_ar}</span>}
                  <span className="posx-card-price">{money(product.effective_price)}</span>
                  {product.ingredients_ar && <span className="posx-card-ing">{product.ingredients_ar}</span>}
                  {!product.is_available && <span className="posx-card-off">{product.availability_note_ar ?? t.menu.unavailable}</span>}
                  <div className="posx-card-actions" onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => quickRemove(product)} disabled={!qty}>−</button>
                    <span>{qty}</span>
                    <button onClick={() => quickAdd(product)} disabled={!product.is_available}>+</button>
                    {(product.variants.length > 0 || product.modifier_groups.length > 0) && <button className="details" onClick={() => pick(product)}>تفاصيل</button>}
                    {can("menu.manage") && <button className="details edit" onClick={() => startEdit(product)}>تعديل</button>}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <aside className="posx-cart">
          <div className="posx-cart-head"><h3>{t.pos.cart}</h3><strong>{itemCount} صنف</strong></div>
          <div className="posx-shift-stats">
            <div><span>افتتاحي</span><b>{money(Number(shift?.opening_cash ?? 0))}</b></div>
            <div><span>نقدي</span><b>{money(Number(shift?.totals?.cash_sales ?? 0))}</b></div>
            <div><span>طلبات</span><b>{shift?.totals?.orders_count ?? 0}</b></div>
            <div><span>متوقع</span><b>{money(Number(shift?.totals?.expected_cash ?? 0))}</b></div>
          </div>
          {error && <div className="alert dark-alert">{error}</div>}
          {msg && <div className="ok dark-ok">{msg}</div>}

          <div className="posx-cart-lines">
            {!cart.length && <div className="posx-empty">{t.pos.emptyCart}</div>}
            {cart.map((line, index) => (
              <div key={`${line.key}-${index}`} className="posx-line">
                <div className="posx-line-head">
                  <span>{line.product.name_ar}{line.variant ? ` (${line.variant.name_ar})` : ""}</span>
                  <span>{money(unitPrice(line) * line.qty)}</span>
                </div>
                {line.modifiers.length > 0 && <div className="posx-line-mods">{line.modifiers.map((modifier) => modifier.name_ar).join("، ")}</div>}
                <div className="posx-line-actions">
                  <button onClick={() => setCart((rows) => rows.map((row, i) => (i === index ? { ...row, qty: row.qty + 1 } : row)))}>+</button>
                  <span>{line.qty}</span>
                  <button onClick={() => setCart((rows) => rows.map((row, i) => (i === index && row.qty > 1 ? { ...row, qty: row.qty - 1 } : row)))}>−</button>
                  <button className="rm" onClick={() => setCart((rows) => rows.filter((_, i) => i !== index))}>✕</button>
                  <input placeholder={t.pos.itemNotes} value={line.notes} onChange={(e) => setCart((rows) => rows.map((row, i) => (i === index ? { ...row, notes: e.target.value } : row)))} />
                </div>
              </div>
            ))}
          </div>

          <div className="posx-opts">
            <div className="seg dark">
              {enabledOrderTypes.map((type) => (
                <button
                  key={type}
                  className={orderType === type ? "active" : ""}
                  onClick={() => {
                    setOrderType(type);
                    // YKMS-02E: رسوم التوصيل الافتراضية من الإعدادات عند التحويل للدليفري
                    if (type === "delivery" && !deliveryFee && settings?.default_delivery_fee) setDeliveryFee(settings.default_delivery_fee);
                  }}
                >
                  {t.orders.types[type]}
                </button>
              ))}
            </div>
            {orderType === "delivery" && (
              <>
                <select value={customerId} onChange={(e) => { setCustomerId(e.target.value); const customer = customers.find((item) => item.id === e.target.value); if (customer?.address) setDeliveryAddress(customer.address); }}>
                  <option value="">{t.pos.customer}…</option>
                  {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}{customer.phone ? ` — ${customer.phone}` : ""}</option>)}
                </select>
                <input placeholder={t.pos.deliveryAddress} value={deliveryAddress} onChange={(e) => setDeliveryAddress(e.target.value)} />
                <input type="number" min={0} placeholder={t.pos.deliveryFee} value={deliveryFee || ""} onChange={(e) => setDeliveryFee(Number(e.target.value))} />
              </>
            )}
            {settings?.allow_discounts !== false && (
              <>
                <input type="number" min={0} placeholder={t.pos.discount} value={discount || ""} onChange={(e) => setDiscount(Number(e.target.value))} />
                {discount > 0 && settings?.discount_reason_required && (
                  <input placeholder={t.pos.discountReason} value={discountReason} onChange={(e) => setDiscountReason(e.target.value)} />
                )}
                {discountOverLimit && <div className="posx-warn">{t.pos.discountNeedsManager}</div>}
              </>
            )}
            {belowMinDelivery && <div className="posx-warn">{t.pos.belowMinDelivery} ({money(settings?.min_delivery_order ?? 0)})</div>}
            <input placeholder={t.pos.orderNotes} value={orderNotes} onChange={(e) => setOrderNotes(e.target.value)} />
            <div className="seg dark wrap">
              {enabledMethods.map((method) => (
                <button key={method} className={payment === method ? "active" : ""} onClick={() => setPayment(method)}>{paymentLabels[method] ?? method}</button>
              ))}
            </div>
            {cashBlocked && <div className="posx-warn">{t.shift.cashNeedsShift}</div>}
          </div>

          <details className="posx-calc-box">
            <summary>الآلة الحاسبة</summary>
            <div className="posx-calc">
              <div className="posx-calc-display" dir="ltr">{calc || "0"}</div>
              {["7", "8", "9", "÷", "4", "5", "6", "×", "1", "2", "3", "-", "0", ".", "=", "+", "C", "⌫", "خصم", "دليفري"].map((key) => (
                <button key={key} onClick={() => calcPress(key)}>{key}</button>
              ))}
            </div>
          </details>

          <div className="posx-totals">
            <div className="receipt-row"><span>{t.pos.subtotal}</span><span>{money(subtotal)}</span></div>
            {discount > 0 && <div className="receipt-row"><span>{t.pos.discount}</span><span>{money(discount)}</span></div>}
            {serviceFeeEstimate > 0 && <div className="receipt-row"><span>{t.pos.serviceFee}</span><span>{money(serviceFeeEstimate)}</span></div>}
            {orderType === "delivery" && deliveryFee > 0 && <div className="receipt-row"><span>{t.pos.deliveryFee}</span><span>{money(deliveryFee)}</span></div>}
            {vatEstimate > 0 && <div className="receipt-row"><span>{t.pos.vat} ({settings?.vat_percentage}%)</span><span>{money(vatEstimate)}</span></div>}
            <div className="receipt-row posx-total"><span>{t.pos.total}</span><span>{money(total)}</span></div>
          </div>

          <div className="posx-fire">
            <button disabled={!cart.length || busy} onClick={() => fireOrder({ submit: true, pay: false, print: false })}>{t.pos.kot}</button>
            <button disabled={!cart.length || busy} onClick={() => fireOrder({ submit: false, pay: false, print: false })}>{t.pos.bill}</button>
            <button className="hot" disabled={!cart.length || busy || payment === "unpaid" || cashBlocked} onClick={() => fireOrder({ submit: true, pay: true, print: false })}>{t.pos.billPay}</button>
            {settings?.receipt_printing_enabled && <button className="hot" disabled={!cart.length || busy || cashBlocked} onClick={() => fireOrder({ submit: true, pay: payment !== "unpaid", print: true })}>{t.pos.billPrint}</button>}
            <button className="ghost" disabled={!cart.length} onClick={() => setCart([])}>{t.pos.clear}</button>
          </div>
        </aside>
      </div>

      {picking && <OptionPicker product={picking} onCancel={() => setPicking(null)} onAdd={(variant, modifiers) => { addProduct(picking, variant, modifiers); setPicking(null); }} />}
      {done && (
        <div className="modal-back" onClick={() => setDone(null)}>
          <div className="modal receipt-modal" onClick={(e) => e.stopPropagation()}>
            <Receipt order={done} />
            <div className="pos-actions">
              {settings?.receipt_printing_enabled && <button className="primary" onClick={async () => { try { await api(`/orders/${done.id}/print`, { method: "POST", body: {} }); setMsg(`${t.pos.orderCreated} ${done.order_no} — ${t.pos.printReceipt} ✓`); } catch (e: any) { setError(e.message); } }}>{t.pos.printReceipt}</button>}
              <button onClick={() => setDone(null)}>{t.pos.close}</button>
            </div>
          </div>
        </div>
      )}
      {adminPanel && (
        <div className="modal-back" onClick={() => setAdminPanel(null)}>
          <div className="modal posx-admin-modal" onClick={(e) => e.stopPropagation()}>
            {adminPanel === "items" && (
              <ItemManager
                products={adminVisible}
                categories={adminCategories}
                search={adminSearch}
                setSearch={setAdminSearch}
                editing={editing}
                editForm={editForm}
                setEditForm={setEditForm}
                startEdit={startEdit}
                saveProduct={saveProduct}
                cancelEdit={() => setEditing(null)}
                toggleProduct={toggleProduct}
              />
            )}
            {adminPanel === "shift" && <ShiftPanel shift={shift} money={money} openShift={openShift} closeShift={closeShift} />}
            {adminPanel === "offers" && <OffersPanel />}
          </div>
        </div>
      )}
    </div>
  );
}

function ItemManager(props: {
  products: AdminProduct[];
  categories: AdminCategory[];
  search: string;
  setSearch: (value: string) => void;
  editing: AdminProduct | null;
  editForm: { name_ar: string; base_price: number; image_url: string; ingredients_ar: string; portion_note_ar: string };
  setEditForm: (value: { name_ar: string; base_price: number; image_url: string; ingredients_ar: string; portion_note_ar: string }) => void;
  startEdit: (product: AdminProduct) => void;
  saveProduct: () => void;
  cancelEdit: () => void;
  toggleProduct: (product: AdminProduct) => void;
}) {
  const { products, categories, search, setSearch, editing, editForm, setEditForm, startEdit, saveProduct, cancelEdit, toggleProduct } = props;
  return (
    <div className="posx-admin-grid">
      <section>
        <h3>إدارة الأصناف</h3>
        <input className="posx-admin-search" placeholder="ابحث عن صنف أو SKU" value={search} onChange={(e) => setSearch(e.target.value)} />
        <div className="posx-admin-list">
          {products.map((product) => (
            <div key={product.id} className={product.is_active ? "posx-admin-row" : "posx-admin-row off"}>
              <div>
                <b>{product.name_ar}</b>
                <span>{categories.find((category) => category.id === product.category_id)?.name_ar ?? "—"} · {Number(product.base_price).toFixed(2)} ج.م</span>
              </div>
              <button onClick={() => startEdit(product)}>تعديل</button>
              <button onClick={() => toggleProduct(product)}>{product.is_active ? "تعطيل" : "تفعيل"}</button>
            </div>
          ))}
        </div>
      </section>
      <section className="posx-edit-card">
        <h3>{editing ? "تعديل الصنف" : "اختار صنف للتعديل"}</h3>
        {editing ? (
          <>
            <div className="image-rec">الصورة المقترحة: مربعة 1:1 — 800×800px — JPG/WebP — أقل من 400KB</div>
            {editForm.image_url && <img className="posx-edit-preview" src={editForm.image_url} alt={editForm.name_ar} />}
            <label>اسم الصنف<input value={editForm.name_ar} onChange={(e) => setEditForm({ ...editForm, name_ar: e.target.value })} /></label>
            <label>السعر<input type="number" min={0} value={editForm.base_price} onChange={(e) => setEditForm({ ...editForm, base_price: Number(e.target.value) })} /></label>
            <label>رابط صورة مربعة<input dir="ltr" value={editForm.image_url} onChange={(e) => setEditForm({ ...editForm, image_url: e.target.value })} /></label>
            <label>المكونات<input value={editForm.ingredients_ar} onChange={(e) => setEditForm({ ...editForm, ingredients_ar: e.target.value })} /></label>
            <label>وصف الحجم/الحصة<input value={editForm.portion_note_ar} onChange={(e) => setEditForm({ ...editForm, portion_note_ar: e.target.value })} /></label>
            <div className="pos-actions">
              <button className="primary" onClick={saveProduct}>حفظ</button>
              <button onClick={cancelEdit}>إلغاء</button>
            </div>
            <p className="muted">رفع الصور كملف مباشر يحتاج endpoint تخزين ملفات. الحالي يدعم رابط صورة مع preview.</p>
          </>
        ) : (
          <p className="muted">اضغط تعديل أمام أي صنف. كل تغيير في السعر أو الاسم أو الصورة ينعكس مباشرة على POS بعد الحفظ.</p>
        )}
      </section>
    </div>
  );
}

function ShiftPanel({ shift, money, openShift, closeShift }: { shift: Shift | null; money: (value: number) => string; openShift: () => void; closeShift: () => void }) {
  return (
    <div>
      <h3>إدارة الشيفت</h3>
      <div className="posx-shift-stats large">
        <div><span>حالة الشيفت</span><b>{shift ? "مفتوح" : "مغلق"}</b></div>
        <div><span>افتتاحي</span><b>{money(Number(shift?.opening_cash ?? 0))}</b></div>
        <div><span>نقدي</span><b>{money(Number(shift?.totals?.cash_sales ?? 0))}</b></div>
        <div><span>طلبات</span><b>{shift?.totals?.orders_count ?? 0}</b></div>
        <div><span>المتوقع</span><b>{money(Number(shift?.totals?.expected_cash ?? 0))}</b></div>
      </div>
      <div className="pos-actions"><button className="primary" onClick={shift ? closeShift : openShift}>{shift ? "إغلاق الشيفت" : "فتح شيفت"}</button></div>
    </div>
  );
}

function OffersPanel() {
  return (
    <div>
      <h3>إدارة العروض</h3>
      <p className="muted">العروض لم تُفعّل كـ backend module في YKMS-02D. الخصم اليدوي الحالي مرتبط بالفاتورة والتقارير. تنفيذ العروض يحتاج جدول rules وربطها بالمنتجات قبل الدفع.</p>
    </div>
  );
}

function OptionPicker({ product, onAdd, onCancel }: { product: MenuProduct; onAdd: (variant: MenuVariant | null, mods: MenuModifier[]) => void; onCancel: () => void }) {
  const [variant, setVariant] = useState<MenuVariant | null>(product.variants[0] ?? null);
  const [mods, setMods] = useState<MenuModifier[]>([]);

  function toggleMod(group: MenuGroup, modifier: MenuModifier) {
    setMods((current) => {
      if (current.some((item) => item.id === modifier.id)) return current.filter((item) => item.id !== modifier.id);
      const inGroup = current.filter((item) => group.modifiers.some((groupModifier) => groupModifier.id === item.id));
      if (inGroup.length >= group.max_select) return current;
      return [...current, modifier];
    });
  }

  const valid = product.modifier_groups.every((group) => {
    const count = mods.filter((item) => group.modifiers.some((groupModifier) => groupModifier.id === item.id)).length;
    return count >= (group.is_required ? Math.max(1, group.min_select) : group.min_select);
  });

  return (
    <div className="modal-back" onClick={onCancel}>
      <div className="modal posx-picker" onClick={(e) => e.stopPropagation()} dir="rtl">
        <h3>{t.pos.chooseOptions} — {product.name_ar}</h3>
        {product.ingredients_ar && <p className="muted">{product.ingredients_ar}</p>}
        {product.variants.length > 0 && (
          <div className="seg wrap">
            {product.variants.map((item) => (
              <button key={item.id} className={variant?.id === item.id ? "active" : ""} onClick={() => setVariant(item)}>{item.name_ar}{Number(item.price_delta) ? ` (+${Number(item.price_delta)})` : ""}</button>
            ))}
          </div>
        )}
        {product.modifier_groups.map((group) => (
          <div key={group.id} className="mod-group">
            <div className="mod-group-name">{group.name_ar} {group.is_required ? `— ${t.menu.required}` : ""}</div>
            <div className="seg wrap">
              {group.modifiers.map((modifier) => (
                <button key={modifier.id} className={mods.some((item) => item.id === modifier.id) ? "active" : ""} onClick={() => toggleMod(group, modifier)}>{modifier.name_ar}{Number(modifier.price_delta) ? ` (+${Number(modifier.price_delta)})` : ""}</button>
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
