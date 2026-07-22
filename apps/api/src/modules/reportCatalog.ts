import type { ReportDefinition, ReportFilterDefinition } from "@ykms/contracts";

/**
 * Typed against the shared contract rather than `as const`: a const assertion
 * makes `allowed_values` readonly, which the wire contract does not accept.
 * Each definition below spreads these, so callers get their own object.
 */
const DAYS_FILTER: ReportFilterDefinition = {
  key: "days",
  kind: "period_days",
  label_ar: "الفترة",
  required: true,
  allowed_values: [7, 30, 90],
};

const BRANCH_FILTER: ReportFilterDefinition = {
  key: "branch_id",
  kind: "branch",
  label_ar: "الفرع",
  required: false,
};

export const REPORT_CATALOG: ReportDefinition[] = [
  {
    id: "sales.summary",
    category: "sales_orders",
    title_ar: "ملخص التشغيل اليومي",
    description_ar: "مبيعات وطلبات اليوم وحالة الطلبات والشيفتات المفتوحة.",
    required_permissions: ["reports.view"],
    filters: [{ ...BRANCH_FILTER }],
    dimensions: [],
    measures: [
      { key: "sales_today", label_ar: "مبيعات اليوم المحصلة", format: "money", semantics: "sum of settled payment amounts excluding unpaid" },
      { key: "orders_today", label_ar: "طلبات اليوم", format: "number", semantics: "orders created in the effective reporting day" },
      { key: "open_orders", label_ar: "الطلبات المفتوحة", format: "number", semantics: "submitted, in_kitchen and ready orders" },
      { key: "kitchen_pending", label_ar: "قيد التنفيذ بالمطبخ", format: "number", semantics: "submitted and in_kitchen orders" },
      { key: "cancelled_today", label_ar: "ملغاة اليوم", format: "number", semantics: "cancelled orders created in the effective reporting day" },
      { key: "open_shifts", label_ar: "الشيفتات المفتوحة", format: "number", semantics: "currently open shifts" },
      { key: "open_shift_cash_sales", label_ar: "نقدية الشيفتات المفتوحة", format: "money", semantics: "cash payments linked to currently open shifts" },
    ],
    visualizations: ["kpis"],
    supported_outputs: ["screen"],
    default_template_key: "sales-summary-default",
    query_version: "1.1.0",
    status: "active",
  },
  {
    id: "sales.trend",
    category: "sales_orders",
    title_ar: "اتجاه المبيعات",
    description_ar: "المدفوعات المحصلة يوميًا خلال الفترة المحددة.",
    required_permissions: ["reports.view"],
    filters: [{ ...DAYS_FILTER }, { ...BRANCH_FILTER }],
    dimensions: [{ key: "day", label_ar: "اليوم" }],
    measures: [{ key: "total", label_ar: "المدفوعات المحصلة", format: "money", semantics: "settled payment amount excluding unpaid" }],
    visualizations: ["line", "table"],
    supported_outputs: ["screen"],
    default_template_key: "sales-trend-default",
    query_version: "1.1.0",
    status: "active",
  },
  {
    id: "sales.by_branch",
    category: "sales_orders",
    title_ar: "المبيعات حسب الفرع",
    description_ar: "مقارنة المدفوعات المحصلة بين الفروع المسموح بها.",
    required_permissions: ["reports.view"],
    filters: [{ ...DAYS_FILTER }, { ...BRANCH_FILTER }],
    dimensions: [{ key: "branch_id", label_ar: "الفرع" }],
    measures: [{ key: "total", label_ar: "المدفوعات المحصلة", format: "money", semantics: "settled payment amount excluding unpaid" }],
    visualizations: ["bar", "table"],
    supported_outputs: ["screen"],
    default_template_key: "sales-by-branch-default",
    query_version: "1.1.0",
    status: "active",
  },
  {
    id: "sales.by_source",
    category: "sales_orders",
    title_ar: "المبيعات حسب المصدر",
    description_ar: "مقارنة مصادر الطلبات باستخدام الاسم التاريخي المحفوظ وقت الطلب.",
    required_permissions: ["reports.view"],
    filters: [{ ...DAYS_FILTER }, { ...BRANCH_FILTER }],
    dimensions: [{ key: "source_id", label_ar: "مصدر الطلب" }],
    measures: [{ key: "total", label_ar: "المدفوعات المحصلة", format: "money", semantics: "settled payment amount excluding unpaid, grouped by order source snapshot" }],
    visualizations: ["bar", "table"],
    supported_outputs: ["screen"],
    default_template_key: "sales-by-source-default",
    query_version: "1.1.0",
    status: "active",
  },
  {
    id: "sales.payment_methods",
    category: "sales_orders",
    title_ar: "طرق الدفع المحصلة",
    description_ar: "إجمالي وعدد عمليات الدفع المحصلة؛ الطلبات غير المدفوعة ليست وسيلة تحصيل ولا تدخل التقرير.",
    required_permissions: ["reports.view"],
    filters: [{ ...DAYS_FILTER }, { ...BRANCH_FILTER }],
    dimensions: [{ key: "method", label_ar: "طريقة الدفع" }],
    measures: [
      { key: "total", label_ar: "المبلغ المحصل", format: "money", semantics: "settled payment amount excluding unpaid" },
      { key: "count", label_ar: "عدد عمليات التحصيل", format: "number", semantics: "count of settled payment rows excluding unpaid" },
    ],
    visualizations: ["bar", "table"],
    supported_outputs: ["screen"],
    default_template_key: "payment-methods-default",
    query_version: "1.1.0",
    status: "active",
  },
  {
    id: "sales.top_products",
    category: "products_menu",
    title_ar: "أفضل الأصناف",
    description_ar: "الأصناف الأعلى كمية وإجمالي قيمة بنود الطلبات غير الملغاة؛ القيمة إجمالية وليست صافي تحصيل.",
    required_permissions: ["reports.view"],
    filters: [{ ...DAYS_FILTER }, { ...BRANCH_FILTER }],
    dimensions: [{ key: "product_id", label_ar: "الصنف" }],
    measures: [
      { key: "qty", label_ar: "الكمية", format: "number", semantics: "sum of sold item snapshot quantities on non-cancelled orders" },
      { key: "gross_item_sales", label_ar: "إجمالي قيمة البنود", format: "money", semantics: "sum of order item line_total before refund allocation" },
    ],
    visualizations: ["bar", "table"],
    supported_outputs: ["screen"],
    default_template_key: "top-products-default",
    query_version: "1.1.0",
    status: "active",
  },
  {
    id: "inventory.current_stock",
    category: "inventory",
    title_ar: "الرصيد الحالي",
    description_ar: "أرصدة وتقييم المخزون حسب الموقع.",
    required_permissions: ["reports.view", "inventory.view"],
    filters: [{ ...BRANCH_FILTER }],
    dimensions: [{ key: "inventory_item_id", label_ar: "صنف المخزون" }],
    measures: [
      { key: "quantity_on_hand", label_ar: "الرصيد", format: "number", semantics: "authoritative server-derived append-only inventory balance" },
      { key: "stock_value", label_ar: "قيمة المخزون", format: "money", semantics: "authoritative server-derived inventory valuation" },
    ],
    visualizations: ["table"],
    supported_outputs: ["screen"],
    default_template_key: "inventory-current-stock-default",
    query_version: "1.0.0",
    status: "planned",
  },
  {
    id: "shifts.close_snapshot",
    category: "shifts_cash",
    title_ar: "إغلاق الشيفت",
    description_ar: "لقطة ثابتة للمبيعات والمدفوعات وفروق النقدية.",
    required_permissions: ["reports.view", "shifts.view"],
    filters: [{ ...BRANCH_FILTER }],
    dimensions: [{ key: "shift_id", label_ar: "الشيفت" }],
    measures: [],
    visualizations: ["kpis", "table"],
    supported_outputs: ["screen", "pdf", "thermal"],
    default_template_key: "shift-close-default",
    query_version: "1.0.0",
    status: "planned",
  },
];

export const ACTIVE_REPORT_CATALOG = REPORT_CATALOG.filter(
  (definition) => definition.status === "active"
);

export function getReportDefinition(reportId: string): ReportDefinition {
  const definition = REPORT_CATALOG.find((entry) => entry.id === reportId);
  if (!definition) throw new Error(`Unknown report definition: ${reportId}`);
  return definition;
}
