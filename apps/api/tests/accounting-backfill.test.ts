import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { config } from "../src/config";
import { makeKnex } from "../src/db/knex";
import { seedFoundation } from "../src/db/seedData";
import { newId } from "../src/lib/ids";
import { buildAccountingBackfillReport } from "../src/modules/accountingBackfill";
import { enqueueFinancialEvent } from "../src/modules/financialOutbox";

const db = makeKnex(config.testDatabaseUrl);
let accountId = "";
let legacyPaymentId = "";

beforeAll(async () => {
  await db.migrate.rollback(undefined, true);
  await db.migrate.latest();
  const seed = await seedFoundation(db);
  accountId = seed.accountId;
  const order = await db("orders")
    .where({ account_id: accountId, branch_id: seed.branchId })
    .whereNot("status", "cancelled")
    .whereNotExists(
      db("payments")
        .select(1)
        .whereRaw("payments.order_id = orders.id")
        .whereNot("method", "unpaid")
    )
    .first();
  const owner = await db("users").where({ account_id: accountId, email: seed.ownerEmail }).first();
  legacyPaymentId = newId();
  await db("payments").insert({
    id: legacyPaymentId,
    order_id: order.id,
    branch_id: order.branch_id,
    method: "card",
    amount: "1.00",
    received_by: owner.id,
    kind: "payment",
  });
});

afterAll(async () => {
  await db.destroy();
});

describe("Accounting dry-run backfill", () => {
  it("previews legacy sources without writing by default", async () => {
    const before = await db("financial_events").where({ source_type: "payment", source_id: legacyPaymentId });
    const report = await buildAccountingBackfillReport(db, { accountId });
    const after = await db("financial_events").where({ source_type: "payment", source_id: legacyPaymentId });
    expect(report.mode).toBe("dry_run");
    expect(report.preview).toContainEqual(expect.objectContaining({ source_kind: "payment", source_id: legacyPaymentId, event_type: "payment.captured" }));
    expect(before).toHaveLength(0);
    expect(after).toHaveLength(0);
    expect(report.created_event_ids).toEqual([]);
  });

  it("rejects write mode without both test environment and explicit confirmation", async () => {
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    await expect(buildAccountingBackfillReport(db, { accountId, apply: true, confirmTestDatabase: true })).rejects.toThrow("restricted");
    process.env.NODE_ENV = original;
    await expect(buildAccountingBackfillReport(db, { accountId, apply: true })).rejects.toThrow("restricted");
  });

  it("creates idempotent pending events only in confirmed test mode", async () => {
    const first = await buildAccountingBackfillReport(db, { accountId, apply: true, confirmTestDatabase: true });
    expect(first.mode).toBe("apply_test_only");
    expect(first.created_event_ids).toHaveLength(first.preview.length);
    expect(first.preview.length).toBeGreaterThan(0);
    const paymentEvents = await db("financial_events").where({ source_type: "payment", source_id: legacyPaymentId });
    expect(paymentEvents).toHaveLength(1);
    expect(first.created_event_ids).toContain(paymentEvents[0].id);
    const second = await buildAccountingBackfillReport(db, { accountId, apply: true, confirmTestDatabase: true });
    expect(second.preview).toEqual([]);
    expect(second.created_event_ids).toEqual([]);
    expect(await db("financial_events").where({ source_type: "payment", source_id: legacyPaymentId })).toHaveLength(1);
  });

  it("reports missing mappings, balance checks, and reconciliation totals", async () => {
    const unknownId = await db.transaction((trx) => enqueueFinancialEvent(trx, {
      accountId,
      sourceType: "legacy_test",
      sourceId: "unmapped-source",
      eventType: "legacy.unmapped",
      idempotencyKey: "legacy-unmapped-event",
      payload: { version: 1 },
    }));
    const report = await buildAccountingBackfillReport(db, { accountId });
    expect(report.missing_mappings).toContainEqual({ event_id: unknownId, event_type: "legacy.unmapped", dimension_key: "default" });
    expect(report.unbalanced_entries).toEqual([]);
    expect(report.reconciliation).toEqual([
      expect.objectContaining({ account_id: accountId, operational_payment_net: expect.any(String), posted_tender_debit: expect.any(String), posted_tender_credit: expect.any(String) }),
    ]);
  });
});
