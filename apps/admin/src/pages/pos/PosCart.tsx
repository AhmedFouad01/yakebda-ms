import { PosCartLine } from "../../components/pos/PosCartLine";
import { t } from "../../lib/t";
import type { PosController } from "./usePosController";
import { money, paymentLabels, unitPrice } from "./utils";

export function PosCart({ controller }: { controller: PosController }) {
  const {
    can, cart, setCart, cartDrawerOpen, setCartDrawerOpen, itemCount, error, msg,
    enabledOrderTypes, orderType, setOrderType, sourceId, setSourceId, sources, sourceSelectRef,
    setDeliveryZoneId, setDeliveryFee, customers, customerId, selectDeliveryCustomer,
    selectedCustomer, setCustomerModalOpen, customerAddressOptions, deliveryAddress,
    setDeliveryAddress, setAddressModalOpen, deliveryZoneId, deliveryZones, setPhoneModalOpen,
    deliveryPhone, setDeliveryPhone, customerPhoneOptions, settings, discount, setDiscount,
    discountReason, setDiscountReason, discountOverLimit, belowMinDelivery, deliveryMinimum,
    kitchenPaused, kitchenPauseReason,
    orderNotes, setOrderNotes, enabledMethods, payment, setPayment, cashBlocked, currentQuote,
    serviceFeeEstimate, activeDeliveryFee, vatEstimate, quoteBusy, total, quoteError,
    discountReasonMissing, busy, fireOrder,
  } = controller;

  return (
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
          {kitchenPaused && (
            <div className="posx-paused-banner" role="status" aria-live="polite">
              المطبخ متوقف مؤقتًا{kitchenPauseReason ? ` — ${kitchenPauseReason}` : ""}. لا يمكن إرسال طلبات جديدة حتى الاستئناف.
            </div>
          )}
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
                  onRemove={() => setCart((rows) => rows.filter((_, i) => i !== index))}
                  onNotesChange={(notes) => setCart((rows) => rows.map((row, i) => i === index ? { ...row, notes } : row))}
                />
              ))}
            </div>

          <div className="posx-opts">
            {orderType === "delivery" && (
              <div className="posx-delivery-fields">
                <label className="posx-delivery-field posx-delivery-customer">
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

                <label className="posx-delivery-field posx-delivery-address">
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

                <label className="posx-delivery-field posx-delivery-zone">
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

                <label className="posx-delivery-field posx-delivery-phone">
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

                <label className="posx-delivery-field posx-delivery-notes">
                  <span className="posx-delivery-label"><b>ملاحظات التوصيل</b></span>
                  <input placeholder={t.pos.orderNotes} value={orderNotes} onChange={(event) => setOrderNotes(event.target.value)} />
                </label>
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
            {orderType !== "delivery" && <input placeholder={t.pos.orderNotes} value={orderNotes} onChange={(e) => setOrderNotes(e.target.value)} />}
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
            const pausedReason = kitchenPaused ? "المطبخ متوقف مؤقتًا — لا تُقبل طلبات جديدة" : null;
            const payReason = pausedReason ?? fireReason ?? (cashBlocked ? "يجب فتح شيفت" : null);
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
  );
}
