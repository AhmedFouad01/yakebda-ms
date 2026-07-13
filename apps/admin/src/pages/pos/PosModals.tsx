import { api } from "../../lib/api";
import { t } from "../../lib/t";
import { Receipt } from "../../components/Receipt";
import { OrderDetail } from "../../components/OrderDetail";
import { ShiftPanel } from "./ShiftPanel";
import type { PosController } from "./usePosController";
import { money } from "./utils";

export function PosModals({ controller }: { controller: PosController }) {
  const {
    historyOrder, setHistoryOrder, done, setDone, settings, setMsg, setError,
    customerModalOpen, setCustomerModalOpen, quickName, setQuickName, quickPhone,
    setQuickPhone, quickAddress, setQuickAddress, quickBusy, createQuickCustomer,
    addressModalOpen, setAddressModalOpen, selectedCustomer, quickAddressLabel,
    setQuickAddressLabel, addQuickAddress, phoneModalOpen, setPhoneModalOpen,
    quickExtraPhone, setQuickExtraPhone, addQuickPhone, adminPanel, setAdminPanel,
    shift, openShift, closeShift,
  } = controller;

  return (
    <>
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
    </>
  );
}
