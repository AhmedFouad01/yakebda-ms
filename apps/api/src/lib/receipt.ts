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
  source_name?: string | null;
  table_name_ar?: string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  delivery_zone_name?: string | null;
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
  if (order.source_name) lines.push(`المصدر: ${order.source_name}`);
  if (order.table_name_ar) lines.push(`الطاولة: ${order.table_name_ar}`);
  if (order.customer_name) lines.push(`العميل: ${order.customer_name}`);
  if (order.customer_phone) lines.push(`التليفون: ${order.customer_phone}`);
  if (order.delivery_zone_name) lines.push(`زون التوصيل: ${order.delivery_zone_name}`);
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
  if (order.source_name) lines.push(`المصدر: ${order.source_name}`);
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

export interface ShiftReportData {
  branch_name: string;
  cashier_name?: string | null;
  opened_at: string | Date;
  closed_at?: string | Date | null;
  status: string;
  opening_cash: string | number;
  totals: {
    cash_sales: number;
    card_sales: number;
    wallet_sales: number;
    cash_in: number;
    cash_out: number;
    expected_cash: number;
    orders_count: number;
  };
  actual_cash?: string | number | null;
  variance?: number | null;
  over_short?: string | null;
  unsettled_count: number;
}

export function renderShiftReportPayload(data: ShiftReportData, paperWidthMm: 58 | 80 = 80) {
  const format = (value: string | number | null | undefined) => money(value ?? 0);
  const overShortAr: Record<string, string> = { over: "زيادة", short: "عجز", even: "مطابق" };
  const lines: string[] = [];
  lines.push("تقرير إغلاق الشيفت - يا كبدة");
  lines.push(data.branch_name);
  if (data.cashier_name) lines.push(`الكاشير: ${data.cashier_name}`);
  lines.push("--------------------------------");
  lines.push(`الفتح: ${new Date(data.opened_at).toLocaleString("ar-EG")}`);
  if (data.closed_at) lines.push(`الإغلاق: ${new Date(data.closed_at).toLocaleString("ar-EG")}`);
  lines.push(`الحالة: ${data.status === "closed" ? "مغلق" : "مفتوح"}`);
  lines.push("--------------------------------");
  lines.push(`عدد الطلبات: ${data.totals.orders_count}`);
  lines.push(`مبيعات نقدي: ${format(data.totals.cash_sales)}`);
  lines.push(`مبيعات بطاقة: ${format(data.totals.card_sales)}`);
  lines.push(`مبيعات محفظة: ${format(data.totals.wallet_sales)}`);
  lines.push("--------------------------------");
  lines.push(`رصيد افتتاحي: ${format(data.opening_cash)}`);
  lines.push(`إيداع نقدي: ${format(data.totals.cash_in)}`);
  lines.push(`سحب نقدي: ${format(data.totals.cash_out)}`);
  lines.push(`النقدي المتوقع: ${format(data.totals.expected_cash)}`);
  if (data.actual_cash != null) {
    lines.push(`النقدي الفعلي: ${format(data.actual_cash)}`);
    lines.push(`الفرق: ${format(data.variance)} (${overShortAr[data.over_short ?? "even"] ?? data.over_short})`);
  }
  if (data.unsettled_count > 0) {
    lines.push("--------------------------------");
    lines.push(`تنبيه: ${data.unsettled_count} طلب غير مسوى`);
  }
  lines.push("--------------------------------");
  lines.push(`طبع: ${new Date().toLocaleString("ar-EG")}`);
  return { template: "shift_report_v1", dir: "rtl", paper_width_mm: paperWidthMm, lines };
}
