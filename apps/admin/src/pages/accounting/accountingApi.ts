import type { PaginationResponse } from "@ykms/contracts";
import { api } from "../../lib/api";
import type {
  AccountingAccount,
  AccountingMapping,
  AccountingPeriod,
  AccountingSettings,
  EventSummaryRow,
  FinancialEventDetail,
  FinancialEventRow,
  JournalEntryDetail,
  JournalEntryRow,
  ResidualsResponse,
  SettlementResult,
  TrialBalanceResponse,
} from "./accountingTypes";

/** ACC-FULL-01 CP5 — thin fetchers over the real contracts only. */

function query(params: Record<string, string | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) search.set(key, value);
  }
  const text = search.toString();
  return text ? `?${text}` : "";
}

export interface EventFilters {
  status?: string;
  event_type?: string;
  branch_id?: string;
  date_from?: string;
  date_to?: string;
  cursor?: string;
  limit?: string;
}

export function fetchEvents(filters: EventFilters = {}) {
  return api<PaginationResponse<FinancialEventRow>>(`/accounting/financial-events${query({ ...filters })}`);
}

export function fetchEventsSummary() {
  return api<{ data: EventSummaryRow[] }>("/accounting/financial-events/summary");
}

export function fetchEvent(id: string) {
  return api<{ data: FinancialEventDetail }>(`/accounting/financial-events/${id}`);
}

export function retryEvent(id: string) {
  return api<{ data: FinancialEventRow }>(`/accounting/financial-events/${id}/retry`, { method: "POST" });
}

export function markEventDead(id: string, reason: string) {
  return api<{ data: FinancialEventRow }>(`/accounting/financial-events/${id}/mark-dead`, {
    method: "POST",
    body: { reason },
  });
}

export interface JournalFilters {
  event_type?: string;
  source_type?: string;
  branch_id?: string;
  date_from?: string;
  date_to?: string;
  cursor?: string;
  limit?: string;
}

export function fetchJournals(filters: JournalFilters = {}) {
  return api<PaginationResponse<JournalEntryRow>>(`/accounting/journals${query({ ...filters })}`);
}

export function fetchJournal(id: string) {
  return api<{ data: JournalEntryDetail }>(`/accounting/journals/${id}`);
}

export function reverseJournal(id: string, reason: string) {
  return api<{ data: { id: string } }>(`/accounting/journals/${id}/reverse`, {
    method: "POST",
    body: { reason },
  });
}

export interface ResidualFilters {
  status?: string;
  branch_id?: string;
  date_from?: string;
  date_to?: string;
}

export function fetchResiduals(filters: ResidualFilters = {}) {
  return api<{ data: ResidualsResponse }>(`/accounting/reconciliation/residuals${query({ ...filters })}`);
}

export function fetchAccounts(includeInactive = false) {
  return api<{ data: AccountingAccount[] }>(
    `/accounting/accounts${includeInactive ? "?include_inactive=true" : ""}`
  );
}

export function createAccount(body: { code: string; name_ar: string; account_type: string }) {
  return api<{ data: AccountingAccount }>("/accounting/accounts", { method: "POST", body });
}

export function updateAccount(id: string, body: { name_ar?: string; is_active?: boolean }) {
  return api<{ data: AccountingAccount }>(`/accounting/accounts/${id}`, { method: "PATCH", body });
}

export function fetchMappings() {
  return api<{ data: AccountingMapping[] }>("/accounting/mappings");
}

export function createMapping(body: {
  event_type: string;
  dimension_key: string;
  debit_account_id: string;
  credit_account_id: string;
  vat_account_id?: string | null;
}) {
  return api<{ data: AccountingMapping }>("/accounting/mappings", { method: "POST", body });
}

export function updateMapping(
  id: string,
  body: { debit_account_id?: string; credit_account_id?: string; vat_account_id?: string | null }
) {
  return api<{ data: AccountingMapping }>(`/accounting/mappings/${id}`, { method: "PUT", body });
}

export function lockPeriod(body: { starts_on: string; ends_on: string }) {
  return api<{ data: AccountingPeriod; settlement: SettlementResult }>("/accounting/periods/lock", {
    method: "POST",
    body,
  });
}

export function openPeriod(id: string) {
  return api<{ data: AccountingPeriod }>(`/accounting/periods/${id}/open`, { method: "POST" });
}

export function settleResiduals(body: {
  branch_id?: string;
  entry_date?: string;
  date_from?: string;
  date_to?: string;
  idempotency_key?: string;
}) {
  return api<{ data: SettlementResult }>("/accounting/reconciliation/settle", { method: "POST", body });
}

export interface TrialBalanceFilters {
  branch_id?: string;
  period_id?: string;
  date_from?: string;
  through?: string;
}

export function fetchTrialBalance(filters: TrialBalanceFilters = {}) {
  return api<TrialBalanceResponse>(`/accounting/trial-balance${query({ ...filters })}`);
}

/**
 * تصدير CSV من نفس سلاسل الخادم حرفيًا — بلا أي إعادة حساب.
 * BOM لدعم العربية في Excel.
 */
export function downloadCsv(filename: string, headers: string[], rows: string[][]): void {
  const escape = (cell: string) => (/[",\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell);
  const csv = "﻿" + [headers, ...rows].map((row) => row.map(escape).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function fetchAccountingSettings(branchId?: string) {
  return api<{ data: AccountingSettings }>(`/accounting/settings${query({ branch_id: branchId })}`);
}

export function updateAccountingSettings(
  body: Partial<{
    vat_registered: boolean;
    vat_rate: number;
    revenue_recognition: string;
    timezone: string;
    day_close_hour: number;
    materiality_threshold: string;
  }>,
  branchId?: string
) {
  return api<{ data: AccountingSettings }>(`/accounting/settings${query({ branch_id: branchId })}`, {
    method: "PUT",
    body,
  });
}

export function fetchPeriods() {
  return api<{ data: AccountingPeriod[] }>("/accounting/periods");
}

/** عرض طابع زمني كما ورد من الخادم بلا افتراض منطقة زمنية (قصّ نصي فقط). */
export function fmtTimestamp(value: string | null | undefined): string {
  if (!value) return "—";
  return String(value).slice(0, 19).replace("T", " ");
}
