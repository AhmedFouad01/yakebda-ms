import { FullOrder } from "./Receipt";
import { t } from "../lib/t";
import { resolveAssetUrl } from "../lib/api";

/**
 * YKMS-02G — مراجعة تشغيلية كاملة للطلب.
 * أقسام: الهوية / الطاقم / العميل / الأصناف / المالية / الجدول الزمني.
 * لا تلفيق: القيم غير المتوفرة تظهر «غير متاح».
 */

const NA = "غير متاح";

function money(v: string | number | null | undefined): string {
  if (v == null) return NA;
  return `${Number(v).toFixed(2)} ج.م`;
}

function exact(iso: string | null | undefined): string {
  if (!iso) return NA;
  const d = new Date(iso);
  return `${d.toLocaleDateString("ar-EG", { day: "numeric", month: "long", year: "numeric" })} — ${d.toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`;
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="od-section">
      <h4>{title}</h4>
      <div className="od-section-body">{children}</div>
    </div>
  );
}

const PAY_LABEL: Record<string, string> = { cash: "نقدي", card: "بطاقة", wallet: "محفظة", unpaid: "آجل" };

export function OrderDetail({ order }: { order: FullOrder }) {
  const paid = order.payments.reduce((s, p) => s + Number(p.amount), 0);
  const total = Number(order.total);
  const balance = total - paid;
  const payStatus = paid <= 0 ? "غير مدفوع" : paid < total ? "مدفوع جزئيًا" : "مدفوع بالكامل";

  const timeline: Array<[string, string | null | undefined]> = [
    ["أُنشئ", order.created_at],
    ["أُرسل", order.submitted_at],
    ["دخل المطبخ", order.in_kitchen_at],
    ["جاهز", order.ready_at],
    ["اكتمل", order.completed_at],
    ["أُلغي", order.cancelled_at],
  ];

  // زمن التحضير الفعلي إن توفرت الطوابع
  let prepMin: number | null = null;
  if (order.submitted_at && order.ready_at) {
    const m = (new Date(order.ready_at).getTime() - new Date(order.submitted_at).getTime()) / 60000;
    if (m >= 0) prepMin = Math.round(m * 10) / 10;
  }

  return (
    <div className="od" dir="rtl">
      <div className="od-grid">
        <Section title="هوية الطلب">
          <Row label="رقم الطلب" value={`${order.order_prefix ?? ""}${order.order_no}`} mono />
          <Row label="المعرّف (UUID)" value={<span className="od-uuid">{order.id}</span>} mono />
          <Row label="الفرع" value={order.branch_name} />
          <Row label="نوع الطلب" value={t.orders.types[order.order_type] ?? order.order_type} />
          <Row label="الحالة" value={<span className={`stub st-${order.status}`}>{t.orders.statuses[order.status] ?? order.status}</span>} />
        </Section>

        <Section title="الطاقم">
          <Row label="الكاشير" value={order.cashier_name} />
          <Row label="السائق" value={order.order_type === "delivery" ? order.driver_name : "—"} />
        </Section>

        <Section title="العميل">
          <Row label="الاسم" value={order.customer_name} />
          <Row label="الهاتف" value={order.customer_phone} mono />
          <Row label="العنوان" value={order.delivery_address ?? order.customer_address} />
        </Section>

        <Section title="المالية">
          <Row label="الإجمالي الفرعي" value={money(order.subtotal)} mono />
          <Row label="الخصم" value={Number(order.discount) ? money(order.discount) : "—"} mono />
          {Number(order.discount) > 0 && <Row label="سبب الخصم" value={order.discount_reason} />}
          <Row label="رسوم الخدمة" value={Number(order.service_fee) ? money(order.service_fee) : "—"} mono />
          <Row label="الضريبة" value={Number(order.vat_amount) ? money(order.vat_amount) : "—"} mono />
          <Row label="رسوم التوصيل" value={Number(order.delivery_fee) ? money(order.delivery_fee) : "—"} mono />
          <Row label="التقريب" value={Number(order.rounding_adjustment) ? money(order.rounding_adjustment) : "—"} mono />
          <Row label="الإجمالي" value={<strong>{money(order.total)}</strong>} mono />
          <Row label="حالة الدفع" value={payStatus} />
          <Row label="المدفوع" value={money(paid)} mono />
          {balance > 0 && <Row label="المتبقي" value={money(balance)} mono />}
          <Row label="طرق الدفع" value={order.payments.length ? order.payments.map((p) => `${PAY_LABEL[p.method] ?? p.method}: ${Number(p.amount).toFixed(2)}`).join("، ") : "—"} />
        </Section>
      </div>

      <Section title={`الأصناف (${order.items.length})`}>
        <table className="od-items">
          <thead>
            <tr><th>الصنف</th><th>الكمية</th><th>سعر الوحدة</th><th>الإجمالي</th></tr>
          </thead>
          <tbody>
            {order.items.map((i) => (
              <tr key={i.id}>
                <td>
                  <div className="od-item-main">
                    {i.image_url ? <img className="od-item-image" src={resolveAssetUrl(i.image_url)} alt="" /> : <span className="od-item-image ph">{i.name_ar.trim().charAt(0)}</span>}
                    <div>
                      <strong>{i.name_ar}{i.variant_name_ar ? ` — ${i.variant_name_ar}` : ""}</strong>
                      {i.modifiers.length > 0 && <div className="od-mods">{i.modifiers.map((m) => m.name_ar).join("، ")}</div>}
                      {i.notes && <div className="od-inote">ملاحظة: {i.notes}</div>}
                    </div>
                  </div>
                </td>
                <td>{i.qty}</td>
                <td className="mono">{Number(i.unit_price).toFixed(2)}</td>
                <td className="mono">{Number(i.line_total).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {order.notes && <div className="od-inote">ملاحظة الطلب: {order.notes}</div>}
      </Section>

      <Section title="الجدول الزمني">
        <div className="od-timeline">
          {timeline.map(([label, iso]) => (
            <div key={label} className={`od-tl-item${iso ? " done" : ""}`}>
              <span className="od-tl-dot" />
              <span className="od-tl-label">{label}</span>
              <span className={`od-tl-time${iso ? "" : " na"}`}>{exact(iso)}</span>
            </div>
          ))}
        </div>
        {prepMin != null && <Row label="زمن التحضير الفعلي" value={`${prepMin} دقيقة`} />}
        {order.cancel_reason && <Row label="سبب الإلغاء" value={order.cancel_reason} />}
      </Section>
    </div>
  );
}
