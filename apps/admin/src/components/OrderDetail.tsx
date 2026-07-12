import { resolveAssetUrl } from "../lib/api";
import { t } from "../lib/t";
import { StatusChip } from "./ui/primitives";
import { FullOrder } from "./Receipt";

const NA = "غير متاح";

type StatusTone = "success" | "warning" | "danger" | "info";

function money(v: string | number | null | undefined): string {
  if (v == null) return NA;
  return `${Number(v).toFixed(2)} ج.م`;
}

function exact(iso: string | null | undefined): string {
  if (!iso) return NA;
  const d = new Date(iso);
  return `${d.toLocaleDateString("ar-EG", { day: "numeric", month: "long", year: "numeric" })} — ${d.toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`;
}

function orderStatusTone(status: string): StatusTone {
  if (["paid", "completed", "ready"].includes(status)) return "success";
  if (["partial", "submitted", "in_kitchen", "preparing", "waiting"].includes(status)) return "warning";
  if (["unpaid", "cancelled", "failed"].includes(status)) return "danger";
  return "info";
}

function Row({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  const empty = value == null || value === "" || value === NA;
  return (
    <div className="od-row">
      <span className="od-row-label">{label}</span>
      <span className={`od-row-value${empty ? " na" : ""}${mono ? " mono" : ""}`}>{empty ? NA : value}</span>
    </div>
  );
}

function SummaryItem({ label, value, accent }: { label: string; value: React.ReactNode; accent?: boolean }) {
  return (
    <div className={`od-summary-item${accent ? " accent" : ""}`}>
      <span className="od-summary-label">{label}</span>
      <span className="od-summary-value">{value}</span>
    </div>
  );
}

function Section({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`od-section${className ? ` ${className}` : ""}`}>
      <h4>{title}</h4>
      <div className="od-section-body">{children}</div>
    </section>
  );
}

const PAY_LABEL: Record<string, string> = { cash: "نقدي", card: "بطاقة", wallet: "محفظة", unpaid: "آجل" };

export function OrderDetail({ order }: { order: FullOrder }) {
  const paid = order.payments.reduce((sum, payment) => sum + Number(payment.amount), 0);
  const total = Number(order.total);
  const balance = total - paid;
  const paymentTone: StatusTone = paid <= 0 ? "danger" : paid < total ? "warning" : "success";
  const paymentStatus = paid <= 0 ? "غير مدفوع" : paid < total ? "مدفوع جزئيًا" : "مدفوع بالكامل";
  const paymentMethods = order.payments.length
    ? Array.from(new Set(order.payments.map((payment) => PAY_LABEL[payment.method] ?? payment.method))).join("، ")
    : "—";

  const timeline = [
    { key: "created", label: "أُنشئ", iso: order.created_at },
    { key: "submitted", label: "أُرسل", iso: order.submitted_at },
    { key: "in_kitchen", label: "دخل المطبخ", iso: order.in_kitchen_at },
    { key: "ready", label: "جاهز", iso: order.ready_at },
    { key: "completed", label: "اكتمل", iso: order.completed_at },
    { key: "cancelled", label: "أُلغي", iso: order.cancelled_at },
  ];
  const terminal = ["completed", "cancelled"].includes(order.status);
  const currentTimelineIndex = terminal ? -1 : timeline.findIndex((step) => !step.iso);

  let prepMin: number | null = null;
  if (order.submitted_at && order.ready_at) {
    const minutes = (new Date(order.ready_at).getTime() - new Date(order.submitted_at).getTime()) / 60000;
    if (minutes >= 0) prepMin = Math.round(minutes * 10) / 10;
  }

  return (
    <div className="od" dir="rtl">
      <div className="od-summary" aria-label="ملخص الطلب">
        <SummaryItem label="الإجمالي" value={money(order.total)} accent />
        <SummaryItem label="حالة الدفع" value={<StatusChip tone={paymentTone}>{paymentStatus}</StatusChip>} />
        <SummaryItem label="المدفوع" value={money(paid)} />
        <SummaryItem label="طريقة الدفع" value={paymentMethods} />
        <SummaryItem label="نوع الطلب" value={t.orders.types[order.order_type] ?? order.order_type} />
        {order.branch_name && <SummaryItem label="الفرع" value={order.branch_name} />}
        {order.cashier_name && <SummaryItem label="الكاشير" value={order.cashier_name} />}
      </div>

      <div className="od-grid">
        <Section title="بيانات الطلب">
          <Row label="رقم الطلب" value={`${order.order_prefix ?? ""}${order.order_no}`} mono />
          <Row label="الحالة" value={<StatusChip tone={orderStatusTone(order.status)}>{t.orders.statuses[order.status] ?? order.status}</StatusChip>} />
          <Row label="تاريخ الإنشاء" value={exact(order.created_at)} />
          <Row label="المعرّف (UUID)" value={<span className="od-uuid">{order.id}</span>} mono />
          {order.table_name_ar && <Row label="الطاولة" value={order.table_name_ar} />}
          {order.order_type === "delivery" && <Row label="السائق" value={order.driver_name} />}
        </Section>

        <Section title="العميل">
          <Row label="الاسم" value={order.customer_name} />
          <Row label="الهاتف" value={order.customer_phone} mono />
          <Row label="العنوان" value={order.delivery_address ?? order.customer_address} />
        </Section>

        <Section title="التفاصيل المالية">
          <Row label="الإجمالي الفرعي" value={money(order.subtotal)} mono />
          <Row label="الخصم" value={Number(order.discount) ? money(order.discount) : "—"} mono />
          {Number(order.discount) > 0 && <Row label="سبب الخصم" value={order.discount_reason} />}
          <Row label="رسوم الخدمة" value={Number(order.service_fee) ? money(order.service_fee) : "—"} mono />
          <Row label="الضريبة" value={Number(order.vat_amount) ? money(order.vat_amount) : "—"} mono />
          <Row label="رسوم التوصيل" value={Number(order.delivery_fee) ? money(order.delivery_fee) : "—"} mono />
          <Row label="التقريب" value={Number(order.rounding_adjustment) ? money(order.rounding_adjustment) : "—"} mono />
          {balance > 0 && <Row label="المتبقي" value={money(balance)} mono />}
        </Section>
      </div>

      <Section title={`الأصناف (${order.items.length})`} className="od-items-section">
        <div className="od-items-wrap">
          <table className="od-items">
            <thead>
              <tr><th>الصنف</th><th>الكمية</th><th>سعر الوحدة</th><th>الإجمالي</th></tr>
            </thead>
            <tbody>
              {order.items.map((item) => (
                <tr key={item.id}>
                  <td data-label="الصنف">
                    <div className="od-item-main">
                      {item.image_url ? <img className="od-item-image" src={resolveAssetUrl(item.image_url)} alt="" /> : <span className="od-item-image ph">{item.name_ar.trim().charAt(0)}</span>}
                      <div className="od-item-copy">
                        <strong>{item.name_ar}</strong>
                        {item.variant_name_ar && <div className="od-variant">{item.variant_name_ar}</div>}
                        {item.modifiers.length > 0 && <div className="od-mods">{item.modifiers.map((modifier) => modifier.name_ar).join("، ")}</div>}
                        {item.notes && <div className="od-inote">ملاحظة: {item.notes}</div>}
                      </div>
                    </div>
                  </td>
                  <td data-label="الكمية">{item.qty}</td>
                  <td data-label="سعر الوحدة" className="mono">{Number(item.unit_price).toFixed(2)}</td>
                  <td data-label="الإجمالي" className="mono od-line-total">{Number(item.line_total).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {order.notes && <div className="od-order-note"><strong>ملاحظة الطلب:</strong> {order.notes}</div>}
      </Section>

      <Section title="الجدول الزمني" className="od-timeline-section">
        <div className="od-timeline">
          {timeline.map((step, index) => {
            const state = step.key === "cancelled" && step.iso
              ? "danger"
              : step.iso
                ? "done"
                : index === currentTimelineIndex
                  ? "current"
                  : "future";
            return (
              <div key={step.key} className={`od-tl-item ${state}`}>
                <span className="od-tl-dot" aria-hidden />
                <span className="od-tl-label">{step.label}</span>
                <span className={`od-tl-time${step.iso ? "" : " na"}`}>{exact(step.iso)}</span>
              </div>
            );
          })}
        </div>
        {prepMin != null && <Row label="زمن التحضير الفعلي" value={`${prepMin} دقيقة`} />}
        {order.cancel_reason && <Row label="سبب الإلغاء" value={order.cancel_reason} />}
      </Section>
    </div>
  );
}
