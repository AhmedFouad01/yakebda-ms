import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
import { config } from "../src/config";
import { makeKnex } from "../src/db/knex";
import { seedFoundation } from "../src/db/seedData";
import { newId } from "../src/lib/ids";
import { claimFinancialEvents, enqueueFinancialEvent } from "../src/modules/financialOutbox";
import { postClaimedFinancialEvent } from "../src/modules/accountingLedger";
import { createStockMovement } from "../src/modules/inventoryService";

const db = makeKnex(config.testDatabaseUrl);
let app: ReturnType<typeof createApp>;
let token = "";
let accountId = "";
let branchId = "";
let secondBranchId = "";
let locationId = "";
let secondLocationId = "";
let unitId = "";
let itemSequence = 0;

const auth = () => ({ Authorization: `Bearer ${token}` });

async function createItem(): Promise<string> {
  itemSequence += 1;
  const response = await request(app)
    .post("/api/v1/inventory/items")
    .set(auth())
    .send({
      name_ar: `P0 precision item ${itemSequence}`,
      sku: `P0-PREC-${itemSequence}`,
      base_unit_id: unitId,
      reorder_level: "0",
    });
  expect(response.status).toBe(201);
  return response.body.data.id as string;
}

async function createReceipt(value: string, key: string, location = locationId, item?: string) {
  const itemId = item ?? await createItem();
  const response = await request(app)
    .post("/api/v1/inventory/movements")
    .set(auth())
    .send({
      location_id: location,
      item_id: itemId,
      movement_type: "receipt",
      quantity: "1",
      unit_cost: value,
      source_type: "p0_precision_test",
      idempotency_key: key,
    });
  expect(response.status).toBe(201);
  return { movementId: response.body.data.id as string, itemId };
}

async function processPending() {
  const workerId = `p0-precision-${Date.now()}-${Math.random()}`;
  const claimed = await claimFinancialEvents(db, { workerId, limit: 100, accountId });
  const results = [];
  for (const event of claimed) {
    results.push({
      eventId: event.id as string,
      ...(await postClaimedFinancialEvent(db, { eventId: event.id, workerId })),
    });
  }
  return results;
}

async function evidenceForMovement(movementId: string) {
  const event = await db("financial_events")
    .where({ account_id: accountId, source_type: "stock_movement", source_id: movementId })
    .first();
  const journal = await db("journal_entries").where({ financial_event_id: event.id }).first();
  const reconciliation = await db("financial_event_reconciliations").where({ financial_event_id: event.id }).first();
  return { event, journal, reconciliation };
}

beforeAll(async () => {
  await db.migrate.rollback(undefined, true);
  await db.migrate.latest();
  const seed = await seedFoundation(db);
  accountId = seed.accountId;
  branchId = seed.branchId;
  secondBranchId = seed.branch2Id!;
  app = createApp(db);
  const login = await request(app)
    .post("/api/v1/auth/login")
    .send({ email: seed.ownerEmail, password: seed.ownerPassword });
  token = login.body.token;
  const locations = await request(app).get("/api/v1/inventory/locations").set(auth());
  locationId = locations.body.data.find((row: { branch_id: string }) => row.branch_id === branchId).id;
  secondLocationId = locations.body.data.find((row: { branch_id: string }) => row.branch_id === secondBranchId).id;
  unitId = (await db("inventory_units").where({ account_id: accountId, symbol: "kg" }).first()).id;
});

afterAll(async () => {
  await db.destroy();
});

describe("P0 sub-cent inventory reconciliation", () => {
  it("defers 0.004 with reconciliation evidence instead of marking it posted", async () => {
    const receipt = await createReceipt("0.004", "p0-subcent-004");
    await processPending();
    const { event, journal, reconciliation } = await evidenceForMovement(receipt.movementId);
    expect(event.status).toBe("deferred_rounding");
    expect(journal).toBeUndefined();
    expect(reconciliation).toMatchObject({
      source_amount: "0.0040",
      journal_amount: "0.00",
      residual_amount: "0.0040",
      status: "open",
    });
  });

  it("posts 0.005 and 0.006 journals while retaining their exact residuals", async () => {
    const half = await createReceipt("0.005", "p0-subcent-005");
    const over = await createReceipt("0.006", "p0-subcent-006");
    await processPending();
    const halfEvidence = await evidenceForMovement(half.movementId);
    const overEvidence = await evidenceForMovement(over.movementId);
    expect(halfEvidence.event.status).toBe("posted");
    expect(overEvidence.event.status).toBe("posted");
    expect(halfEvidence.journal).toBeTruthy();
    expect(overEvidence.journal).toBeTruthy();
    expect(halfEvidence.reconciliation).toMatchObject({ source_amount: "0.0050", journal_amount: "0.01", residual_amount: "-0.0050" });
    expect(overEvidence.reconciliation).toMatchObject({ source_amount: "0.0060", journal_amount: "0.01", residual_amount: "-0.0040" });
  });

  it("accumulates several residuals without silently dropping a crossing of one cent", async () => {
    const first = await createReceipt("0.004", "p0-residual-aggregate-a");
    const second = await createReceipt("0.004", "p0-residual-aggregate-b");
    await processPending();
    const firstTwo = await db("financial_event_reconciliations")
      .whereIn("financial_event_id", [
        (await evidenceForMovement(first.movementId)).event.id,
        (await evidenceForMovement(second.movementId)).event.id,
      ])
      .sum<{ total: string }>("residual_amount as total")
      .first();
    expect(firstTwo?.total).toBe("0.0080");

    const third = await createReceipt("0.004", "p0-residual-aggregate-c");
    await processPending();
    const ids = [first, second, third];
    const eventIds = [];
    for (const row of ids) eventIds.push((await evidenceForMovement(row.movementId)).event.id as string);
    const crossed = await db("financial_event_reconciliations")
      .whereIn("financial_event_id", eventIds)
      .sum<{ total: string }>("residual_amount as total")
      .first();
    expect(crossed?.total).toBe("0.0120");
  });

  it("reconciles a sub-cent receipt with an exact linked reversal", async () => {
    const original = await createReceipt("0.004", "p0-subcent-reversal-original");
    await processPending();
    const reversal = await createStockMovement(db, {
      accountId,
      locationId,
      itemId: original.itemId,
      movementType: "reversal",
      quantity: "-1",
      sourceType: "p0_precision_reversal",
      sourceId: original.movementId,
      idempotencyKey: "p0-subcent-reversal",
      reversalOfMovementId: original.movementId,
    });
    await processPending();
    const originalEvidence = await evidenceForMovement(original.movementId);
    const reversalEvidence = await evidenceForMovement(reversal.id);
    expect(originalEvidence.event.status).toBe("reconciled");
    expect(reversalEvidence.event.status).toBe("reconciled");
    expect(originalEvidence.reconciliation.status).toBe("reversed");
    expect(reversalEvidence.reconciliation).toMatchObject({
      source_amount: "-0.0040",
      journal_amount: "0.00",
      residual_amount: "-0.0040",
      status: "settled",
      reverses_reconciliation_id: originalEvidence.reconciliation.id,
    });
  });

  it("reverses both the rounded journal and residual for a 0.005 event", async () => {
    const original = await createReceipt("0.005", "p0-rounded-reversal-original");
    await processPending();
    const reversal = await createStockMovement(db, {
      accountId,
      locationId,
      itemId: original.itemId,
      movementType: "reversal",
      quantity: "-1",
      sourceType: "p0_precision_reversal",
      sourceId: original.movementId,
      idempotencyKey: "p0-rounded-reversal",
      reversalOfMovementId: original.movementId,
    });
    await processPending();
    const originalEvidence = await evidenceForMovement(original.movementId);
    const reversalEvidence = await evidenceForMovement(reversal.id);
    expect(originalEvidence.event.status).toBe("posted");
    expect(reversalEvidence.event.status).toBe("posted");
    expect(originalEvidence.reconciliation.status).toBe("reversed");
    expect(reversalEvidence.reconciliation).toMatchObject({
      source_amount: "-0.0050",
      journal_amount: "-0.01",
      residual_amount: "0.0050",
      status: "settled",
      reverses_reconciliation_id: originalEvidence.reconciliation.id,
    });
    const originalLines = await db("journal_lines").where({ entry_id: originalEvidence.journal.id }).orderBy("component");
    const reversalLines = await db("journal_lines").where({ entry_id: reversalEvidence.journal.id }).orderBy("component");
    expect(reversalLines.map((line) => [line.debit, line.credit])).toEqual(
      originalLines.map((line) => [line.credit, line.debit])
    );
  });

  it("keeps residual evidence isolated and queryable by branch", async () => {
    const secondBranchReceipt = await createReceipt("0.004", "p0-subcent-second-branch", secondLocationId);
    await processPending();
    const evidence = await evidenceForMovement(secondBranchReceipt.movementId);
    expect(evidence.reconciliation.branch_id).toBe(secondBranchId);

    const response = await request(app)
      .get(`/api/v1/accounting/rounding-reconciliations?branch_id=${secondBranchId}&status=open`)
      .set(auth());
    expect(response.status).toBe(200);
    expect(response.body.data.some((row: { financial_event_id: string }) => row.financial_event_id === evidence.event.id)).toBe(true);
    expect(response.body.data.every((row: { account_id: string; branch_id: string }) => row.account_id === accountId && row.branch_id === secondBranchId)).toBe(true);
  });

  it("keeps movement and reconciliation creation idempotent on retry", async () => {
    const itemId = await createItem();
    const first = await createReceipt("0.004", "p0-subcent-idempotent", locationId, itemId);
    await processPending();
    const replay = await request(app)
      .post("/api/v1/inventory/movements")
      .set(auth())
      .send({
        location_id: locationId,
        item_id: itemId,
        movement_type: "receipt",
        quantity: "1",
        unit_cost: "0.004",
        source_type: "p0_precision_test",
        idempotency_key: "p0-subcent-idempotent",
      });
    expect(replay.status).toBe(200);
    expect(replay.body.data.id).toBe(first.movementId);
    await processPending();
    const evidence = await evidenceForMovement(first.movementId);
    expect(await db("financial_event_reconciliations").where({ financial_event_id: evidence.event.id })).toHaveLength(1);
  });

  it("closes a period with open residuals only through automatic settlement (ADR-004 type A)", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const openBefore = await db("financial_event_reconciliations").where({ account_id: accountId, status: "open" });
    expect(openBefore.length).toBeGreaterThan(0);

    // When settlement cannot run (rounding mapping unmapped) the close is
    // refused atomically: no locked period, residuals untouched.
    await db("accounting_mappings").where({ account_id: accountId, event_type: "residual.settlement" }).delete();
    const blocked = await request(app)
      .post("/api/v1/accounting/periods/lock")
      .set(auth())
      .send({ starts_on: today, ends_on: today });
    expect(blocked.status).toBe(422);
    expect(await db("accounting_periods").where({ account_id: accountId, starts_on: today, ends_on: today, status: "locked" })).toHaveLength(0);
    expect((await db("financial_event_reconciliations").where({ account_id: accountId, status: "open" })).length).toBe(openBefore.length);

    // With the mapping restored, close = settlement -> zero-check -> lock.
    const inventoryId = (await db("accounting_accounts").where({ account_id: accountId, system_key: "inventory" }).first()).id;
    const roundingId = (await db("accounting_accounts").where({ account_id: accountId, system_key: "rounding" }).first()).id;
    await db("accounting_mappings").insert({
      id: newId(),
      account_id: accountId,
      event_type: "residual.settlement",
      dimension_key: "default",
      debit_account_id: inventoryId,
      credit_account_id: roundingId,
      vat_account_id: null,
    });
    const locked = await request(app)
      .post("/api/v1/accounting/periods/lock")
      .set(auth())
      .send({ starts_on: today, ends_on: today });
    expect(locked.status).toBe(201);
    expect(locked.body.settlement.settled_count).toBe(openBefore.length);
    expect(await db("financial_event_reconciliations").where({ account_id: accountId, status: "open" })).toHaveLength(0);
    expect(await db("accounting_periods").where({ account_id: accountId, starts_on: today, ends_on: today, status: "locked" })).toHaveLength(1);
  });

  it("blocks new residual evidence from being inserted into a locked period", async () => {
    const lockedAccountId = newId();
    const lockedBranchId = newId();
    const today = new Date().toISOString().slice(0, 10);
    await db("accounts").insert({ id: lockedAccountId, name: "P0 locked residual account" });
    await db("branches").insert({ id: lockedBranchId, account_id: lockedAccountId, name: "P0 locked residual branch" });
    const eventId = await db.transaction((trx) => enqueueFinancialEvent(trx, {
      accountId: lockedAccountId,
      branchId: lockedBranchId,
      sourceType: "p0_precision_test",
      sourceId: "locked-period-residual",
      eventType: "inventory.receipt",
      idempotencyKey: "p0-locked-period-residual",
      payload: { total_value: "0.0040" },
      initialStatus: "deferred_rounding",
    }));
    await db("accounting_periods").insert({
      id: newId(),
      account_id: lockedAccountId,
      starts_on: today,
      ends_on: today,
      status: "locked",
    });
    await expect(db("financial_event_reconciliations").insert({
      id: newId(),
      account_id: lockedAccountId,
      branch_id: lockedBranchId,
      financial_event_id: eventId,
      event_type: "inventory.receipt",
      dimension_key: "default",
      entry_date: today,
      source_amount: "0.0040",
      journal_amount: "0.00",
      residual_amount: "0.0040",
      status: "open",
    })).rejects.toMatchObject({ constraint: "journal_period_locked" });
  });

  it("has no posted inventory event without journal or reconciliation evidence", async () => {
    const rows = await db("financial_events as event")
      .leftJoin("journal_entries as journal", "journal.financial_event_id", "event.id")
      .leftJoin("financial_event_reconciliations as reconciliation", "reconciliation.financial_event_id", "event.id")
      .where("event.account_id", accountId)
      .where("event.event_type", "like", "inventory.%")
      .where("event.status", "posted")
      .whereNull("journal.id")
      .whereNull("reconciliation.id")
      .select("event.id");
    expect(rows).toEqual([]);
  });
});
