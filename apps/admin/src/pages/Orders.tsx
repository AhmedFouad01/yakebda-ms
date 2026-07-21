import { useEffect, useState } from "react";
import type { OrderListSummary } from "@ykms/contracts";
import { api } from "../lib/api";
import { t } from "../lib/t";
import { Receipt, FullOrder } from "../components/Receipt";
import { OrderDetail } from "../components/OrderDetail";
import { DialogLayer } from "../components/ui/overlays";
import { useMe } from "../lib/me";
import { orderStatusLabel, orderTypeLabel } from "../lib/labels";

type OrderRow = OrderListSummary;

interface Driver {
  id: string;
  name: string;
  is_active: boolean;
}

export function Orders() {
  const { can } = useMe();
  const [rows, setRows] = useState<OrderRow[]>([]);
  const [status, setStatus] = useState("");
  const [current, setCurrent] = useState<FullOrder | null>(null);
  const [detailView, setDetailView] = useState<"detail" | "receipt">("detail");
  const [cancelReason, setCancelReason] = useState("");
  const [payMethod, setPayMethod] = useState<"cash" | "card" | "wallet">("cash");
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [allowCancel, setAllowCancel] = useState(true);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  async function load() {
    const res = await api<{ data: OrderRow[] }>(`/orders${status ? `?status=${status}` : ""}`);
    setRows(res.data);
  }
  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [status]);

  useEffect(() => {
    // YKMS-02E: قائمة السائقين لتعيين طلبات الدليفري + قاعدة السماح بالإلغاء
    if (can("delivery.assign")) api<{ data: Driver[] }>("/drivers").then((r) => setDrivers(r.data)).catch(() => {});
    api<{ data: { allow_order_cancel: boolean } }>("/settings").then((r) => setAllowCancel(r.data.allow_order_cancel !== false)).catch(() => {});
  }, [can]);

  async function open(id: string) {
    setError("");
    setMsg("");
    const res = await api<{ data: FullOrder }>(`/orders/${id}`);
    setCurrent(res.data);
    setDetailView("detail");
  }

  async function act(fn: () => Promise<unknown>) {
    try {
      await fn();
      if (current) await open(current.id);
      await load();
      setMsg(t.common.save + " ✓");
      setError("");
    } catch (e: any) {
      setError(e.message);
    }
  }

  const paid = current ? current.payments.reduce((s, p) => s + Number(p.amount), 0) : 0;

  return (
    <div dir="rtl" className="orders-page">
      <h2>{t.orders.title}</h2>
      <div className="filters orders-filters">
        <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="تصفية الطلبات حسب الحالة">
          <option value="">{t.orders.status}: الكل</option>
          {Object.entries(t.orders.statuses).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </div>
      {error && <div className="alert">{error}</div>}
      {msg && <div className="ok">{msg}</div>}
      <div className="data-table-shell">
        <table className="data-table orders-table">
          <thead>
            <tr>
              <th>{t.orders.orderNo}</th>
              <th>{t.orders.type}</th>
              <th>{t.orders.status}</th>
              <th>{t.orders.total}</th>
              <th>{t.common.createdAt}</th>
              <th>الإجراء</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((o) => (
              <tr key={o.id}>
                <td>#{o.order_prefix ?? ""}{o.order_no}</td>
                <td>{orderTypeLabel(o.order_type)}</td>
                <td><span className={`stub st-${o.status}`}>{orderStatusLabel(o.status)}</span></td>
                <td>{Number(o.total).toFixed(2)} {t.reports.egp}</td>
                <td>{new Date(o.created_at).toLocaleString("ar-EG")}</td>
                <td className="table-actions-cell">
                  <button type="button" className="table-action secondary" onClick={() => open(o.id)}>{t.orders.details}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {current && (
        <DialogLayer
          open
          onClose={() => setCurrent(null)}
          className="modal wide od-modal"
          ariaLabelledBy="orders-detail-title"
        >
            <header className="od-modal-head">
              <div className="od-modal-title">
                <h3 id="orders-detail-title">{t.orders.details} #{current.order_prefix ?? ""}{current.order_no}</h3>
                <span className="od-modal-meta">{new Date(current.created_at).toLocaleString("ar-EG")}</span>
              </div>
              <div className="od-modal-tabs" role="tablist" aria-label="عرض تفاصيل الطلب">
                <button
                  type="button"
                  role="tab"
                  aria-selected={detailView === "detail"}
                  data-state={detailView === "detail" ? "active" : "inactive"}
                  className={detailView === "detail" ? "active" : ""}
                  onClick={() => setDetailView("detail")}
                >
                  المراجعة
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={detailView === "receipt"}
                  data-state={detailView === "receipt" ? "active" : "inactive"}
                  className={detailView === "receipt" ? "active" : ""}
                  onClick={() => setDetailView("receipt")}
                >
                  الفاتورة
                </button>
              </div>
              <button type="button" className="od-modal-x" onClick={() => setCurrent(null)} aria-label="إغلاق تفاصيل الطلب">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                  <path d="M6 6l12 12M18 6 6 18" />
                </svg>
              </button>
            </header>
            <div className="od-modal-body">
              <div className="order-detail">
                {detailView === "detail" ? <OrderDetail order={current} /> : <Receipt order={current} />}
                <aside className="order-actions" aria-label="إجراءات الطلب">
                  {["submitted", "in_kitchen"].includes(current.status) && (
                    <button type="button" className="success" onClick={() => act(() => api(`/orders/${current.id}/status`, { method: "PATCH", body: { status: "ready" } }))}>
                      {t.orders.statuses.ready}
                    </button>
                  )}
                  {current.status === "ready" && (
                    <button type="button" className="success" onClick={() => act(() => api(`/orders/${current.id}/status`, { method: "PATCH", body: { status: "completed" } }))}>
                      {t.orders.statuses.completed}
                    </button>
                  )}
                  {/* YKMS-02E: تعيين سائق لطلب دليفري */}
                  {current.order_type === "delivery" && can("delivery.assign") && current.status !== "cancelled" && (
                    <div className="cancel-box order-action-group">
                      <select
                        aria-label={t.orders.assignDriver}
                        value={current.driver_id ?? ""}
                        onChange={(e) =>
                          act(() =>
                            api(`/orders/${current.id}/assign-driver`, {
                              method: "POST",
                              body: { driver_id: e.target.value || null },
                            })
                          )
                        }
                      >
                        <option value="">{t.orders.assignDriver}…</option>
                        {drivers.filter((d) => d.is_active || d.id === current.driver_id).map((d) => (
                          <option key={d.id} value={d.id}>{d.name}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  {/* YKMS-02E: الإلغاء يُخفى إن كان معطلًا بالإعدادات أو ينقص المستخدم صلاحية الإلغاء */}
                  {!['completed', 'cancelled'].includes(current.status) && allowCancel && can("orders.cancel") && (
                    <div className="cancel-box order-action-group">
                      <input aria-label={t.orders.cancelReason} placeholder={t.orders.cancelReason} value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} />
                      <button
                        type="button"
                        className="danger"
                        onClick={() =>
                          act(() =>
                            api(`/orders/${current.id}/status`, {
                              method: "PATCH",
                              body: { status: "cancelled", cancel_reason: cancelReason || undefined },
                            })
                          )
                        }
                      >
                        {t.orders.cancel}
                      </button>
                    </div>
                  )}
                  {paid < Number(current.total) && current.status !== "cancelled" && (
                    <div className="cancel-box order-action-group">
                      <select aria-label="طريقة الدفع" value={payMethod} onChange={(e) => setPayMethod(e.target.value as typeof payMethod)}>
                        <option value="cash">{t.pos.cash}</option>
                        <option value="card">{t.pos.card}</option>
                        <option value="wallet">{t.pos.wallet}</option>
                      </select>
                      <button
                        type="button"
                        className="primary"
                        onClick={() =>
                          act(() =>
                            api(`/orders/${current.id}/payments`, {
                              method: "POST",
                              body: { method: payMethod, amount: Number(current.total) - paid },
                            })
                          )
                        }
                      >
                        {t.orders.addPayment}
                      </button>
                    </div>
                  )}
                  <button type="button" className="primary" onClick={() => act(() => api(`/orders/${current.id}/print`, { method: "POST", body: {} }))}>
                    {t.pos.printReceipt}
                  </button>
                  <button type="button" className="secondary" onClick={() => setCurrent(null)}>{t.pos.close}</button>
                </aside>
              </div>
            </div>
        </DialogLayer>
      )}
    </div>
  );
}
