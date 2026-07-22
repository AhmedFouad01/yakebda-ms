import type {
  PaymentMethodReportRow,
  ReportCatalogResponse,
  ReportResponse,
  ReportSummary,
  SalesByBranchReportData,
  SalesBySourceReportData,
  SalesTrendReportData,
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

export function fetchSalesTrendReport(
  days: number,
  branchId?: string | null
): Promise<ReportResponse<SalesTrendReportData>> {
  return api<ReportResponse<SalesTrendReportData>>(
    `/reports/sales/trend${reportQuery(days, branchId)}`
  );
}

export function fetchSalesByBranchReport(
  days: number,
  branchId?: string | null
): Promise<ReportResponse<SalesByBranchReportData>> {
  return api<ReportResponse<SalesByBranchReportData>>(
    `/reports/sales/by-branch${reportQuery(days, branchId)}`
  );
}

export function fetchSalesBySourceReport(
  days: number,
  branchId?: string | null
): Promise<ReportResponse<SalesBySourceReportData>> {
  return api<ReportResponse<SalesBySourceReportData>>(
    `/reports/sales/by-source${reportQuery(days, branchId)}`
  );
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
