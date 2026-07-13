import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "react-router-dom";
import { api, resolveAssetUrl } from "../../lib/api";
import { t } from "../../lib/t";
import { Receipt, FullOrder } from "../../components/Receipt";
import { OrderDetail } from "../../components/OrderDetail";
import { useMe } from "../../lib/me";
import { Drawer } from "../../components/ui/overlays";
import { PosCartLine } from "../../components/pos/PosCartLine";

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
interface OrderSource {
  id: string;
  code: string;
  name_ar: string;
  supports_takeaway: boolean;
  supports_delivery: boolean;
}
interface DeliveryZone {
  id: string;
  name_ar: string;
  fee: string | number;
  min_order: string | number;
  is_active: boolean;
}
interface CustomerAddress {
  label?: string | null;
  area?: string | null;
  landmark?: string | null;
  floor?: string | null;
  notes?: string | null;
  is_default?: boolean;
}
interface PosCustomer {
  id: string;
  name: string;
  phone?: string | null;
  alt_phone?: string | null;
  address?: string | null;
  addresses?: CustomerAddress[] | string | null;
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
interface ShiftOrderPreviewItem {
  id: string;
  name_ar: string;
  variant_name_ar?: string | null;
  qty: number;
  image_url?: string | null;
}
interface ShiftOrderSummary {
  id: string;
  order_no: number;
  order_prefix?: string | null;
  order_type: string;
  source_name?: string | null;
  status: string;
  kitchen_status: "draft" | "waiting" | "preparing" | "ready" | "completed" | "cancelled";
  payment_status: "unpaid" | "partial" | "paid";
  subtotal: string | number;
  discount: string | number;
  service_fee: string | number;
  vat_amount: string | number;
  delivery_fee: string | number;
  rounding_adjustment: string | number;
  total: string | number;
  paid_amount: string | number;
  item_count: number;
  preview_items: ShiftOrderPreviewItem[];
  created_at: string;
  submitted_at?: string | null;
  in_kitchen_at?: string | null;
  ready_at?: string | null;
  completed_at?: string | null;
  cancelled_at?: string | null;
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
interface OrderQuoteSummary {
  subtotal: number;
  discount: number;
  delivery_fee: number;
  service_fee: number;
  vat_amount: number;
  rounding_adjustment: number;
  total: number;
}
interface CartLine {
  key: string;
  product: MenuProduct;
  variant?: MenuVariant | null;
  modifiers: MenuModifier[];
  qty: number;
  notes: string;
}
type OrderType = "takeaway" | "delivery";
type AdminPanel = "shift" | null;
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
const cartLineKey = (product: MenuProduct, variant?: MenuVariant | null, modifiers: MenuModifier[] = []) =>
  `${product.id}|${variant?.id ?? ""}|${modifiers.map((modifier) => modifier.id).sort().join(",")}`;
const catRank = (name: string) => {
  const index = CAT_ORDER.indexOf(name);
  return index === -1 ? 99 : index;
};

function parseAddresses(customer: PosCustomer | null): CustomerAddress[] {
  if (!customer?.addresses) return [];
  if (Array.isArray(customer.addresses)) return customer.addresses;
  try {
    const parsed = JSON.parse(customer.addresses);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function addressText(address: CustomerAddress): string {
  return [address.area, address.landmark, address.floor, address.notes]
    .map((value) => value?.trim())
    .filter(Boolean)
    .join(" — ");
}

import { usePosController } from "./PosContext";

export function PosView() {
  const {
    can,
    branches,
    setBranches,
    branchId,
    setBranchId,
    sources,
    setSources,
    sourceId,
    setSourceId,
    settings,
    setSettings,
    shift,
    setShift,
    categories,
    setCategories,
    activeCat,
    setActiveCat,
    search,
    setSearch,
    cart,
    setCart,
    orderType,
    setOrderType,
    customers,
    setCustomers,
    customerId,
    setCustomerId,
    deliveryAddress,
    setDeliveryAddress,
    deliveryPhone,
    setDeliveryPhone,
    deliveryZones,
    setDeliveryZones,
    deliveryZoneId,
    setDeliveryZoneId,
    deliveryFee,
    setDeliveryFee,
    customerModalOpen,
    setCustomerModalOpen,
    addressModalOpen,
    setAddressModalOpen,
    phoneModalOpen,
    setPhoneModalOpen,
    quickName,
    setQuickName,
    quickPhone,
    setQuickPhone,
    quickAddress,
    setQuickAddress,
    quickAddressLabel,
    setQuickAddressLabel,
    quickExtraPhone,
    setQuickExtraPhone,
    quickBusy,
    setQuickBusy,
    discount,
    setDiscount,
    discountReason,
    setDiscountReason,
    orderNotes,
    setOrderNotes,
    payment,
    setPayment,
    shellControlsRoot,
    setShellControlsRoot,
    shellSessionRoot,
    setShellSessionRoot,
    searchInputRef,
    sourceSelectRef,
    msg,
    setMsg,
    error,
    setError,
    done,
    setDone,
    busy,
    setBusy,
    quoteState,
    setQuoteState,
    quoteBusy,
    setQuoteBusy,
    quoteError,
    setQuoteError,
    historyOpen,
    setHistoryOpen,
    historyBusy,
    setHistoryBusy,
    historyError,
    setHistoryError,
    history,
    setHistory,
    historyOrder,
    setHistoryOrder,
    historyOrderBusy,
    setHistoryOrderBusy,
    historyOrderError,
    setHistoryOrderError,
    historySearch,
    setHistorySearch,
    expandedHistoryId,
    setExpandedHistoryId,
    adminPanel,
    setAdminPanel,
    cartDrawerOpen,
    setCartDrawerOpen,
    quotePayload,
    quoteKey,
    currentQuote,
    loadCustomers,
    selectDeliveryCustomer,
    loadShift,
    loadHistory,
    openHistoryOrder,
    loadMenu,
    allProducts,
    visibleProducts,
    selectedCustomer,
    selectedZone,
    customerAddressOptions,
    customerPhoneOptions,
    localSubtotal,
    subtotal,
    enabledOrderTypes,
    activeDeliveryFee,
    serviceFeeEstimate,
    vatEstimate,
    total,
    deliveryMinimum,
    belowMinDelivery,
    discountOverLimit,
    discountReasonMissing,
    cashBlocked,
    enabledMethods,
    itemCount,
    addProduct,
    quickRemove,
    openShift,
    closeShift,
    createQuickCustomer,
    addQuickAddress,
    addQuickPhone,
    fireOrder,
    normalizedHistorySearch,
    filteredHistory,
    shiftOrdersCount,
  } = usePosController();

  return (
    <div className="posx" dir="rtl">
      {shellControlsRoot && createPortal(
        <div className="posx-shell-operation-controls" aria-label="أدوات تشغيل نقطة البيع">
          <label
            className="posx-shell-icon posx-branch-picker"
            title={branches.find((branch) => branch.id === branchId)?.name ?? "اختيار الفرع"}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M3 9h18" /><path d="M5 9v11h14V9" /><path d="M8 20v-6h8v6" /><path d="m4 9 2-5h12l2 5" />
            </svg>
            <select value={branchId} onChange={(event) => setBranchId(event.target.value)} aria-label="اختيار الفرع">
              {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
            </select>
          </label>
          <button
            type="button"
            className="posx-shell-icon posx-history-btn"
            title="سجل الطلبات"
            aria-label="سجل الطلبات"
            onClick={() => setHistoryOpen(true)}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" /><path d="M12 7v5l3 2" />
            </svg>
          </button>
          <input
            ref={searchInputRef}
            className="posx-search"
            placeholder="ابحث باسم الصنف أو المكونات…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>,
        shellControlsRoot
      )}
      {shellSessionRoot && can("shifts.manage") && createPortal(
        <button
          type="button"
          className={`posx-shift-action${shift ? " is-open" : ""}`}
          onClick={() => setAdminPanel("shift")}
        >
          {shift ? t.shift.close : t.shift.open}
        </button>,
        shellSessionRoot
      )}

      <div className="posx-body">
        <section className="posx-menu">
          <div className="posx-menu-top">
            <div className="posx-menu-tools">
            <button
              type="button"
              className="posx-cart-toggle"
              aria-controls="posx-cart-drawer"
              aria-expanded={cartDrawerOpen}
              onClick={() => setCartDrawerOpen(true)}
            >
              السلة <span>{itemCount}</span>
            </button>
            </div>
            <div className="posx-cats">
            <button className={activeCat === "الكل" && !search ? "active" : ""} onClick={() => { setActiveCat("الكل"); setSearch(""); }}>الكل</button>
              {categories.map((category) => (
                <button key={category.id} className={category.name_ar === activeCat && !search ? "active" : ""} onClick={() => { setActiveCat(category.name_ar); setSearch(""); }}>
                  {category.name_ar}
                </button>
              ))}
            </div>
          </div>
          <div className="posx-grid">
            {visibleProducts.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                cartLines={cart}
                showImage={settings?.show_product_images !== false}
                money={money}
                onAdd={(variant, modifiers) => addProduct(product, variant, modifiers)}
                onQuickRemove={(variant, modifiers) => quickRemove(product, variant, modifiers)}
              />
            ))}
          </div>
        </section>

        <aside id="posx-cart-drawer" className={`posx-cart${cartDrawerOpen ? " is-open" : ""}`}>
          <div className="posx-cart-head">
            <h3>{t.pos.cart}</h3>
            <strong>{itemCount} صنف</strong>
            <button type="button" className="posx-cart-close" aria-label="إغلاق السلة" onClick={() => setCartDrawerOpen(false)}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <path d="M6 6l12 12M18 6 6 18" />
              </svg>
            </button>
          </div>
          {/* YKMS-02F: إحصائيات الشيفت انتقلت لشاشة «إدارة الشيفت» — السلة للتشغيل فقط */}
          {error && <div className="alert dark-alert">{error}</div>}
          {msg && <div className="ok dark-ok">{msg}</div>}

          <div className="posx-order-rail" aria-label="بيانات الطلب الأساسية">
            <div className="seg dark">
              {enabledOrderTypes.map((type) => (
                <button
                  type="button"
                  key={type}
                  className={orderType === type ? "active" : ""}
                  onClick={() => {
                    setOrderType(type);
                    setSourceId("");
                    setDeliveryZoneId("");
                    setDeliveryFee(0);
                  }}
                >
                  {t.orders.types[type]}
                </button>
              ))}
            </div>
            <label className="posx-source-field">
              <select ref={sourceSelectRef} value={sourceId} onChange={(event) => setSourceId(event.target.value)} aria-label="مصدر الطلب" required>
                <option value="">اختر مصدر الطلب…</option>
                {sources.map((source) => <option key={source.id} value={source.id}>{source.name_ar}</option>)}
              </select>
            </label>
          </div>

          <div className="posx-cart-scroll">
            <div className="posx-cart-lines">
              {!cart.length && <div className="posx-empty">{t.pos.emptyCart}</div>}
              {cart.map((line, index) => (
                <PosCartLine
                  key={`${line.key}-${index}`}
                  line={line}
                  totalLabel={money(unitPrice(line) * line.qty)}
                  onIncrease={() => setCart((rows) => rows.map((row, i) => i === index ? { ...row, qty: row.qty + 1 } : row))}
                  onDecrease={() => setCart((rows) => rows.flatMap((row, i) => i !== index ? [row] : row.qty > 1 ? [{ ...row, qty: row.qty - 1 }] : []))}
                  onRemove={() => setCart((rows) => rows.filter((_, i) => i !== index))}
                  onNotesChange={(notes) => setCart((rows) => rows.map((row, i) => i === index ? { ...row, notes } : row))}
                />
              ))}
            </div>

          <div className="posx-opts">
            {orderType === "delivery" && (
              <div className="posx-delivery-fields">
                <label className="posx-delivery-field posx-delivery-field-full">
                  <span className="posx-delivery-label">
                    <b>العميل</b>
                    <button
                      type="button"
                      className="posx-quick-add"
                      aria-label="إضافة عميل جديد"
                      title={can("customers.manage") ? "إضافة عميل جديد" : "تحتاج صلاحية إدارة العملاء"}
                      disabled={!can("customers.manage")}
                      onClick={() => setCustomerModalOpen(true)}
                    >+</button>
                  </span>
                  <select
                    value={customerId}
                    onChange={(event) => selectDeliveryCustomer(customers.find((item) => item.id === event.target.value) ?? null)}
                  >
                    <option value="">اختر العميل…</option>
                    {customers.map((customer) => (
                      <option key={customer.id} value={customer.id}>
                        {customer.name}{customer.phone ? ` — ${customer.phone}` : ""}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="posx-delivery-field posx-delivery-field-full">
                  <span className="posx-delivery-label">
                    <b>عنوان التوصيل</b>
                    <button
                      type="button"
                      className="posx-quick-add"
                      aria-label="إضافة عنوان للعميل"
                      title={!selectedCustomer ? "اختر العميل أولًا" : "إضافة عنوان جديد"}
                      disabled={!selectedCustomer || !can("customers.manage")}
                      onClick={() => setAddressModalOpen(true)}
                    >+</button>
                  </span>
                  <select value={deliveryAddress} disabled={!selectedCustomer} onChange={(event) => setDeliveryAddress(event.target.value)}>
                    <option value="">اختر عنوان التوصيل…</option>
                    {customerAddressOptions.map((address) => (
                      <option key={address.value} value={address.value}>{address.label} — {address.value}</option>
                    ))}
                  </select>
                </label>

                <div className="posx-delivery-split posx-delivery-field-full">
                  <label className="posx-delivery-field">
                    <span className="posx-delivery-label"><b>زون التوصيل</b></span>
                    <select
                      value={deliveryZoneId}
                      onChange={(event) => {
                        const nextId = event.target.value;
                        const zone = deliveryZones.find((item) => item.id === nextId);
                        setDeliveryZoneId(nextId);
                        setDeliveryFee(zone ? Number(zone.fee) : 0);
                      }}
                    >
                      <option value="">اختر الزون…</option>
                      {deliveryZones.map((zone) => (
                        <option key={zone.id} value={zone.id}>{zone.name_ar} — {money(Number(zone.fee))}</option>
                      ))}
                    </select>
                  </label>

                  <label className="posx-delivery-field">
                    <span className="posx-delivery-label">
                      <b>رقم التليفون</b>
                      <button
                        type="button"
                        className="posx-quick-add"
                        aria-label="إضافة رقم تليفون"
                        title={!selectedCustomer ? "اختر العميل أولًا" : "إضافة أو تحديث الرقم الإضافي"}
                        disabled={!selectedCustomer || !can("customers.manage")}
                        onClick={() => setPhoneModalOpen(true)}
                      >+</button>
                    </span>
                    <select value={deliveryPhone} disabled={!selectedCustomer} onChange={(event) => setDeliveryPhone(event.target.value)}>
                      <option value="">اختر رقم التليفون…</option>
                      {customerPhoneOptions.map((phone, index) => (
                        <option key={phone} value={phone}>{index === 0 ? "الأساسي" : "الإضافي"} — {phone}</option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>
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
            {belowMinDelivery && <div className="posx-warn">{t.pos.belowMinDelivery} ({money(deliveryMinimum)})</div>}
            <input placeholder={t.pos.orderNotes} value={orderNotes} onChange={(e) => setOrderNotes(e.target.value)} />
            <div className="seg dark wrap">
              {enabledMethods.map((method) => (
                <button key={method} className={payment === method ? "active" : ""} onClick={() => setPayment(method)}>{paymentLabels[method] ?? method}</button>
              ))}
            </div>
            {cashBlocked && <div className="posx-warn">{t.shift.cashNeedsShift}</div>}
            </div>
          </div>

          <div className="posx-totals">
            {(currentQuote?.discount ?? discount) > 0 && <div className="receipt-row"><span>{t.pos.discount}</span><span>{money(currentQuote?.discount ?? discount)}</span></div>}
            {serviceFeeEstimate > 0 && <div className="receipt-row"><span>{t.pos.serviceFee}</span><span>{money(serviceFeeEstimate)}</span></div>}
            {orderType === "delivery" && activeDeliveryFee > 0 && <div className="receipt-row"><span>{t.pos.deliveryFee}</span><span>{money(activeDeliveryFee)}</span></div>}
            {vatEstimate > 0 && <div className="receipt-row"><span>{t.pos.vat} ({settings?.vat_percentage}%)</span><span>{money(vatEstimate)}</span></div>}
            <div className="receipt-row posx-total"><span>{t.pos.total}</span><span aria-live="polite">{!sourceId ? "—" : quoteBusy && !currentQuote ? "…" : currentQuote ? money(total) : "—"}</span></div>
            {!sourceId && cart.length > 0 && <span className="posx-total-helper">اختر مصدر الطلب لحساب الإجمالي</span>}
          </div>

          {(() => {
            // YKMS-02F: أسباب تعطيل واضحة — لا زر معطّل بلا تفسير
            const deliveryIncomplete =
              orderType === "delivery" &&
              ((settings?.require_customer_for_delivery !== false && !customerId) ||
                (settings?.require_address_for_delivery !== false && !deliveryAddress.trim()) ||
                !deliveryZoneId ||
                !deliveryPhone.trim());
            const fireReason = !cart.length
              ? "السلة فارغة"
              : !sourceId
                ? "اختر مصدر الطلب"
              : quoteError
                ? quoteError
                : quoteBusy || !currentQuote
                  ? "جاري حساب الإجمالي"
                  : deliveryIncomplete
                ? "بيانات الدليفري ناقصة"
                : belowMinDelivery
                  ? "أقل من الحد الأدنى للتوصيل"
                  : discountReasonMissing
                    ? "سبب الخصم مطلوب"
                    : discountOverLimit && !can("orders.discount_above_limit")
                      ? "الخصم يتطلب موافقة مدير"
                      : null;
            const payReason = fireReason ?? (cashBlocked ? "يجب فتح شيفت" : null);
            const fireDisabled = busy || !!fireReason;
            return (
              <div className="posx-fire-wrap">
                <button className="posx-order-now" disabled={fireDisabled || !!payReason} title={payReason ?? undefined} onClick={fireOrder}>
                  {busy ? "جاري تسجيل الطلب…" : "طلب الآن"}
                </button>
                {(payReason ?? fireReason) && <div className="posx-fire-reason">{payReason ?? fireReason}</div>}
              </div>
            );
          })()}
        </aside>
        {cartDrawerOpen && (
          <button
            type="button"
            className="posx-cart-backdrop"
            aria-label="إغلاق السلة"
            onClick={() => setCartDrawerOpen(false)}
          />
        )}
      </div>

      <Drawer open={historyOpen} onClose={() => setHistoryOpen(false)} title="سجل طلبات الشيفت" wide>
        <div className="posx-history">
          <div className="posx-history-toolbar">
            <label className="posx-history-search">
              <span>بحث برقم الطلب</span>
              <input
                inputMode="numeric"
                placeholder="مثال: 31 أو #31"
                value={historySearch}
                onChange={(event) => setHistorySearch(event.target.value)}
              />
            </label>
            <div className="posx-history-kpi" aria-label={`إجمالي طلبات الشيفت ${shiftOrdersCount}`}>
              <span>إجمالي طلبات الشيفت</span>
              <strong>{shiftOrdersCount}</strong>
            </div>
          </div>

          {historyBusy && <div className="posx-history-empty">جارٍ تحميل الطلبات…</div>}
          {!historyBusy && historyError && <div className="alert dark-alert">{historyError}</div>}
          {historyOrderBusy && <div className="posx-history-empty">جارٍ تحميل تفاصيل الطلب…</div>}
          {!historyOrderBusy && historyOrderError && <div className="alert dark-alert">{historyOrderError}</div>}
          {!historyBusy && !historyError && !shift && (
            <div className="posx-history-empty">لا يوجد شيفت مفتوح لهذا الكاشير.</div>
          )}
          {!historyBusy && !historyError && shift && !history.length && (
            <div className="posx-history-empty">لم يتم تسجيل طلبات في الشيفت الحالي بعد.</div>
          )}
          {!historyBusy && !historyError && history.length > 0 && !filteredHistory.length && (
            <div className="posx-history-empty">لا يوجد طلب مطابق لرقم البحث.</div>
          )}

          <div className="posx-history-list">
            {filteredHistory.map((order) => {
              const expanded = expandedHistoryId === order.id;
              const amount = Number(order.total);
              const paymentState = order.payment_status === "paid" ? "مدفوع" : order.payment_status === "partial" ? "مدفوع جزئيًا" : "غير مدفوع";
              const kitchenState =
                order.kitchen_status === "waiting" ? "في انتظار المطبخ" :
                order.kitchen_status === "preparing" ? "قيد التحضير" :
                order.kitchen_status === "ready" ? "جاهز" :
                order.kitchen_status === "completed" ? "مكتمل" :
                order.kitchen_status === "cancelled" ? "ملغي" : "مسودة";
              return (
                <article key={order.id} className={`posx-history-card${expanded ? " expanded" : ""}`}>
                  <button
                    type="button"
                    className="posx-history-summary"
                    aria-expanded={expanded}
                    aria-controls={`shift-order-${order.id}`}
                    onClick={() => setExpandedHistoryId((current) => current === order.id ? null : order.id)}
                  >
                    <span className="posx-history-main">
                      <strong>#{order.order_prefix ?? ""}{order.order_no}</strong>
                      <span>{new Date(order.created_at).toLocaleString("ar-EG", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
                    </span>
                    <span className="posx-history-meta">
                      <span>{t.orders.types[order.order_type] ?? order.order_type}</span>
                      <span>{order.item_count} قطعة</span>
                       <span>{order.source_name ?? "مصدر غير مسجل"}</span>
                      <span className={`posx-history-status pay-${order.payment_status}`}>{paymentState}</span>
                      <span className={`posx-history-status kitchen-${order.kitchen_status}`}>{kitchenState}</span>
                    </span>
                    <span className="posx-history-expand-icon" aria-hidden>{expanded ? "−" : "+"}</span>
                  </button>

                  {expanded && (
                    <div id={`shift-order-${order.id}`} className="posx-history-expanded">
                      <div className="posx-history-items">
                        {order.preview_items.map((item) => {
                          const src = resolveAssetUrl(item.image_url);
                          return (
                            <span key={item.id} className="posx-history-item">
                              {src ? <img src={src} alt="" /> : <span className="posx-history-item-ph">{item.name_ar.trim().charAt(0)}</span>}
                              <span className="posx-history-item-copy">
                                <b>{item.qty} × {item.name_ar}</b>
                                {item.variant_name_ar && <small>{item.variant_name_ar}</small>}
                              </span>
                            </span>
                          );
                        })}
                      </div>
                      <div className="posx-history-expanded-foot">
                        <strong>{money(amount)}</strong>
                        <button type="button" disabled={historyOrderBusy} onClick={() => openHistoryOrder(order.id)}>فتح التفاصيل الكاملة</button>
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </div>
      </Drawer>

      {historyOrder && (
        <div className="modal-back" onClick={() => setHistoryOrder(null)}>
          <div className="modal od-modal" role="dialog" aria-modal="true" aria-labelledby="pos-order-detail-title" onClick={(e) => e.stopPropagation()}>
            <header className="od-modal-head">
              <div className="od-modal-title">
                <h3 id="pos-order-detail-title">تفاصيل الطلب #{historyOrder.order_prefix ?? ""}{historyOrder.order_no}</h3>
                <span className="od-modal-meta">{new Date(historyOrder.created_at).toLocaleString("ar-EG")}</span>
              </div>
              <button type="button" className="od-modal-x" onClick={() => setHistoryOrder(null)} aria-label="إغلاق تفاصيل الطلب">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                  <path d="M6 6l12 12M18 6 6 18" />
                </svg>
              </button>
            </header>
            <div className="od-modal-body">
              <OrderDetail order={historyOrder} />
            </div>
          </div>
        </div>
      )}

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
      {customerModalOpen && (
        <div className="modal-back" onClick={() => setCustomerModalOpen(false)}>
          <div className="modal posx-quick-modal" role="dialog" aria-modal="true" aria-labelledby="quick-customer-title" onClick={(event) => event.stopPropagation()}>
            <h3 id="quick-customer-title">إضافة عميل جديد</h3>
            <label className="field"><span>اسم العميل</span><input autoFocus value={quickName} onChange={(event) => setQuickName(event.target.value)} /></label>
            <label className="field"><span>رقم التليفون</span><input dir="ltr" inputMode="tel" value={quickPhone} onChange={(event) => setQuickPhone(event.target.value)} /></label>
            <label className="field"><span>العنوان الأول (اختياري)</span><textarea rows={3} value={quickAddress} onChange={(event) => setQuickAddress(event.target.value)} /></label>
            <div className="pos-actions">
              <button className="primary" disabled={quickBusy || !quickName.trim() || !quickPhone.trim()} onClick={() => void createQuickCustomer()}>{quickBusy ? "جارٍ الحفظ…" : "إضافة واختيار"}</button>
              <button onClick={() => setCustomerModalOpen(false)}>إلغاء</button>
            </div>
          </div>
        </div>
      )}

      {addressModalOpen && selectedCustomer && (
        <div className="modal-back" onClick={() => setAddressModalOpen(false)}>
          <div className="modal posx-quick-modal" role="dialog" aria-modal="true" aria-labelledby="quick-address-title" onClick={(event) => event.stopPropagation()}>
            <h3 id="quick-address-title">إضافة عنوان — {selectedCustomer.name}</h3>
            <label className="field"><span>اسم العنوان</span><input value={quickAddressLabel} placeholder="المنزل / العمل" onChange={(event) => setQuickAddressLabel(event.target.value)} /></label>
            <label className="field"><span>العنوان</span><textarea autoFocus rows={3} value={quickAddress} onChange={(event) => setQuickAddress(event.target.value)} /></label>
            <div className="pos-actions">
              <button className="primary" disabled={quickBusy || !quickAddress.trim()} onClick={() => void addQuickAddress()}>{quickBusy ? "جارٍ الحفظ…" : "حفظ واختيار"}</button>
              <button onClick={() => setAddressModalOpen(false)}>إلغاء</button>
            </div>
          </div>
        </div>
      )}

      {phoneModalOpen && selectedCustomer && (
        <div className="modal-back" onClick={() => setPhoneModalOpen(false)}>
          <div className="modal posx-quick-modal" role="dialog" aria-modal="true" aria-labelledby="quick-phone-title" onClick={(event) => event.stopPropagation()}>
            <h3 id="quick-phone-title">{selectedCustomer.alt_phone ? "تحديث الرقم الإضافي" : "إضافة رقم إضافي"} — {selectedCustomer.name}</h3>
            <label className="field"><span>رقم التليفون</span><input autoFocus dir="ltr" inputMode="tel" value={quickExtraPhone} onChange={(event) => setQuickExtraPhone(event.target.value)} /></label>
            <div className="pos-actions">
              <button className="primary" disabled={quickBusy || !quickExtraPhone.trim()} onClick={() => void addQuickPhone()}>{quickBusy ? "جارٍ الحفظ…" : "حفظ واختيار"}</button>
              <button onClick={() => setPhoneModalOpen(false)}>إلغاء</button>
            </div>
          </div>
        </div>
      )}

      {adminPanel === "shift" && (
        <div className="modal-back" onClick={() => setAdminPanel(null)}>
          <div className="modal posx-admin-modal" onClick={(e) => e.stopPropagation()}>
            <ShiftPanel shift={shift} money={money} openShift={openShift} closeShift={closeShift} />
          </div>
        </div>
      )}
    </div>
  );
}

function ShiftPanel({
  shift,
  money,
  openShift,
  closeShift,
}: {
  shift: Shift | null;
  money: (value: number) => string;
  openShift: (openingCash: number) => Promise<boolean>;
  closeShift: (actualCash: number) => Promise<boolean>;
}) {
  const [cashValue, setCashValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [panelError, setPanelError] = useState("");

  async function submitShiftAction() {
    if (busy) return;
    const amount = Number(cashValue);
    if (!Number.isFinite(amount) || amount < 0) {
      setPanelError("أدخل مبلغًا صحيحًا لا يقل عن صفر");
      return;
    }
    setBusy(true);
    setPanelError("");
    const ok = shift ? await closeShift(amount) : await openShift(amount);
    if (ok) setCashValue("");
    setBusy(false);
  }

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
      <label className="field">
        <span>{shift ? t.shift.closingCash : t.shift.openingCash}</span>
        <input
          type="number"
          min="0"
          step="0.01"
          inputMode="decimal"
          value={cashValue}
          onChange={(event) => setCashValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void submitShiftAction();
          }}
          disabled={busy}
          autoFocus
        />
      </label>
      {panelError && <div className="alert">{panelError}</div>}
      <div className="pos-actions">
        <button className="primary" disabled={busy || cashValue === ""} onClick={() => void submitShiftAction()}>
          {busy ? "جارٍ الحفظ…" : shift ? "إغلاق الشيفت" : "فتح شيفت"}
        </button>
      </div>
    </div>
  );
}

/**
 * POS product card v2.
 * The selected size and bread stay inline for speed. Left click increments the
 * exact selected configuration; right click decrements that same configuration.
 */
function ProductCard({
  product,
  cartLines,
  showImage,
  money,
  onAdd,
  onQuickRemove,
}: {
  product: MenuProduct;
  cartLines: CartLine[];
  showImage: boolean;
  money: (value: number) => string;
  onAdd: (variant: MenuVariant | null, modifiers: MenuModifier[]) => void;
  onQuickRemove: (variant: MenuVariant | null, modifiers: MenuModifier[]) => void;
}) {
  const inlineGroups = product.modifier_groups.filter((group) => group.is_required && group.max_select === 1);
  const breadTerms = Array.from(new Set(
    inlineGroups.flatMap((group) => group.modifiers.map((modifier) => modifier.name_ar.trim())).filter(Boolean)
  ));

  function sizeLabel(name: string) {
    let label = name.trim();
    for (const bread of breadTerms) label = label.split(bread).join(" ");
    label = label.replace(/\b(فينو|سياحي)\b/g, " ").replace(/[\-–—/|]+/g, " ").replace(/\s+/g, " ").trim();
    return label || name.trim();
  }

  const sizeOptions = product.variants.reduce<Array<{ label: string; fallback: MenuVariant }>>((result, item) => {
    const label = sizeLabel(item.name_ar);
    if (!result.some((option) => option.label === label)) result.push({ label, fallback: item });
    return result;
  }, []);

  const [breadSel, setBreadSel] = useState<Record<string, MenuModifier>>(() => {
    const initial: Record<string, MenuModifier> = {};
    for (const group of inlineGroups) if (group.modifiers[0]) initial[group.id] = group.modifiers[0];
    return initial;
  });
  const [variant, setVariant] = useState<MenuVariant | null>(product.variants[0] ?? null);

  const selectedModifiers = Object.values(breadSel);
  const selectedBreadNames = selectedModifiers.map((modifier) => modifier.name_ar.trim()).filter(Boolean);
  const selectedSize = variant ? sizeLabel(variant.name_ar) : sizeOptions[0]?.label ?? "";

  function chooseVariant(size: string, breadNames = selectedBreadNames) {
    const exact = product.variants.find((item) => {
      if (sizeLabel(item.name_ar) !== size) return false;
      return breadNames.length === 0 || breadNames.every((bread) => item.name_ar.includes(bread));
    });
    return exact ?? product.variants.find((item) => sizeLabel(item.name_ar) === size) ?? null;
  }

  function selectSize(size: string) {
    setVariant(chooseVariant(size));
  }

  function selectModifier(group: MenuGroup, modifier: MenuModifier) {
    setBreadSel((current) => ({ ...current, [group.id]: modifier }));
    if (selectedSize) {
      const nextBreadNames = Object.entries(breadSel)
        .map(([groupId, selected]) => groupId === group.id ? modifier.name_ar.trim() : selected.name_ar.trim())
        .filter(Boolean);
      setVariant(chooseVariant(selectedSize, nextBreadNames));
    }
  }

  const imageSrc = resolveAssetUrl(product.image_url);
  const [imageBroken, setImageBroken] = useState(false);
  useEffect(() => setImageBroken(false), [imageSrc]);

  const priceNow =
    product.effective_price +
    Number(variant?.price_delta ?? 0) +
    selectedModifiers.reduce((sum, modifier) => sum + Number(modifier.price_delta ?? 0), 0);
  const selectedKey = cartLineKey(product, variant, selectedModifiers);
  const selectedQty = cartLines
    .filter((line) => line.key === selectedKey)
    .reduce((sum, line) => sum + line.qty, 0);
  const hasInlineOptions = sizeOptions.length > 0 || inlineGroups.length > 0;

  function add() {
    if (product.is_available) onAdd(variant, selectedModifiers);
  }

  function isControl(target: EventTarget | null) {
    return target instanceof HTMLElement && Boolean(target.closest("button, input, select, textarea, a"));
  }

  return (
    <article
      className={product.is_available ? "posx-card2" : "posx-card2 off"}
      role="button"
      tabIndex={product.is_available ? 0 : -1}
      aria-label={`${product.name_ar} — كليك شمال للإضافة، كليك يمين للتقليل`}
      onClick={(event) => { if (!isControl(event.target)) add(); }}
      onContextMenu={(event) => {
        event.preventDefault();
        if (!isControl(event.target) && selectedQty > 0) onQuickRemove(variant, selectedModifiers);
      }}
      onKeyDown={(event) => {
        if ((event.key === "Enter" || event.key === " ") && !isControl(event.target)) {
          event.preventDefault();
          add();
        }
      }}
    >
      <div className="posx-card2-media">
        {showImage && imageSrc && !imageBroken
          ? <img className="posx-card2-img" src={imageSrc} alt={product.name_ar} onError={() => setImageBroken(true)} />
          : <span className="posx-card2-img ph" />}
        <span className="posx-card2-price">{money(priceNow)}</span>
        {selectedQty > 0 && <span className="posx-card2-qty-badge">×{selectedQty}</span>}
      </div>

      <div className="posx-card2-info">
        <h3 className="posx-card2-name">{product.name_ar}</h3>
      </div>

      {!product.is_available && <div className="posx-card2-off">{product.availability_note_ar ?? t.menu.unavailable}</div>}

      {product.is_available && (
        <div className="posx-card2-options">
          {sizeOptions.length > 0 && (
            <div className="posx-card2-opt">
              <span className="posx-card2-opt-label">الحجم</span>
              <div className="posx-chips" role="group" aria-label="الحجم">
                {sizeOptions.map((option) => (
                  <button
                    type="button"
                    key={option.label}
                    className={selectedSize === option.label ? "active" : ""}
                    onClick={(event) => { event.stopPropagation(); selectSize(option.label); }}
                    onContextMenu={(event) => event.stopPropagation()}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {inlineGroups.map((group) => (
            <div key={group.id} className="posx-card2-opt">
              <span className="posx-card2-opt-label">{group.name_ar.includes("عيش") ? "نوع العيش" : group.name_ar}</span>
              <div className="posx-chips" role="group" aria-label={group.name_ar}>
                {group.modifiers.map((modifier) => (
                  <button
                    type="button"
                    key={modifier.id}
                    className={breadSel[group.id]?.id === modifier.id ? "active" : ""}
                    onClick={(event) => { event.stopPropagation(); selectModifier(group, modifier); }}
                    onContextMenu={(event) => event.stopPropagation()}
                  >
                    {modifier.name_ar}
                  </button>
                ))}
              </div>
            </div>
          ))}

          {!hasInlineOptions && <div className="posx-card2-direct">اضغط على الكارت للإضافة</div>}
        </div>
      )}
    </article>
  );
}

