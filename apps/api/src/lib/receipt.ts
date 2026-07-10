/**
 * YKMS-02 — Arabic receipt renderer.
 * Produces the print-job payload consumed by the Local Device Bridge
 * ({ lines, template }) — same contract as YKMS-01H test prints.
 */

const ORDER_TYPE_AR: Record<string, string> = {
  dine_in: "صالة",
  takeaway: "تيك أواي",
  delivery: "دليفري",
};

const PAYMENT_AR: Record<string, string> = {
  cash: "نقدي",
  card: "بطاقة",
  wallet: "محفظة",
  unpaid: "غير مدفوع",
};

interface ReceiptOrder {
  order_no: number;
  order_type: string;
  branch_name: string;
  table_name_ar?: string | null;
  customer_name?: string | null;
  delivery_address?: string | null;
  delivery_fee: string | number;
  subtotal: string | number;
  discount: string | number;
  total: string | number;
  notes?: string | null;
  created_at: string | Date;
  items: Array<{
    name_ar: string;
    variant_name_ar?: string | null;
    qty: number;
    unit_price: string | number;
    line_total: string | number;
    notes?: string | null;
    modifiers: Array<{ name_ar: string; price_delta: string | number }>;
  }>;
  payments: Array<{ method: string; amount: string | number }>;
}

const money = (v: string | number) => `${Number(v).toFixed(2)} ج.م`;

export interface ReceiptOptions {
  footer?: string;
  paperWidthMm?: 58 | 80;
  copies?: number;
  taxDisplay?: "combined" | "detailed";
}

export function renderReceiptPayload(order: ReceiptOrder, opts: ReceiptOptions = {}) {
  const lines: string[] = [];
  lines.push("يا كبدة — YAKEBDA MS");
  lines.push(order.branch_name);
  lines.push("--------------------------------");
  lines.push(`طلب رقم: ${order.order_no} — ${ORDER_TYPE_AR[order.order_type] ?? order.order_type}`);
  if (order.table_name_ar) lines.push(`الطاولة: ${order.table_name_ar}`);
  if (order.customer_name) lines.push(`العميل: ${order.customer_name}`);
  if (order.delivery_address) lines.push(`العنوان: ${order.delivery_address}`);
  lines.push(`التاريخ: ${new Date(order.created_at).toLocaleString("ar-EG")}`);
  lines.push("--------------------------------");
  for (const item of order.items) {
    const name = item.variant_name_ar ? `${item.name_ar} (${item.variant_name_ar})` : item.name_ar;
    lines.push(`${item.qty} × ${name} — ${money(item.line_total)}`);
    for (const m of item.modifiers) {
      lines.push(`  + ${m.name_ar}${Number(m.price_delta) ? ` (${money(m.price_delta)})` : ""}`);
    }
    if (item.notes) lines.push(`  ملاحظة: ${item.notes}`);
  }
  lines.push("--------------------------------");
  lines.push(`الإجمالي الفرعي: ${money(order.subtotal)}`);
  if (Number(order.discount) > 0) lines.push(`الخصم: -${money(order.discount)}`);
  if (Number((order as { service_fee?: string | number }).service_fee ?? 0) > 0)
    lines.push(`رسوم الخدمة: ${money((order as { service_fee?: string | number }).service_fee!)}`);
  if (Number(order.delivery_fee) > 0) lines.push(`رسوم التوصيل: ${money(order.delivery_fee)}`);
  if (opts.taxDisplay === "detailed" && Number((order as { vat_amount?: string | number }).vat_amount ?? 0) > 0)
    lines.push(`ض.ق.م: ${money((order as { vat_amount?: string | number }).vat_amount!)}`);
  if (Number((order as { rounding_adjustment?: string | number }).rounding_adjustment ?? 0) !== 0)
    lines.push(`تقريب: ${money((order as { rounding_adjustment?: string | number }).rounding_adjustment!)}`);
  lines.push(`الإجمالي: ${money(order.total)}`);
  for (const p of order.payments) {
    lines.push(`طريقة الدفع: ${PAYMENT_AR[p.method] ?? p.method} — ${money(p.amount)}`);
  }
  if (order.notes) lines.push(`ملاحظات: ${order.notes}`);
  lines.push("--------------------------------");
  lines.push(opts.footer || "شكرًا لاختيارك يا كبدة");
  return {
    template: "receipt_v1",
    dir: "rtl",
    paper_width_mm: opts.paperWidthMm ?? 80,
    copies: opts.copies ?? 1,
    lines,
  };
}

/** YKMS-02E — تذكرة مطبخ: أصناف وكميات وملاحظات فقط (بلا أسعار). */
export function renderKitchenTicketPayload(order: ReceiptOrder, paperWidthMm: 58 | 80 = 80) {
  const lines: string[] = [];
  lines.push("تذكرة مطبخ — يا كبدة");
  lines.push(`طلب ${order.order_no}${order.order_type ? ` — ${ORDER_TYPE_AR[order.order_type] ?? order.order_type}` : ""}`);
  lines.push(`الوقت: ${new Date(order.created_at).toLocaleTimeString("ar-EG")}`);
  lines.push("--------------------------------");
  for (const item of order.items) {
    const name = item.variant_name_ar ? `${item.name_ar} (${item.variant_name_ar})` : item.name_ar;
    lines.push(`${item.qty} × ${name}`);
    for (const m of item.modifiers) lines.push(`  + ${m.name_ar}`);
    if (item.notes) lines.push(`  ملاحظة: ${item.notes}`);
  }
  if (order.notes) {
    lines.push("--------------------------------");
    lines.push(`ملاحظات الطلب: ${order.notes}`);
  }
  return { template: "kitchen_ticket_v1", dir: "rtl", paper_width_mm: paperWidthMm, lines };
}
