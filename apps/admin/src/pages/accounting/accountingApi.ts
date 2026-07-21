import type { PaginationResponse } from "@ykms/contracts";
import { api } from "../../lib/api";
import type {
  AccountingPeriod,
  AccountingSettings,
  EventSummaryRow,
  FinancialEventDetail,
  FinancialEventRow,
  JournalEntryDetail,
  JournalEntryRow,
  ResidualsResponse,
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

export function fetchResiduals() {
  return api<{ data: ResidualsResponse }>("/accounting/reconciliation/residuals");
}

export function fetchAccountingSettings() {
  return api<{ data: AccountingSettings }>("/accounting/settings");
}

export function fetchPeriods() {
  return api<{ data: AccountingPeriod[] }>("/accounting/periods");
}

/** عرض طابع زمني كما ورد من الخادم بلا افتراض منطقة زمنية (قصّ نصي فقط). */
export function fmtTimestamp(value: string | null | undefined): string {
  if (!value) return "—";
  return String(value).slice(0, 19).replace("T", " ");
}
