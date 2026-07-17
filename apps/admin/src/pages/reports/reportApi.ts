import type {
  PaymentMethodReportRow,
  ReportCatalogResponse,
  ReportResponse,
  ReportSummary,
  SalesReportData,
  TopProductReportRow,
} from "@ykms/contracts";
import { api } from "../../lib/api";

export interface ReportBranch {
  id: string;
  name: string;
  timezone?: string | null;
}

function reportQuery(days?: number, branchId?: string | null): string {
  const params = new URLSearchParams();
  if (days != null) params.set("days", String(days));
  if (branchId) params.set("branch_id", branchId);
  const query = params.toString();
  return query ? `?${query}` : "";
}

export function fetchReportCatalog(): Promise<ReportCatalogResponse> {
  return api<ReportCatalogResponse>("/reports/catalog");
}

export function fetchReportBranches(): Promise<{ data: ReportBranch[] }> {
  return api<{ data: ReportBranch[] }>("/branches");
}

export function fetchReportSummary(
  branchId?: string | null
): Promise<ReportResponse<ReportSummary>> {
  return api<ReportResponse<ReportSummary>>(`/reports/summary${reportQuery(undefined, branchId)}`);
}

export function fetchSalesReport(
  days: number,
  branchId?: string | null
): Promise<ReportResponse<SalesReportData>> {
  return api<ReportResponse<SalesReportData>>(`/reports/sales${reportQuery(days, branchId)}`);
}

export function fetchTopProductsReport(
  days: number,
  branchId?: string | null
): Promise<ReportResponse<TopProductReportRow[]>> {
  return api<ReportResponse<TopProductReportRow[]>>(
    `/reports/top-products${reportQuery(days, branchId)}`
  );
}

export function fetchPaymentMethodsReport(
  days: number,
  branchId?: string | null
): Promise<ReportResponse<PaymentMethodReportRow[]>> {
  return api<ReportResponse<PaymentMethodReportRow[]>>(
    `/reports/payment-methods${reportQuery(days, branchId)}`
  );
}
