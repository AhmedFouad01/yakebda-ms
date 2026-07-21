import { Knex } from "knex";
import { err } from "../lib/errors";
import { newId } from "../lib/ids";
import {
  allocateGross,
  allocateRefund,
  fromMinorUnits,
  toMinorUnits,
} from "../lib/accountingMath";
import { formatDecimal, parseDecimal } from "../lib/inventoryMath";
import { failFinancialEvent } from "./financialOutbox";

// ADR-004 standard default chart. Codes for the ADR-listed accounts are fixed
// by the ADR; clearing/variance accounts keep serving the pilot mappings under
// codes outside the ADR set. All remappable per-tenant.
const SYSTEM_ACCOUNTS = [
  ["1010", "cash", "النقدية/الخزينة", "asset"],
  ["1020", "bank", "البنك", "asset"],
  ["1050", "card_clearing", "تسويات البطاقات", "asset"],
  ["1060", "wallet_clearing", "تسويات المحافظ", "asset"],
  ["1210", "vat_input", "ض.ق.م مدخلات", "asset"],
  ["1310", "inventory", "المخزون", "asset"],
  ["2010", "vat_payable", "ض.ق.م مستحقة (مخرجات)", "liability"],
  ["2100", "accounts_payable", "الموردون", "liability"],
  ["4010", "sales_revenue", "إيرادات المبيعات", "revenue"],
  ["4020", "sales_returns", "مردودات المبيعات", "revenue"],
  ["4090", "rounding", "فروق التقريب (Rounding)", "revenue"],
  ["5010", "cogs", "تكلفة البضاعة المباعة (COGS)", "expense"],
  ["5090", "waste_expense", "منصرفات مخزون عامة/هالك", "expense"],
  ["5100", "inventory_variance", "فروق المخزون", "expense"],
  ["5200", "cash_variance", "فروق وحركات النقدية", "expense"],
  ["6050", "delivery_commission", "عمولة منصات التوصيل", "expense"],
] as const;

// Pilot (migration 025) codes → ADR-004 codes. Ordered so clearing accounts
// evacuate 1010/1020 before cash/bank claim them; each move is a guarded no-op
// once applied. Names are refreshed only together with the code move, so a
// tenant's manual rename of an already-migrated account is never overwritten.
export const LEGACY_CODE_MOVES: ReadonlyArray<readonly [systemKey: string, fromCode: string, toCode: string]> = [
  ["card_clearing", "1010", "1050"],
  ["wallet_clearing", "1020", "1060"],
  ["cash", "1000", "1010"],
  ["inventory", "1100", "1310"],
  ["vat_payable", "2200", "2010"],
  ["sales_revenue", "3000", "4010"],
  ["cogs", "4000", "5010"],
  ["waste_expense", "5000", "5090"],
] as const;

interface FinancialEventRow {
  id: string;
  account_id: string;
  branch_id: string | null;
  source_type: string;
  source_id: string;
  event_type: string;
  status: string;
  payload: Record<string, unknown> | string;
  claimed_by: string;
  created_at: Date | string;
}

interface MappingRow {
  account_id: string;
  event_type: string;
  dimension_key: string;
  debit_account_id: string;
  credit_account_id: string;
  vat_account_id: string | null;
}

interface DraftLine {
  accountingAccountId: string;
  component: string;
  debitMinor: bigint;
  creditMinor: bigint;
}

interface JournalDraft {
  orderId?: string | null;
  paymentId?: string | null;
  originalPaymentId?: string | null;
  description: string;
  meta: Record<string, unknown>;
  lines: DraftLine[];
}

interface ReconciliationDraft {
  sourceAmount: string;
  journalAmount: string;
  residualAmount: string;
  dimensionKey: string;
  status: "open" | "settled";
  reversesReconciliationId?: string;
  originalReconciliationId?: string;
  originalFinancialEventId?: string;
}

type PostingStatus = "posted" | "deferred_rounding" | "non_posting" | "reconciled";

interface PostingDraft {
  journal: JournalDraft | null;
  reconciliation: ReconciliationDraft | null;
  status: PostingStatus;
}

function payloadOf(event: FinancialEventRow): Record<string, unknown> {
  return typeof event.payload === "string" ? JSON.parse(event.payload) : event.payload;
}

function absolute(value: bigint): bigint {
  return value < 0n ? -value : value;
}

async function mappingFor(
  trx: Knex.Transaction,
  accountId: string,
  eventType: string,
  dimension: string
): Promise<MappingRow> {
  const mapping = await trx<MappingRow>("accounting_mappings")
    .where({ account_id: accountId, event_type: eventType, dimension_key: dimension })
    .first();
  if (!mapping) throw err.validation({ accounting_mapping: `${eventType}:${dimension}` });
  return mapping;
}

function allocationTotals(rows: Array<{ meta: Record<string, unknown> | string }>) {
  return rows.reduce(
    (totals, row) => {
      const meta = typeof row.meta === "string" ? JSON.parse(row.meta) : row.meta;
      totals.gross += BigInt(String(meta.gross_minor ?? 0));
      totals.revenue += BigInt(String(meta.revenue_minor ?? 0));
      totals.vat += BigInt(String(meta.vat_minor ?? 0));
      return totals;
    },
    { gross: 0n, revenue: 0n, vat: 0n }
  );
}

function allocationSnapshot(payload: Record<string, unknown>, gross: bigint) {
  if (Number(payload.accounting_allocation_version ?? 0) !== 1) return null;
  const snapshotGross = BigInt(String(payload.accounting_gross_minor));
  const revenueMinor = BigInt(String(payload.accounting_revenue_minor));
  const vatMinor = BigInt(String(payload.accounting_vat_minor));
  if (snapshotGross !== gross || revenueMinor < 0n || vatMinor < 0n || revenueMinor + vatMinor !== gross) {
    throw err.validation({ accounting_allocation: "Invalid payment allocation snapshot" });
  }
  return { revenueMinor, vatMinor };
}

async function draftPayment(trx: Knex.Transaction, event: FinancialEventRow): Promise<JournalDraft> {
  const payload = payloadOf(event);
  const method = String(payload.method);
  const mapping = await mappingFor(trx, event.account_id, event.event_type, method);
  if (!mapping.vat_account_id) throw err.validation({ accounting_mapping: "VAT account is required" });
  const gross = absolute(toMinorUnits(String(payload.amount)));
  const total = toMinorUnits(String(payload.total));
  const vatTotal = toMinorUnits(String(payload.vat_amount ?? 0));
  const orderId = String(payload.order_id);
  let allocation = allocationSnapshot(payload, gross);
  if (!allocation) {
    const priorRows = await trx("journal_entries")
      .where({ account_id: event.account_id, order_id: orderId, event_type: "payment.captured" })
      .select("meta");
    const prior = allocationTotals(priorRows);
    allocation = allocateGross({
      grossMinor: gross,
      totalGrossMinor: total,
      totalVatMinor: vatTotal,
      priorGrossMinor: prior.gross,
      priorRevenueMinor: prior.revenue,
      priorVatMinor: prior.vat,
    });
  }
  const lines: DraftLine[] = [
    { accountingAccountId: mapping.debit_account_id, component: "tender", debitMinor: gross, creditMinor: 0n },
  ];
  if (allocation.revenueMinor > 0n) {
    lines.push({ accountingAccountId: mapping.credit_account_id, component: "revenue", debitMinor: 0n, creditMinor: allocation.revenueMinor });
  }
  if (allocation.vatMinor > 0n) {
    lines.push({ accountingAccountId: mapping.vat_account_id, component: "vat", debitMinor: 0n, creditMinor: allocation.vatMinor });
  }
  return {
    orderId,
    paymentId: String(payload.payment_id),
    description: `Payment ${payload.payment_id} for order ${payload.order_no}`,
    meta: {
      method,
      gross_minor: gross.toString(),
      revenue_minor: allocation.revenueMinor.toString(),
      vat_minor: allocation.vatMinor.toString(),
    },
    lines,
  };
}

async function draftRefund(trx: Knex.Transaction, event: FinancialEventRow): Promise<JournalDraft> {
  const payload = payloadOf(event);
  const method = String(payload.method);
  const originalPaymentId = String(payload.reversal_of_payment_id);
  const original = await trx("journal_entries")
    .where({ account_id: event.account_id, payment_id: originalPaymentId, event_type: "payment.captured" })
    .first();
  if (!original) throw err.validation({ original_payment: "Original payment journal is not posted" });
  const gross = absolute(toMinorUnits(String(payload.amount)));
  let allocation = allocationSnapshot(payload, gross);
  if (!allocation) {
    const originalMeta = typeof original.meta === "string" ? JSON.parse(original.meta) : original.meta;
    const priorRefundRows = await trx("journal_entries")
      .where({ account_id: event.account_id, original_payment_id: originalPaymentId, event_type: "refund.posted" })
      .select("meta");
    const prior = allocationTotals(priorRefundRows);
    allocation = allocateRefund({
      refundGrossMinor: gross,
      originalGrossMinor: BigInt(String(originalMeta.gross_minor)),
      originalRevenueMinor: BigInt(String(originalMeta.revenue_minor)),
      originalVatMinor: BigInt(String(originalMeta.vat_minor)),
      priorRefundGrossMinor: prior.gross,
      priorRefundRevenueMinor: prior.revenue,
      priorRefundVatMinor: prior.vat,
    });
  }
  const mapping = await mappingFor(trx, event.account_id, event.event_type, method);
  if (!mapping.vat_account_id) throw err.validation({ accounting_mapping: "VAT account is required" });
  const lines: DraftLine[] = [];
  if (allocation.revenueMinor > 0n) {
    lines.push({ accountingAccountId: mapping.debit_account_id, component: "revenue", debitMinor: allocation.revenueMinor, creditMinor: 0n });
  }
  if (allocation.vatMinor > 0n) {
    lines.push({ accountingAccountId: mapping.vat_account_id, component: "vat", debitMinor: allocation.vatMinor, creditMinor: 0n });
  }
  lines.push({ accountingAccountId: mapping.credit_account_id, component: "tender", debitMinor: 0n, creditMinor: gross });
  return {
    orderId: String(payload.order_id),
    paymentId: String(payload.payment_id),
    originalPaymentId,
    description: `Refund ${payload.payment_id} for order ${payload.order_no}`,
    meta: {
      method,
      original_payment_id: originalPaymentId,
      gross_minor: gross.toString(),
      revenue_minor: allocation.revenueMinor.toString(),
      vat_minor: allocation.vatMinor.toString(),
    },
    lines,
  };
}

async function draftMappedEvent(trx: Knex.Transaction, event: FinancialEventRow): Promise<PostingDraft> {
  const payload = payloadOf(event);
  let dimension = "default";
  if (event.event_type === "cash.movement") dimension = String(payload.type);
  if (event.event_type === "inventory.adjustment") {
    dimension = parseDecimal(String(payload.total_value), 4) >= 0n ? "positive" : "negative";
  }
  const grossValue = event.event_type === "cash.movement" ? payload.amount : payload.total_value;
  if (!event.event_type.startsWith("inventory.")) {
    const gross = absolute(toMinorUnits(String(grossValue ?? 0)));
    if (gross === 0n) return { journal: null, reconciliation: null, status: "non_posting" };
    const mapping = await mappingFor(trx, event.account_id, event.event_type, dimension);
    return {
      journal: {
        description: `${event.event_type} ${event.source_id}`,
        meta: { gross_minor: gross.toString(), dimension },
        lines: [
          { accountingAccountId: mapping.debit_account_id, component: "debit", debitMinor: gross, creditMinor: 0n },
          { accountingAccountId: mapping.credit_account_id, component: "credit", debitMinor: 0n, creditMinor: gross },
        ],
      },
      reconciliation: null,
      status: "posted",
    };
  }

  const sourceScale4 = parseDecimal(String(grossValue ?? 0), 4);
  if (sourceScale4 === 0n) return { journal: null, reconciliation: null, status: "non_posting" };
  const mapping = await mappingFor(trx, event.account_id, event.event_type, dimension);
  const journalMinorSigned = toMinorUnits(formatDecimal(sourceScale4, 4));
  const journalScale4 = journalMinorSigned * 100n;
  const residualScale4 = sourceScale4 - journalScale4;
  const gross = absolute(journalMinorSigned);
  const journal: JournalDraft | null = gross === 0n
    ? null
    : {
        description: `${event.event_type} ${event.source_id}`,
        meta: {
          gross_minor: gross.toString(),
          dimension,
          source_amount: formatDecimal(sourceScale4, 4),
          residual_amount: formatDecimal(residualScale4, 4),
        },
        lines: [
          { accountingAccountId: mapping.debit_account_id, component: "debit", debitMinor: gross, creditMinor: 0n },
          { accountingAccountId: mapping.credit_account_id, component: "credit", debitMinor: 0n, creditMinor: gross },
        ],
      };
  const reconciliation: ReconciliationDraft | null = residualScale4 === 0n
    ? null
    : {
        sourceAmount: formatDecimal(sourceScale4, 4),
        journalAmount: fromMinorUnits(journalMinorSigned),
        residualAmount: formatDecimal(residualScale4, 4),
        dimensionKey: dimension,
        status: "open",
      };
  return {
    journal,
    reconciliation,
    status: journal ? "posted" : "deferred_rounding",
  };
}

async function draftInventoryReversal(trx: Knex.Transaction, event: FinancialEventRow): Promise<PostingDraft> {
  const payload = payloadOf(event);
  const originalMovementId = String(payload.reversal_of_movement_id);
  const originalEvent = await trx<FinancialEventRow>("financial_events")
    .where({ account_id: event.account_id, source_type: "stock_movement", source_id: originalMovementId })
    .first();
  if (!originalEvent) throw err.validation({ original_movement: "Original movement financial event is missing" });
  const originalPayload = payloadOf(originalEvent);
  const reversalValue = parseDecimal(String(payload.total_value), 4);
  const originalValue = parseDecimal(String(originalPayload.total_value), 4);
  if (reversalValue !== -originalValue) {
    throw err.validation({ reversal_value: "Reversal value must exactly negate the original movement" });
  }
  const originalEntry = await trx("journal_entries")
    .where({ account_id: event.account_id, financial_event_id: originalEvent.id })
    .first();
  const originalReconciliation = await trx("financial_event_reconciliations")
    .where({ account_id: event.account_id, financial_event_id: originalEvent.id })
    .first();
  if (!originalEntry && !originalReconciliation) {
    throw err.validation({ original_movement: "Original movement has no journal or reconciliation evidence" });
  }
  const originalLines = originalEntry
    ? await trx("journal_lines").where({ entry_id: originalEntry.id }).orderBy("id")
    : [];
  const journal: JournalDraft | null = originalEntry
    ? {
        description: `Inventory reversal of ${originalMovementId}`,
        meta: { reversal_of_stock_movement_id: originalMovementId },
        lines: originalLines.map((line) => ({
          accountingAccountId: line.accounting_account_id,
          component: `reversal:${line.component}`,
          debitMinor: toMinorUnits(String(line.credit)),
          creditMinor: toMinorUnits(String(line.debit)),
        })),
      }
    : null;
  const reconciliation: ReconciliationDraft | null = originalReconciliation
    ? {
        sourceAmount: formatDecimal(-parseDecimal(String(originalReconciliation.source_amount), 4), 4),
        journalAmount: fromMinorUnits(-toMinorUnits(String(originalReconciliation.journal_amount))),
        residualAmount: formatDecimal(-parseDecimal(String(originalReconciliation.residual_amount), 4), 4),
        dimensionKey: String(originalReconciliation.dimension_key),
        status: "settled",
        reversesReconciliationId: originalReconciliation.id,
        originalReconciliationId: originalReconciliation.id,
        originalFinancialEventId: originalEntry ? undefined : originalEvent.id,
      }
    : null;
  return {
    journal,
    reconciliation,
    status: journal ? "posted" : "reconciled",
  };
}

async function buildDraft(trx: Knex.Transaction, event: FinancialEventRow): Promise<PostingDraft> {
  if (event.event_type === "payment.captured") {
    return { journal: await draftPayment(trx, event), reconciliation: null, status: "posted" };
  }
  if (event.event_type === "refund.posted") {
    return { journal: await draftRefund(trx, event), reconciliation: null, status: "posted" };
  }
  if (event.event_type === "inventory.reversal") return draftInventoryReversal(trx, event);
  return draftMappedEvent(trx, event);
}

export async function postClaimedFinancialEvent(
  db: Knex,
  input: { eventId: string; workerId: string; createdBy?: string }
): Promise<{ status: PostingStatus | "failed" | "dead"; journalEntryId: string | null }> {
  try {
    const journalEntryId = await db.transaction(async (trx) => {
      const event = await trx<FinancialEventRow>("financial_events")
        .where({ id: input.eventId, status: "processing", claimed_by: input.workerId })
        .forUpdate()
        .first();
      if (!event) throw err.conflict();
      if (event.event_type === "payment.captured" || event.event_type === "refund.posted") {
        const payload = payloadOf(event);
        await trx.raw("select pg_advisory_xact_lock(hashtextextended(?, 0))", [
          `payment-allocation:${event.account_id}:${String(payload.order_id)}`,
        ]);
      }
      const existing = await trx("journal_entries").where({ financial_event_id: event.id }).first();
      if (existing) {
        await trx("financial_events").where({ id: event.id }).update({ status: "posted", posted_at: trx.fn.now(), claimed_by: null, claimed_at: null, updated_at: trx.fn.now() });
        return existing.id as string;
      }
      const plan = await buildDraft(trx, event);
      const entryId = plan.journal ? newId() : null;
      const entryDate = new Date(event.created_at).toISOString().slice(0, 10);
      if (plan.journal && entryId) {
        await trx("journal_entries").insert({
          id: entryId,
          account_id: event.account_id,
          branch_id: event.branch_id,
          financial_event_id: event.id,
          event_type: event.event_type,
          source_type: event.source_type,
          source_id: event.source_id,
          order_id: plan.journal.orderId ?? null,
          payment_id: plan.journal.paymentId ?? null,
          original_payment_id: plan.journal.originalPaymentId ?? null,
          entry_date: entryDate,
          description: plan.journal.description,
          meta: JSON.stringify(plan.journal.meta),
          created_by: input.createdBy ?? null,
        });
        await trx("journal_lines").insert(
          plan.journal.lines.map((line) => ({
            id: newId(),
            account_id: event.account_id,
            entry_id: entryId,
            accounting_account_id: line.accountingAccountId,
            branch_id: event.branch_id,
            component: line.component,
            debit: fromMinorUnits(line.debitMinor),
            credit: fromMinorUnits(line.creditMinor),
          }))
        );
      }
      if (plan.reconciliation) {
        await trx("financial_event_reconciliations").insert({
          id: newId(),
          account_id: event.account_id,
          branch_id: event.branch_id,
          financial_event_id: event.id,
          event_type: event.event_type,
          dimension_key: plan.reconciliation.dimensionKey,
          entry_date: entryDate,
          source_amount: plan.reconciliation.sourceAmount,
          journal_amount: plan.reconciliation.journalAmount,
          residual_amount: plan.reconciliation.residualAmount,
          status: plan.reconciliation.status,
          reverses_reconciliation_id: plan.reconciliation.reversesReconciliationId ?? null,
          settlement_journal_id: entryId,
        });
        if (plan.reconciliation.originalReconciliationId) {
          const reversed = await trx("financial_event_reconciliations")
            .where({ id: plan.reconciliation.originalReconciliationId, status: "open" })
            .update({ status: "reversed" });
          if (reversed !== 1) throw err.conflict();
          if (plan.reconciliation.originalFinancialEventId) {
            await trx("financial_events")
              .where({ id: plan.reconciliation.originalFinancialEventId })
              .update({ status: "reconciled", updated_at: trx.fn.now() });
          }
        }
      }
      await trx("financial_events").where({ id: event.id }).update({
        status: plan.status,
        posted_at: plan.status === "posted" ? trx.fn.now() : null,
        claimed_by: null,
        claimed_at: null,
        next_attempt_at: null,
        last_error: null,
        updated_at: trx.fn.now(),
      });
      return entryId;
    });
    const status = await db("financial_events").where({ id: input.eventId }).first("status");
    return { status: status.status as PostingStatus, journalEntryId };
  } catch (error) {
    const message = error instanceof Error ? error.message : "financial posting failed";
    const failed = await failFinancialEvent(db, {
      eventId: input.eventId,
      workerId: input.workerId,
      error: message,
    });
    return { status: failed.status, journalEntryId: null };
  }
}

interface OpenReconciliationRow {
  id: string;
  account_id: string;
  branch_id: string | null;
  status: string;
  entry_date: string;
  residual_amount: string;
  financial_event_id: string | null;
}

export interface SettlementResult {
  settled_count: number;
  total_residual: string; // 4dp signed sum that was closed
  journal_entries: Array<{ id: string; branch_id: string | null; amount: string }>;
  absorbed_branches: Array<string | null>; // groups whose 4dp sum rounded to 0.00 (no journal)
}

/**
 * ADR-004 type-A settlement engine: closes every open residual in scope with
 * one balanced journal per branch through the tenant's residual.settlement
 * mapping (positive sum: debit mapping.debit / credit mapping.credit —
 * i.e. inventory -> rounding 4090; negative sum mirrors the sides). Rows are
 * marked settled and linked to their settlement journal; deferred_rounding
 * events whose evidence is now settled become reconciled. Runs inside the
 * caller's transaction so period lock can be settlement -> zero-check -> lock
 * atomically. Sub-half-cent group sums are absorbed (settled without journal),
 * matching the deferred_rounding precedent.
 */
export async function settleOpenResiduals(
  trx: Knex.Transaction,
  input: {
    accountId: string;
    createdBy: string;
    entryDate: string;
    branchId?: string | null;
    from?: string;
    to?: string;
    idempotencyKey?: string;
    reference?: Record<string, unknown>;
  }
): Promise<SettlementResult> {
  // Serialize settlements per tenant so idempotency replay checks are reliable.
  await trx.raw("select pg_advisory_xact_lock(hashtextextended(?, 0))", [
    `residual-settlement:${input.accountId}`,
  ]);

  if (input.idempotencyKey) {
    const replayed = await trx("journal_entries")
      .where({ account_id: input.accountId, event_type: "residual.settlement" })
      .whereRaw("meta->>'idempotency_key' = ?", [input.idempotencyKey])
      .select("id", "branch_id", "meta");
    if (replayed.length) {
      return {
        settled_count: 0,
        total_residual: "0.0000",
        journal_entries: replayed.map((row) => ({
          id: row.id,
          branch_id: row.branch_id,
          amount: String((typeof row.meta === "string" ? JSON.parse(row.meta) : row.meta).journal_amount ?? "0.00"),
        })),
        absorbed_branches: [],
      };
    }
  }

  const rows: OpenReconciliationRow[] = await trx("financial_event_reconciliations")
    .where({ account_id: input.accountId, status: "open" })
    .modify((qb) => {
      if (input.branchId !== undefined && input.branchId !== null) qb.where("branch_id", input.branchId);
      if (input.from) qb.where("entry_date", ">=", input.from);
      if (input.to) qb.where("entry_date", "<=", input.to);
    })
    .forUpdate();
  if (!rows.length) {
    return { settled_count: 0, total_residual: "0.0000", journal_entries: [], absorbed_branches: [] };
  }

  const mapping = await trx<MappingRow>("accounting_mappings")
    .where({ account_id: input.accountId, event_type: "residual.settlement", dimension_key: "default" })
    .first();
  if (!mapping) {
    throw err.validation({
      rounding_mapping: "قاعدة تسوية فروق التقريب غير مربوطة — أعد ربط حساب التقريب من شاشة الحسابات ثم أعد المحاولة.",
    });
  }

  const groups = new Map<string | null, typeof rows>();
  for (const row of rows) {
    const key = row.branch_id ?? null;
    const bucket = groups.get(key) ?? [];
    bucket.push(row);
    groups.set(key, bucket);
  }

  let grandTotal4 = 0n;
  const journalEntries: SettlementResult["journal_entries"] = [];
  const absorbed: Array<string | null> = [];

  for (const [branchId, groupRows] of groups) {
    const total4 = groupRows.reduce((sum, row) => sum + parseDecimal(String(row.residual_amount), 4), 0n);
    grandTotal4 += total4;
    const journalMinor = toMinorUnits(formatDecimal(total4, 4));
    let entryId: string | null = null;
    if (journalMinor !== 0n) {
      entryId = newId();
      const amount = fromMinorUnits(absolute(journalMinor));
      const positive = journalMinor > 0n;
      await trx("journal_entries").insert({
        id: entryId,
        account_id: input.accountId,
        branch_id: branchId,
        event_type: "residual.settlement",
        source_type: "residual_settlement",
        source_id: entryId,
        entry_date: input.entryDate,
        description: "قيد تسوية فروق التقريب",
        meta: JSON.stringify({
          idempotency_key: input.idempotencyKey ?? null,
          settled_count: groupRows.length,
          residual_total: formatDecimal(total4, 4),
          journal_amount: amount,
          direction: positive ? "positive" : "negative",
          ...(input.reference ?? {}),
        }),
        created_by: input.createdBy,
      });
      await trx("journal_lines").insert([
        {
          id: newId(),
          account_id: input.accountId,
          entry_id: entryId,
          accounting_account_id: positive ? mapping.debit_account_id : mapping.credit_account_id,
          branch_id: branchId,
          component: "settlement:debit",
          debit: amount,
          credit: 0,
        },
        {
          id: newId(),
          account_id: input.accountId,
          entry_id: entryId,
          accounting_account_id: positive ? mapping.credit_account_id : mapping.debit_account_id,
          branch_id: branchId,
          component: "settlement:credit",
          debit: 0,
          credit: amount,
        },
      ]);
      journalEntries.push({ id: entryId, branch_id: branchId, amount });
    } else {
      absorbed.push(branchId);
    }
    await trx("financial_event_reconciliations")
      .whereIn("id", groupRows.map((row) => row.id))
      .update({ status: "settled", settlement_journal_id: entryId });
    const deferredEventIds = groupRows
      .map((row) => row.financial_event_id)
      .filter((id): id is string => Boolean(id));
    if (deferredEventIds.length) {
      await trx("financial_events")
        .whereIn("id", deferredEventIds)
        .where({ status: "deferred_rounding" })
        .update({ status: "reconciled", updated_at: trx.fn.now() });
    }
  }

  return {
    settled_count: rows.length,
    total_residual: formatDecimal(grandTotal4, 4),
    journal_entries: journalEntries,
    absorbed_branches: absorbed,
  };
}

export async function reverseJournalEntry(
  db: Knex,
  input: { accountId: string; entryId: string; reason: string; createdBy: string; entryDate?: string }
): Promise<string> {
  return db.transaction(async (trx) => {
    const original = await trx("journal_entries").where({ id: input.entryId, account_id: input.accountId }).first();
    if (!original) throw err.notFound();
    if (original.reversal_of_entry_id) {
      throw err.validation({ reversal_of_entry_id: "لا يمكن عكس قيد عكسي — القيد الأصلي هو محل التصحيح." });
    }
    const reversalDate = input.entryDate ?? new Date().toISOString().slice(0, 10);
    const lockedPeriod = await trx("accounting_periods")
      .where({ account_id: input.accountId, status: "locked" })
      .where("starts_on", "<=", reversalDate)
      .where("ends_on", ">=", reversalDate)
      .first();
    if (lockedPeriod) throw err.conflict();
    const existing = await trx("journal_entries").where({ reversal_of_entry_id: original.id }).first();
    if (existing) return existing.id;
    if (original.event_type === "residual.settlement") {
      // Reversing a settlement logically reopens its residuals. That is only
      // legal while every reopened row still lies in an OPEN period —
      // otherwise a locked period would retroactively contain open residuals.
      const settledRows = await trx("financial_event_reconciliations")
        .where({ account_id: input.accountId, settlement_journal_id: original.id, status: "settled" })
        .forUpdate();
      const lockedEvidence = settledRows.length
        ? await trx("accounting_periods")
            .where({ account_id: input.accountId, status: "locked" })
            .where((qb) => {
              for (const row of settledRows) {
                qb.orWhere((period) =>
                  period.where("starts_on", "<=", row.entry_date).andWhere("ends_on", ">=", row.entry_date)
                );
              }
            })
            .first()
        : undefined;
      if (lockedEvidence) throw err.conflict();
      await trx("financial_event_reconciliations")
        .whereIn("id", settledRows.map((row) => row.id))
        .update({ status: "open", settlement_journal_id: null });
      const reopenedEventIds = settledRows
        .map((row) => row.financial_event_id)
        .filter((id): id is string => Boolean(id));
      if (reopenedEventIds.length) {
        await trx("financial_events")
          .whereIn("id", reopenedEventIds)
          .where({ status: "reconciled" })
          .update({ status: "deferred_rounding", updated_at: trx.fn.now() });
      }
    }
    const lines = await trx("journal_lines").where({ entry_id: original.id }).orderBy("id");
    const reversalId = newId();
    await trx("journal_entries").insert({
      id: reversalId,
      account_id: original.account_id,
      branch_id: original.branch_id,
      event_type: "journal.reversal",
      source_type: "journal_entry",
      source_id: original.id,
      entry_date: reversalDate,
      description: input.reason,
      meta: JSON.stringify({ reversal_of_entry_id: original.id, reason: input.reason }),
      reversal_of_entry_id: original.id,
      created_by: input.createdBy,
    });
    await trx("journal_lines").insert(lines.map((line) => ({
      id: newId(),
      account_id: original.account_id,
      entry_id: reversalId,
      accounting_account_id: line.accounting_account_id,
      branch_id: line.branch_id,
      component: `reversal:${line.component}`,
      debit: line.credit,
      credit: line.debit,
    })));
    return reversalId;
  });
}

export async function ensureAccountingDefaults(db: Knex, accountId: string): Promise<void> {
  // Phase A — realign legacy pilot codes to the ADR-004 chart (idempotent:
  // each UPDATE matches only while the account still holds its legacy code).
  // A move is skipped when a tenant's custom account already occupies the
  // target code — degrading gracefully instead of violating the unique index.
  for (const [systemKey, fromCode, toCode] of LEGACY_CODE_MOVES) {
    const target = SYSTEM_ACCOUNTS.find((entry) => entry[1] === systemKey);
    const occupied = await db("accounting_accounts").where({ account_id: accountId, code: toCode }).first();
    if (occupied) continue;
    await db("accounting_accounts")
      .where({ account_id: accountId, system_key: systemKey, code: fromCode })
      .update({ code: toCode, name_ar: target![2], updated_at: db.fn.now() });
  }

  // Phase B — seed any missing standard accounts.
  const ids: Record<string, string> = {};
  for (const [code, systemKey, nameAr, accountType] of SYSTEM_ACCOUNTS) {
    await db("accounting_accounts")
      .insert({ id: newId(), account_id: accountId, code, system_key: systemKey, name_ar: nameAr, account_type: accountType })
      .onConflict(["account_id", "code"])
      .ignore();
    const row = await db("accounting_accounts").where({ account_id: accountId, system_key: systemKey }).first();
    if (row) ids[systemKey] = row.id;
  }

  const mappings = [
    ["payment.captured", "cash", ids.cash, ids.sales_revenue, ids.vat_payable],
    ["payment.captured", "card", ids.card_clearing, ids.sales_revenue, ids.vat_payable],
    ["payment.captured", "wallet", ids.wallet_clearing, ids.sales_revenue, ids.vat_payable],
    ["refund.posted", "cash", ids.sales_revenue, ids.cash, ids.vat_payable],
    ["refund.posted", "card", ids.sales_revenue, ids.card_clearing, ids.vat_payable],
    ["refund.posted", "wallet", ids.sales_revenue, ids.wallet_clearing, ids.vat_payable],
    ["cash.movement", "cash_in", ids.cash, ids.cash_variance, null],
    ["cash.movement", "cash_out", ids.cash_variance, ids.cash, null],
    ["inventory.receipt", "default", ids.inventory, ids.accounts_payable, null],
    ["inventory.consumption", "default", ids.cogs, ids.inventory, null],
    ["inventory.waste", "default", ids.waste_expense, ids.inventory, null],
    ["inventory.adjustment", "positive", ids.inventory, ids.inventory_variance, null],
    ["inventory.adjustment", "negative", ids.inventory_variance, ids.inventory, null],
    // Residual settlement (ADR-004): canonical direction for a positive open
    // residual (source > journal) — debit inventory, credit rounding. The
    // settlement poster (CP4) mirrors the sides for a negative balance.
    ["residual.settlement", "default", ids.inventory, ids.rounding, null],
  ];
  for (const [eventType, dimensionKey, debitId, creditId, vatId] of mappings) {
    if (!debitId || !creditId) continue;
    await db("accounting_mappings")
      .insert({ id: newId(), account_id: accountId, event_type: eventType, dimension_key: dimensionKey, debit_account_id: debitId, credit_account_id: creditId, vat_account_id: vatId })
      .onConflict(["account_id", "event_type", "dimension_key"])
      .ignore();
  }
}
