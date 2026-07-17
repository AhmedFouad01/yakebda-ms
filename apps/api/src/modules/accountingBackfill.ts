import { Knex } from "knex";
import { enqueueFinancialEvent, enqueuePaymentFinancialEvent } from "./financialOutbox";

type SourceKind = "payment" | "cash_movement" | "stock_movement";

export interface BackfillPreviewItem {
  source_kind: SourceKind;
  source_id: string;
  account_id: string;
  branch_id: string | null;
  event_type: string;
}

export interface AccountingBackfillReport {
  mode: "dry_run" | "apply_test_only";
  generated_at: string;
  account_id: string | null;
  preview: BackfillPreviewItem[];
  created_event_ids: string[];
  missing_mappings: Array<{ event_id: string; event_type: string; dimension_key: string }>;
  unbalanced_entries: Array<{ entry_id: string; debit: string; credit: string }>;
  reconciliation: Array<{
    account_id: string;
    operational_payment_net: string;
    posted_tender_debit: string;
    posted_tender_credit: string;
  }>;
}

interface BackfillOptions {
  accountId?: string;
  limit?: number;
  apply?: boolean;
  confirmTestDatabase?: boolean;
}

interface PreviewQueryRow {
  source_id: string;
  account_id: string;
  branch_id: string | null;
  event_type: string;
}

interface MovementPreviewQueryRow extends Omit<PreviewQueryRow, "event_type"> {
  movement_type: string;
}

function eventTypeForMovement(movementType: string): string | null {
  return ({
    receipt: "inventory.receipt",
    waste: "inventory.waste",
    count_adjustment: "inventory.adjustment",
    consumption: "inventory.consumption",
    reversal: "inventory.reversal",
  } as Record<string, string>)[movementType] ?? null;
}

function payloadObject(value: unknown): Record<string, unknown> {
  if (typeof value === "string") return JSON.parse(value) as Record<string, unknown>;
  return (value ?? {}) as Record<string, unknown>;
}

function dimensionFor(eventType: string, payload: Record<string, unknown>): string {
  if (eventType === "payment.captured" || eventType === "refund.posted") return String(payload.method ?? "unknown");
  if (eventType === "cash.movement") return String(payload.type ?? "unknown");
  if (eventType === "inventory.adjustment") return Number(payload.total_value ?? 0) >= 0 ? "positive" : "negative";
  return "default";
}

async function previewSources(db: Knex, accountId?: string, limit = 500): Promise<BackfillPreviewItem[]> {
  const payments = await db("payments as payment")
    .join("orders as ord", "ord.id", "payment.order_id")
    .whereNot("payment.method", "unpaid")
    .whereNot("payment.amount", 0)
    .modify((query) => {
      if (accountId) query.where("ord.account_id", accountId);
    })
    .whereNotExists(function missingPaymentEvent() {
      this.select(db.raw("1"))
        .from("financial_events as event")
        .whereRaw("event.account_id = ord.account_id")
        .whereRaw("event.source_type = 'payment'")
        .whereRaw("event.source_id = payment.id::text");
    })
    .select("payment.id as source_id", "ord.account_id", "payment.branch_id")
    .select(db.raw("case when payment.kind = 'refund' then 'refund.posted' else 'payment.captured' end as event_type"))
    .orderBy("payment.created_at")
    .limit(limit);

  const cash = await db("shift_cash_movements as movement")
    .join("shifts as shift", "shift.id", "movement.shift_id")
    .modify((query) => {
      if (accountId) query.where("shift.account_id", accountId);
    })
    .whereNotExists(function missingCashEvent() {
      this.select(db.raw("1"))
        .from("financial_events as event")
        .whereRaw("event.account_id = shift.account_id")
        .whereRaw("event.source_type = 'shift_cash_movement'")
        .whereRaw("event.source_id = movement.id::text");
    })
    .select("movement.id as source_id", "shift.account_id", "shift.branch_id")
    .select(db.raw("'cash.movement' as event_type"))
    .orderBy("movement.created_at")
    .limit(limit);

  const movements = await db("stock_movements as movement")
    .modify((query) => {
      if (accountId) query.where("movement.account_id", accountId);
    })
    .whereIn("movement.movement_type", ["receipt", "waste", "count_adjustment", "consumption", "reversal"])
    .whereNotExists(function missingStockEvent() {
      this.select(db.raw("1"))
        .from("financial_events as event")
        .whereRaw("event.account_id = movement.account_id")
        .whereRaw("event.source_type = 'stock_movement'")
        .whereRaw("event.source_id = movement.id::text");
    })
    .select("movement.id as source_id", "movement.account_id", "movement.branch_id", "movement.movement_type")
    .orderBy("movement.created_at")
    .limit(limit);

  return [
    ...(payments as PreviewQueryRow[]).map((row) => ({ source_kind: "payment" as const, ...row })),
    ...(cash as PreviewQueryRow[]).map((row) => ({ source_kind: "cash_movement" as const, ...row })),
    ...(movements as MovementPreviewQueryRow[]).map((row) => ({ source_kind: "stock_movement" as const, source_id: row.source_id, account_id: row.account_id, branch_id: row.branch_id, event_type: eventTypeForMovement(row.movement_type)! })),
  ].slice(0, limit);
}

async function createPreviewEvent(db: Knex, item: BackfillPreviewItem): Promise<string | null> {
  if (item.source_kind === "payment") {
    return db.transaction((trx) => enqueuePaymentFinancialEvent(trx, {
      accountId: item.account_id,
      paymentId: item.source_id,
      eventType: item.event_type as "payment.captured" | "refund.posted",
    }));
  }
  if (item.source_kind === "cash_movement") {
    return db.transaction(async (trx) => {
      const row = await trx("shift_cash_movements as movement")
        .join("shifts as shift", "shift.id", "movement.shift_id")
        .where({ "movement.id": item.source_id, "shift.account_id": item.account_id })
        .select("movement.*", "shift.branch_id")
        .first();
      if (!row) return null;
      return enqueueFinancialEvent(trx, {
        accountId: item.account_id,
        branchId: row.branch_id,
        sourceType: "shift_cash_movement",
        sourceId: row.id,
        eventType: "cash.movement",
        idempotencyKey: `shift-cash:${row.id}:v1`,
        payload: { version: 1, movement_id: row.id, shift_id: row.shift_id, type: row.type, amount: row.amount, reason: row.reason },
      });
    });
  }
  return db.transaction(async (trx) => {
    const row = await trx("stock_movements").where({ id: item.source_id, account_id: item.account_id }).first();
    if (!row) return null;
    return enqueueFinancialEvent(trx, {
      accountId: item.account_id,
      branchId: row.branch_id,
      sourceType: "stock_movement",
      sourceId: row.id,
      eventType: item.event_type,
      idempotencyKey: `stock-movement:${row.id}:${item.event_type}:v1`,
      payload: { version: 1, ...row },
    });
  });
}

export async function buildAccountingBackfillReport(
  db: Knex,
  options: BackfillOptions = {}
): Promise<AccountingBackfillReport> {
  const apply = options.apply ?? false;
  if (apply && (process.env.NODE_ENV !== "test" || !options.confirmTestDatabase)) {
    throw new Error("Accounting backfill apply is restricted to an explicitly confirmed test database");
  }
  const preview = await previewSources(db, options.accountId, options.limit ?? 500);
  const createdEventIds: string[] = [];
  if (apply) {
    for (const item of preview) {
      const id = await createPreviewEvent(db, item);
      if (id) createdEventIds.push(id);
    }
  }

  const candidateEvents = await db("financial_events")
    .whereIn("status", ["pending", "failed", "dead"])
    .modify((query) => {
      if (options.accountId) query.where("account_id", options.accountId);
    })
    .select("id", "account_id", "event_type", "payload");
  const missingMappings: AccountingBackfillReport["missing_mappings"] = [];
  for (const event of candidateEvents) {
    if (event.event_type === "inventory.reversal") continue;
    const dimension = dimensionFor(event.event_type, payloadObject(event.payload));
    const mapping = await db("accounting_mappings").where({ account_id: event.account_id, event_type: event.event_type, dimension_key: dimension }).first();
    if (!mapping) missingMappings.push({ event_id: event.id, event_type: event.event_type, dimension_key: dimension });
  }

  const unbalancedEntries = await db("journal_entries as entry")
    .join("journal_lines as line", "line.entry_id", "entry.id")
    .modify((query) => {
      if (options.accountId) query.where("entry.account_id", options.accountId);
    })
    .groupBy("entry.id")
    .select("entry.id as entry_id")
    .sum({ debit: "line.debit", credit: "line.credit" })
    .havingRaw("abs(sum(line.debit) - sum(line.credit)) > 0.001");

  const reconciliation = await db("accounts as account")
    .modify((query) => {
      if (options.accountId) query.where("account.id", options.accountId);
    })
    .select("account.id as account_id")
    .select(db.raw("coalesce((select sum(payment.amount) from payments payment join orders o on o.id = payment.order_id where o.account_id = account.id and payment.method <> 'unpaid'), 0)::text as operational_payment_net"))
    .select(db.raw("coalesce((select sum(line.debit) from journal_lines line join journal_entries entry on entry.id = line.entry_id where entry.account_id = account.id and line.component = 'tender'), 0)::text as posted_tender_debit"))
    .select(db.raw("coalesce((select sum(line.credit) from journal_lines line join journal_entries entry on entry.id = line.entry_id where entry.account_id = account.id and line.component = 'tender'), 0)::text as posted_tender_credit"));

  return {
    mode: apply ? "apply_test_only" : "dry_run",
    generated_at: new Date().toISOString(),
    account_id: options.accountId ?? null,
    preview,
    created_event_ids: createdEventIds,
    missing_mappings: missingMappings,
    unbalanced_entries: unbalancedEntries,
    reconciliation,
  };
}
