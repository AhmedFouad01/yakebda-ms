export type ReportCategory =
  | "sales_orders"
  | "products_menu"
  | "shifts_cash"
  | "customers"
  | "inventory"
  | "kitchen"
  | "finance";

export type ReportFilterKey = "days" | "branch_id";
export type ReportFilterKind = "period_days" | "branch";
export type ReportVisualizationKind = "kpis" | "line" | "bar" | "table";
export type ReportOutputKind = "screen" | "csv" | "xlsx" | "pdf" | "thermal";
export type ReportStatus = "active" | "planned";
export type ReportValueFormat = "money" | "number";
export type ReportTimezonePolicy = "branch" | "account_default";

export interface ReportFilterDefinition {
  key: ReportFilterKey;
  kind: ReportFilterKind;
  label_ar: string;
  required: boolean;
  allowed_values?: Array<string | number>;
}

export interface ReportDimensionDefinition {
  key: string;
  label_ar: string;
}

export interface ReportMeasureDefinition {
  key: string;
  label_ar: string;
  format: ReportValueFormat;
  semantics: string;
}

export interface ReportDefinition {
  id: string;
  category: ReportCategory;
  title_ar: string;
  description_ar: string;
  required_permissions: string[];
  filters: ReportFilterDefinition[];
  dimensions: ReportDimensionDefinition[];
  measures: ReportMeasureDefinition[];
  visualizations: ReportVisualizationKind[];
  supported_outputs: ReportOutputKind[];
  default_template_key: string;
  query_version: string;
  status: ReportStatus;
}

export interface ReportRunFilters {
  days?: number;
  branch_id?: string | null;
}

export interface ReportEffectiveScope {
  account_id: string;
  branch_ids: string[];
}

/**
 * Request-scoped response metadata. This is deliberately not named ReportRun:
 * persisted/snapshot report runs are a later capability and must carry their own durable identity.
 */
export interface ReportResponseMeta {
  request_id: string;
  report_id: string;
  query_version: string;
  generated_at: string;
  generated_by_user_id: string;
  timezone: string;
  timezone_policy: ReportTimezonePolicy;
  currency: "EGP";
  effective_scope: ReportEffectiveScope;
  filters: ReportRunFilters;
}

export interface ReportResponse<T> {
  data: T;
  meta: ReportResponseMeta;
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

export interface SalesTrendReportData {
  rows: SalesByDayRow[];
}

export interface SalesByBranchRow {
  branch_id: string;
  branch: string;
  total: number;
}

export interface SalesByBranchReportData {
  rows: SalesByBranchRow[];
}

export interface SalesBySourceRow {
  source_id: string | null;
  source: string;
  total: number;
}

export interface SalesBySourceReportData {
  rows: SalesBySourceRow[];
}

export interface TopProductReportRow {
  product_id: string;
  name_ar: string;
  qty: number;
  gross_item_sales: number;
}

export interface PaymentMethodReportRow {
  method: string;
  total: number;
  count: number;
}
