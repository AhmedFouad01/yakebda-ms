import type { SemanticTone } from "../../components/ui/primitives";

/**
 * ACC-FULL-01 CP5 — types mirror the API contracts exactly. Every monetary
 * value stays a server-formatted string; the client never parses it for math.
 */

export type FinancialEventStatus =
  | "pending"
  | "processing"
  | "posted"
  | "failed"
  | "dead"
  | "pending_policy"
  | "deferred_rounding"
  | "non_posting"
  | "reconciled";

export const FINANCIAL_EVENT_STATUSES: FinancialEventStatus[] = [
  "pending",
  "processing",
  "posted",
  "failed",
  "dead",
  "pending_policy",
  "deferred_rounding",
  "non_posting",
  "reconciled",
];

export const STATUS_LABELS: Record<FinancialEventStatus, string> = {
  pending: "قيد الانتظار",
  processing: "قيد المعالجة",
  posted: "مُرحّل",
  failed: "فاشل",
  dead: "متوقف نهائيًا",
  pending_policy: "بانتظار سياسة",
  deferred_rounding: "تقريب مؤجل",
  non_posting: "بلا ترحيل",
  reconciled: "مُسوّى",
};

export const STATUS_TONES: Record<FinancialEventStatus, SemanticTone> = {
  pending: "info",
  processing: "info",
  posted: "success",
  failed: "warning",
  dead: "danger",
  pending_policy: "warning",
  deferred_rounding: "warning",
  non_posting: "neutral",
  reconciled: "success",
};

export interface FinancialEventRow {
  id: string;
  branch_id: string | null;
  source_type: string;
  source_id: string;
  event_type: string;
  status: FinancialEventStatus;
  attempts: number;
  last_error: string | null;
  created_at: string;
  posted_at: string | null;
}

export interface JournalEntrySummary {
  id: string;
  entry_date: string;
  event_type: string;
  description: string;
  reversal_of_entry_id: string | null;
  posted_at: string;
}

export interface ReconciliationRow {
  id: string;
  branch_id: string | null;
  event_type: string;
  entry_date: string;
  source_amount: string;
  journal_amount: string;
  residual_amount: string;
  status: "open" | "settled" | "reversed";
  financial_event_id: string | null;
}

export interface FinancialEventDetail extends FinancialEventRow {
  payload: unknown;
  journal_entry: JournalEntrySummary | null;
  reconciliation: ReconciliationRow | null;
  source: Record<string, unknown> | null;
}

export interface JournalLine {
  id: string;
  accounting_account_id: string;
  account_code: string;
  account_name_ar: string;
  component: string;
  debit: string;
  credit: string;
}

export interface JournalEntryRow {
  id: string;
  branch_id: string | null;
  event_type: string;
  source_type: string;
  source_id: string;
  entry_date: string;
  description: string;
  reversal_of_entry_id: string | null;
  lines: JournalLine[];
}

export interface JournalEntryDetail extends JournalEntryRow {
  totals: { debit: string; credit: string };
  reversed_by: { id: string; entry_date: string; description: string } | null;
  financial_event: {
    id: string;
    status: FinancialEventStatus;
    event_type: string;
    source_type: string;
    source_id: string;
    last_error: string | null;
  } | null;
}

export interface EventSummaryRow {
  status: FinancialEventStatus;
  count: string | number;
}

export interface ResidualsResponse {
  items: ReconciliationRow[];
  summary: Array<{ branch_id: string | null; open_count: string | number; open_total: string }>;
  total_open: string;
}

export interface AccountingSettings {
  vat_registered: boolean;
  vat_rate: number;
  revenue_recognition: string;
  timezone: string;
  day_close_hour: number;
  materiality_threshold: string;
}

export interface AccountingPeriod {
  id: string;
  starts_on: string;
  ends_on: string;
  status: "open" | "locked";
  locked_at: string | null;
}

export interface BranchRef {
  id: string;
  name: string;
}
