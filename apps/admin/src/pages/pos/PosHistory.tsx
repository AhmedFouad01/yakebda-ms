import { resolveAssetUrl } from "../../lib/api";
import { t } from "../../lib/t";
import { Drawer } from "../../components/ui/overlays";
import type { PosController } from "./usePosController";
import { money } from "./utils";
import { orderTypeLabel } from "../../lib/labels";

export function PosHistory({ controller }: { controller: PosController }) {
  const {
    historyOpen, setHistoryOpen, historySearch, setHistorySearch, shiftOrdersCount,
    historyBusy, historyError, historyOrderBusy, historyOrderError, shift, history,
    filteredHistory, expandedHistoryId, setExpandedHistoryId, openHistoryOrder,
  } = controller;

  return (
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
                      <span>{orderTypeLabel(order.order_type)}</span>
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
  );
}
