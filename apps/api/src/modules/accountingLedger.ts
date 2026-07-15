import { Knex } from "knex";
import { err } from "../lib/errors";
import { newId } from "../lib/ids";
import {
  allocateGross,
  allocateRefund,
  fromMinorUnits,
  toMinorUnits,
} from "../lib/accountingMath";
import { failFinancialEvent } from "./financialOutbox";

const SYSTEM_ACCOUNTS = [
  ["1000", "cash", "النقدية", "asset"],
  ["1010", "card_clearing", "تسويات البطاقات", "asset"],
  ["1020", "wallet_clearing", "تسويات المحافظ", "asset"],
  ["1100", "inventory", "المخزون", "asset"],
  ["2100", "accounts_payable", "الموردون", "liability"],
  ["2200", "vat_payable", "ضريبة القيمة المضافة", "liability"],
  ["3000", "sales_revenue", "إيرادات المبيعات", "revenue"],
  ["4000", "cogs", "تكلفة البضاعة المباعة", "expense"],
  ["5000", "waste_expense", "مصروف الهالك", "expense"],
  ["5100", "inventory_variance", "فروق المخزون", "expense"],
  ["5200", "cash_variance", "فروق وحركات النقدية", "expense"],
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

async function draftPayment(trx: Knex.Transaction, event: FinancialEventRow): Promise<JournalDraft> {
  const payload = payloadOf(event);
  const method = String(payload.method);
  const mapping = await mappingFor(trx, event.account_id, event.event_type, method);
  if (!mapping.vat_account_id) throw err.validation({ accounting_mapping: "VAT account is required" });
  const gross = absolute(toMinorUnits(String(payload.amount)));
  const total = toMinorUnits(String(payload.total));
  const vatTotal = toMinorUnits(String(payload.vat_amount ?? 0));
  const orderId = String(payload.order_id);
  const priorRows = await trx("journal_entries")
    .where({ account_id: event.account_id, order_id: orderId, event_type: "payment.captured" })
    .select("meta");
  const prior = allocationTotals(priorRows);
  const allocation = allocateGross({
    grossMinor: gross,
    totalGrossMinor: total,
    totalVatMinor: vatTotal,
    priorGrossMinor: prior.gross,
    priorRevenueMinor: prior.revenue,
    priorVatMinor: prior.vat,
  });
  const lines: DraftLine[] = [
    { accountingAccountId: mapping.debit_account_id, component: "tender", debitMinor: gross, creditMinor: 0n },
    { accountingAccountId: mapping.credit_account_id, component: "revenue", debitMinor: 0n, creditMinor: allocation.revenueMinor },
  ];
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
  const originalMeta = typeof original.meta === "string" ? JSON.parse(original.meta) : original.meta;
  const priorRefundRows = await trx("journal_entries")
    .where({ account_id: event.account_id, original_payment_id: originalPaymentId, event_type: "refund.posted" })
    .select("meta");
  const prior = allocationTotals(priorRefundRows);
  const gross = absolute(toMinorUnits(String(payload.amount)));
  const allocation = allocateRefund({
    refundGrossMinor: gross,
    originalGrossMinor: BigInt(String(originalMeta.gross_minor)),
    originalRevenueMinor: BigInt(String(originalMeta.revenue_minor)),
    originalVatMinor: BigInt(String(originalMeta.vat_minor)),
    priorRefundGrossMinor: prior.gross,
    priorRefundRevenueMinor: prior.revenue,
    priorRefundVatMinor: prior.vat,
  });
  const mapping = await mappingFor(trx, event.account_id, event.event_type, method);
  if (!mapping.vat_account_id) throw err.validation({ accounting_mapping: "VAT account is required" });
  const lines: DraftLine[] = [
    { accountingAccountId: mapping.debit_account_id, component: "revenue", debitMinor: allocation.revenueMinor, creditMinor: 0n },
  ];
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

async function draftMappedEvent(trx: Knex.Transaction, event: FinancialEventRow): Promise<JournalDraft | null> {
  const payload = payloadOf(event);
  let dimension = "default";
  if (event.event_type === "cash.movement") dimension = String(payload.type);
  if (event.event_type === "inventory.adjustment") {
    dimension = toMinorUnits(String(payload.total_value)) >= 0n ? "positive" : "negative";
  }
  const grossValue = event.event_type === "cash.movement" ? payload.amount : payload.total_value;
  const gross = absolute(toMinorUnits(String(grossValue ?? 0)));
  if (gross === 0n) return null;
  const mapping = await mappingFor(trx, event.account_id, event.event_type, dimension);
  return {
    description: `${event.event_type} ${event.source_id}`,
    meta: { gross_minor: gross.toString(), dimension },
    lines: [
      { accountingAccountId: mapping.debit_account_id, component: "debit", debitMinor: gross, creditMinor: 0n },
      { accountingAccountId: mapping.credit_account_id, component: "credit", debitMinor: 0n, creditMinor: gross },
    ],
  };
}

async function draftInventoryReversal(trx: Knex.Transaction, event: FinancialEventRow): Promise<JournalDraft> {
  const payload = payloadOf(event);
  const originalMovementId = String(payload.reversal_of_movement_id);
  const originalEntry = await trx("journal_entries")
    .where({ account_id: event.account_id, source_type: "stock_movement", source_id: originalMovementId })
    .first();
  if (!originalEntry) throw err.validation({ original_movement: "Original movement journal is not posted" });
  const originalLines = await trx("journal_lines").where({ entry_id: originalEntry.id }).orderBy("id");
  return {
    description: `Inventory reversal of ${originalMovementId}`,
    meta: { reversal_of_stock_movement_id: originalMovementId },
    lines: originalLines.map((line) => ({
      accountingAccountId: line.accounting_account_id,
      component: `reversal:${line.component}`,
      debitMinor: toMinorUnits(String(line.credit)),
      creditMinor: toMinorUnits(String(line.debit)),
    })),
  };
}

async function buildDraft(trx: Knex.Transaction, event: FinancialEventRow): Promise<JournalDraft | null> {
  if (event.event_type === "payment.captured") return draftPayment(trx, event);
  if (event.event_type === "refund.posted") return draftRefund(trx, event);
  if (event.event_type === "inventory.reversal") return draftInventoryReversal(trx, event);
  return draftMappedEvent(trx, event);
}

export async function postClaimedFinancialEvent(
  db: Knex,
  input: { eventId: string; workerId: string; createdBy?: string }
): Promise<{ status: "posted" | "failed" | "dead"; journalEntryId: string | null }> {
  try {
    const journalEntryId = await db.transaction(async (trx) => {
      const event = await trx<FinancialEventRow>("financial_events")
        .where({ id: input.eventId, status: "processing", claimed_by: input.workerId })
        .forUpdate()
        .first();
      if (!event) throw err.conflict();
      const existing = await trx("journal_entries").where({ financial_event_id: event.id }).first();
      if (existing) {
        await trx("financial_events").where({ id: event.id }).update({ status: "posted", posted_at: trx.fn.now(), claimed_by: null, claimed_at: null, updated_at: trx.fn.now() });
        return existing.id as string;
      }
      const draft = await buildDraft(trx, event);
      if (!draft) {
        await trx("financial_events").where({ id: event.id }).update({ status: "posted", posted_at: trx.fn.now(), claimed_by: null, claimed_at: null, updated_at: trx.fn.now() });
        return null;
      }
      const entryId = newId();
      const entryDate = new Date(event.created_at).toISOString().slice(0, 10);
      await trx("journal_entries").insert({
        id: entryId,
        account_id: event.account_id,
        branch_id: event.branch_id,
        financial_event_id: event.id,
        event_type: event.event_type,
        source_type: event.source_type,
        source_id: event.source_id,
        order_id: draft.orderId ?? null,
        payment_id: draft.paymentId ?? null,
        original_payment_id: draft.originalPaymentId ?? null,
        entry_date: entryDate,
        description: draft.description,
        meta: JSON.stringify(draft.meta),
        created_by: input.createdBy ?? null,
      });
      await trx("journal_lines").insert(
        draft.lines.map((line) => ({
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
      await trx("financial_events").where({ id: event.id }).update({
        status: "posted",
        posted_at: trx.fn.now(),
        claimed_by: null,
        claimed_at: null,
        next_attempt_at: null,
        last_error: null,
        updated_at: trx.fn.now(),
      });
      return entryId;
    });
    return { status: "posted", journalEntryId };
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

export async function reverseJournalEntry(
  db: Knex,
  input: { accountId: string; entryId: string; reason: string; createdBy: string; entryDate?: string }
): Promise<string> {
  return db.transaction(async (trx) => {
    const original = await trx("journal_entries").where({ id: input.entryId, account_id: input.accountId }).first();
    if (!original) throw err.notFound();
    const reversalDate = input.entryDate ?? new Date().toISOString().slice(0, 10);
    const lockedPeriod = await trx("accounting_periods")
      .where({ account_id: input.accountId, status: "locked" })
      .where("starts_on", "<=", reversalDate)
      .where("ends_on", ">=", reversalDate)
      .first();
    if (lockedPeriod) throw err.conflict();
    const existing = await trx("journal_entries").where({ reversal_of_entry_id: original.id }).first();
    if (existing) return existing.id;
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
  const ids: Record<string, string> = {};
  for (const [code, systemKey, nameAr, accountType] of SYSTEM_ACCOUNTS) {
    await db("accounting_accounts")
      .insert({ id: newId(), account_id: accountId, code, system_key: systemKey, name_ar: nameAr, account_type: accountType })
      .onConflict(["account_id", "code"])
      .ignore();
    ids[systemKey] = (await db("accounting_accounts").where({ account_id: accountId, system_key: systemKey }).first()).id;
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
  ];
  for (const [eventType, dimensionKey, debitId, creditId, vatId] of mappings) {
    await db("accounting_mappings")
      .insert({ id: newId(), account_id: accountId, event_type: eventType, dimension_key: dimensionKey, debit_account_id: debitId, credit_account_id: creditId, vat_account_id: vatId })
      .onConflict(["account_id", "event_type", "dimension_key"])
      .ignore();
  }
}
