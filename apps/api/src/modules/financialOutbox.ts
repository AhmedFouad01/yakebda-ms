import { Knex } from "knex";
import { err } from "../lib/errors";
import { newId } from "../lib/ids";
import { allocateGross, allocateRefund, toMinorUnits } from "../lib/accountingMath";

type FinancialEventStatus =
  | "pending"
  | "processing"
  | "posted"
  | "failed"
  | "dead"
  | "pending_policy"
  | "deferred_rounding"
  | "non_posting"
  | "reconciled";

interface PaymentSnapshotRow {
  id: string;
  order_id: string;
  amount: string | number;
  method: string;
  kind: string | null;
  reversal_of_payment_id: string | null;
  allocation_sequence: string | number;
  created_at: Date | string;
}

export interface FinancialEventInput {
  accountId: string;
  branchId?: string | null;
  sourceType: string;
  sourceId: string;
  eventType: string;
  idempotencyKey: string;
  payloadVersion?: number;
  payload: Record<string, unknown>;
  initialStatus?: FinancialEventStatus;
}

export async function enqueueFinancialEvent(
  trx: Knex.Transaction,
  input: FinancialEventInput
): Promise<string> {
  const existing = await trx("financial_events")
    .where({ account_id: input.accountId, idempotency_key: input.idempotencyKey })
    .first();
  if (existing) {
    if (
      existing.source_type !== input.sourceType ||
      existing.source_id !== input.sourceId ||
      existing.event_type !== input.eventType
    ) {
      throw err.conflict();
    }
    return existing.id;
  }

  const id = newId();
  await trx("financial_events").insert({
    id,
    account_id: input.accountId,
    branch_id: input.branchId ?? null,
    source_type: input.sourceType,
    source_id: input.sourceId,
    event_type: input.eventType,
    idempotency_key: input.idempotencyKey,
    payload_version: input.payloadVersion ?? 1,
    payload: JSON.stringify(input.payload),
    status: input.initialStatus ?? "pending",
  });
  return id;
}

async function captureAllocation(
  trx: Knex.Transaction,
  input: { accountId: string; orderId: string; paymentId: string; total: string | number; vatAmount: string | number }
) {
  const rows = await trx<PaymentSnapshotRow>("payments")
    .where({ order_id: input.orderId })
    .whereNot("method", "unpaid")
    .where("amount", ">", 0)
    .orderBy("allocation_sequence", "asc");
  let priorGross = 0n;
  let priorRevenue = 0n;
  let priorVat = 0n;
  for (const payment of rows) {
    const gross = toMinorUnits(payment.amount);
    const allocation = allocateGross({
      grossMinor: gross,
      totalGrossMinor: toMinorUnits(input.total),
      totalVatMinor: toMinorUnits(input.vatAmount),
      priorGrossMinor: priorGross,
      priorRevenueMinor: priorRevenue,
      priorVatMinor: priorVat,
    });
    if (payment.id === input.paymentId) {
      return { grossMinor: gross, ...allocation };
    }
    priorGross += gross;
    priorRevenue += allocation.revenueMinor;
    priorVat += allocation.vatMinor;
  }
  throw err.notFound();
}

async function refundAllocation(
  trx: Knex.Transaction,
  input: { accountId: string; orderId: string; paymentId: string; originalPaymentId: string; total: string | number; vatAmount: string | number }
) {
  const original = await captureAllocation(trx, {
    accountId: input.accountId,
    orderId: input.orderId,
    paymentId: input.originalPaymentId,
    total: input.total,
    vatAmount: input.vatAmount,
  });
  const rows = await trx<PaymentSnapshotRow>("payments")
    .where({ order_id: input.orderId, reversal_of_payment_id: input.originalPaymentId, kind: "refund" })
    .orderBy("allocation_sequence", "asc");
  let priorGross = 0n;
  let priorRevenue = 0n;
  let priorVat = 0n;
  for (const payment of rows) {
    const gross = -toMinorUnits(payment.amount);
    const allocation = allocateRefund({
      refundGrossMinor: gross,
      originalGrossMinor: original.grossMinor,
      originalRevenueMinor: original.revenueMinor,
      originalVatMinor: original.vatMinor,
      priorRefundGrossMinor: priorGross,
      priorRefundRevenueMinor: priorRevenue,
      priorRefundVatMinor: priorVat,
    });
    if (payment.id === input.paymentId) {
      return { grossMinor: gross, ...allocation };
    }
    priorGross += gross;
    priorRevenue += allocation.revenueMinor;
    priorVat += allocation.vatMinor;
  }
  throw err.notFound();
}

export async function enqueuePaymentFinancialEvent(
  trx: Knex.Transaction,
  input: { accountId: string; paymentId: string; eventType: "payment.captured" | "refund.posted" }
): Promise<string | null> {
  const row = await trx("payments as payment")
    .join("orders as order", "order.id", "payment.order_id")
    .where({ "payment.id": input.paymentId, "order.account_id": input.accountId })
    .select(
      "payment.id as payment_id",
      "payment.order_id",
      "payment.branch_id",
      "payment.method",
      "payment.amount",
      "payment.kind",
      "payment.reversal_of_payment_id",
      "payment.shift_id",
      "order.order_no",
      "order.source_id",
      "order.subtotal",
      "order.discount",
      "order.service_fee",
      "order.vat_amount",
      "order.delivery_fee",
      "order.rounding_adjustment",
      "order.total"
    )
    .first();
  if (!row) throw err.notFound();
  if (row.method === "unpaid" || Number(row.amount) === 0) return null;
  const allocation = input.eventType === "payment.captured"
    ? await captureAllocation(trx, {
        accountId: input.accountId,
        orderId: row.order_id,
        paymentId: row.payment_id,
        total: row.total,
        vatAmount: row.vat_amount,
      })
    : await refundAllocation(trx, {
        accountId: input.accountId,
        orderId: row.order_id,
        paymentId: row.payment_id,
        originalPaymentId: String(row.reversal_of_payment_id),
        total: row.total,
        vatAmount: row.vat_amount,
      });
  return enqueueFinancialEvent(trx, {
    accountId: input.accountId,
    branchId: row.branch_id,
    sourceType: "payment",
    sourceId: row.payment_id,
    eventType: input.eventType,
    idempotencyKey: `payment:${row.payment_id}:${input.eventType}:v1`,
    payloadVersion: 2,
    payload: {
      version: 2,
      ...row,
      accounting_allocation_version: 1,
      accounting_gross_minor: allocation.grossMinor.toString(),
      accounting_revenue_minor: allocation.revenueMinor.toString(),
      accounting_vat_minor: allocation.vatMinor.toString(),
    },
  });
}

export async function claimFinancialEvents(
  db: Knex,
  input: { workerId: string; limit: number; accountId?: string; branchId?: string }
) {
  return db.transaction(async (trx) => {
    const rows = await trx("financial_events")
      .whereIn("status", ["pending", "failed"])
      .where((query) => query.whereNull("next_attempt_at").orWhere("next_attempt_at", "<=", trx.fn.now()))
      .modify((query) => {
        if (input.accountId) query.where("account_id", input.accountId);
        if (input.branchId) query.where("branch_id", input.branchId);
      })
      .orderBy([{ column: "created_at", order: "asc" }, { column: "id", order: "asc" }])
      .forUpdate()
      .skipLocked()
      .limit(input.limit)
      .select("id");
    if (!rows.length) return [];
    return trx("financial_events")
      .whereIn("id", rows.map((row: { id: string }) => row.id))
      .update({
        status: "processing",
        attempts: trx.raw("attempts + 1"),
        claimed_by: input.workerId,
        claimed_at: trx.fn.now(),
        last_error: null,
        updated_at: trx.fn.now(),
      })
      .returning("*");
  });
}

export async function failFinancialEvent(
  db: Knex,
  input: { eventId: string; workerId: string; error: string; maxAttempts?: number }
): Promise<{ id: string; status: "failed" | "dead" }> {
  const current = await db("financial_events")
    .where({ id: input.eventId, status: "processing", claimed_by: input.workerId })
    .first();
  if (!current) throw err.conflict();
  const status: "failed" | "dead" =
    Number(current.attempts) >= (input.maxAttempts ?? 5) ? "dead" : "failed";
  await db("financial_events").where({ id: current.id }).update({
    status,
    last_error: input.error.slice(0, 500),
    next_attempt_at: status === "failed" ? db.fn.now() : null,
    claimed_by: null,
    claimed_at: null,
    updated_at: db.fn.now(),
  });
  return { id: current.id, status };
}

export async function markFinancialEventPosted(
  db: Knex,
  input: { eventId: string; workerId: string }
) {
  const rows = await db("financial_events")
    .where({ id: input.eventId, status: "processing", claimed_by: input.workerId })
    .update({
      status: "posted",
      posted_at: db.fn.now(),
      claimed_by: null,
      claimed_at: null,
      next_attempt_at: null,
      last_error: null,
      updated_at: db.fn.now(),
    })
    .returning("id");
  if (!rows.length) throw err.conflict();
}

export async function recoverStaleFinancialEvents(db: Knex, staleBefore: Date): Promise<number> {
  return db("financial_events")
    .where({ status: "processing" })
    .where("claimed_at", "<", staleBefore)
    .update({
      status: "failed",
      claimed_by: null,
      claimed_at: null,
      last_error: "stale claim recovered",
      next_attempt_at: db.fn.now(),
      updated_at: db.fn.now(),
    });
}
