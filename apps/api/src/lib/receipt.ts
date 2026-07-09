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

export function renderReceiptPayload(order: ReceiptOrder) {
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
  if (Number(order.delivery_fee) > 0) lines.push(`رسوم التوصيل: ${money(order.delivery_fee)}`);
  lines.push(`الإجمالي: ${money(order.total)}`);
  for (const p of order.payments) {
    lines.push(`طريقة الدفع: ${PAYMENT_AR[p.method] ?? p.method} — ${money(p.amount)}`);
  }
  if (order.notes) lines.push(`ملاحظات: ${order.notes}`);
  lines.push("--------------------------------");
  lines.push("شكرًا لاختيارك يا كبدة");
  return { template: "receipt_v1", dir: "rtl", lines };
}
