export type ReportCategory =
  | "sales_orders"
  | "products_menu"
  | "shifts_cash"
  | "customers"
  | "inventory"
  | "kitchen"
  | "finance";

export type ReportFilterKey = "days" | "branch_id";
export type ReportVisualizationKind = "kpis" | "line" | "bar" | "table";
export type ReportStatus = "active" | "planned";

export interface ReportDefinition {
  id: string;
  category: ReportCategory;
  title_ar: string;
  description_ar: string;
  permission: "reports.view";
  filters: ReportFilterKey[];
  visualizations: ReportVisualizationKind[];
  status: ReportStatus;
}

export interface ReportRunFilters {
  days?: number;
  branch_id?: string | null;
}

export interface ReportRunMeta {
  report_id: string;
  generated_at: string;
  timezone: string;
  currency: "EGP";
  filters: ReportRunFilters;
}

export interface ReportResponse<T> {
  data: T;
  meta: ReportRunMeta;
}

export interface ReportCatalogResponse {
  data: ReportDefinition[];
}

export interface ReportSummary {
  sales_today: number;
  orders_today: number;
  open_orders: number;
  kitchen_pending: number;
  cancelled_today: number;
  open_shifts: number;
  open_shift_cash_sales: number;
}

export interface SalesByDayRow {
  day: string;
  total: number;
}

export interface SalesByBranchRow {
  branch_id: string;
  branch: string;
  total: number;
}

export interface SalesBySourceRow {
  source_id: string | null;
  source: string;
  total: number;
}

export interface SalesReportData {
  by_day: SalesByDayRow[];
  by_branch: SalesByBranchRow[];
  by_source: SalesBySourceRow[];
}

export interface TopProductReportRow {
  name_ar: string;
  qty: number;
  total: number;
}

export interface PaymentMethodReportRow {
  method: string;
  total: number;
  count: number;
}
