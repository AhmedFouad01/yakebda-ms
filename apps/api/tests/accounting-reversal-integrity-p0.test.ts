import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
import { config } from "../src/config";
import { makeKnex } from "../src/db/knex";
import { seedFoundation } from "../src/db/seedData";
import { newId } from "../src/lib/ids";
import {
  postClaimedFinancialEvent,
  reverseJournalEntry,
} from "../src/modules/accountingLedger";
import { claimFinancialEvents } from "../src/modules/financialOutbox";
import { createStockMovement } from "../src/modules/inventoryService";

const db = makeKnex(config.testDatabaseUrl);
let app: ReturnType<typeof createApp>;
let token = "";
let accountId = "";
let ownerId = "";
let branchId = "";
let sourceId = "";
let productId = "";
let locationId = "";
let itemId = "";
let sequence = 0;

const auth = () => ({ Authorization: `Bearer ${token}` });

async function processPending(workerPrefix = "f01") {
  const workerId = `${workerPrefix}-${Date.now()}-${Math.random()}`;
  const claimed = await claimFinancialEvents(db, { workerId, limit: 100, accountId });
  return Promise.all(claimed.map(async (event) => ({
    eventId: event.id as string,
    ...(await postClaimedFinancialEvent(db, { eventId: event.id, workerId, createdBy: ownerId })),
  })));
}

async function createPostedPayment(total = "10.00", vat = "1.40") {
  sequence += 1;
  const order = await request(app)
    .post("/api/v1/orders")
    .set(auth())
    .send({
      branch_id: branchId,
      source_id: sourceId,
      order_type: "takeaway",
      delivery_fee: 0,
      discount: 0,
      submit: true,
      payment_method: "unpaid",
      items: [{ product_id: productId, qty: 1, modifier_ids: [] }],
    });
  expect(order.status).toBe(201);
  await db("orders").where({ id: order.body.data.id }).update({ subtotal: total, vat_amount: vat, total });
  const payment = await request(app)
    .post(`/api/v1/orders/${order.body.data.id}/payments`)
    .set(auth())
    .send({ method: "card", amount: Number(total), idempotency_key: `f01-payment-${sequence}` });
  expect(payment.status).toBe(201);
  const posted = await processPending(`f01-payment-${sequence}`);
  expect(posted.every((result) => result.status === "posted")).toBe(true);
  const entry = await db("journal_entries")
    .where({ account_id: accountId, payment_id: payment.body.data.id, event_type: "payment.captured" })
    .first();
  expect(entry).toBeTruthy();
  return { orderId: order.body.data.id as string, paymentId: payment.body.data.id as string, entry };
}

async function createPostedInventoryReceipt() {
  sequence += 1;
  const movement = await request(app)
    .post("/api/v1/inventory/movements")
    .set(auth())
    .send({
      location_id: locationId,
      item_id: itemId,
      movement_type: "receipt",
      quantity: "1",
      unit_cost: "10.0000",
      source_type: "f01_reversal_test",
      idempotency_key: `f01-receipt-${sequence}`,
      reason: "F-01 receipt",
    });
  expect(movement.status).toBe(201);
  await processPending(`f01-receipt-${sequence}`);
  const event = await db("financial_events")
    .where({ account_id: accountId, source_type: "stock_movement", source_id: movement.body.data.id })
    .first();
  const entry = await db("journal_entries").where({ financial_event_id: event.id }).first();
  expect(entry).toBeTruthy();
  return { movementId: movement.body.data.id as string, event, entry };
}

async function createInventoryReversal(originalMovementId: string) {
  sequence += 1;
  const movement = await createStockMovement(db, {
    accountId,
    locationId,
    itemId,
    movementType: "reversal",
    quantity: "-1",
    sourceType: "f01_reversal_test",
    sourceId: originalMovementId,
    idempotencyKey: `f01-inventory-reversal-${sequence}`,
    reason: "F-01 inventory reversal",
    createdBy: ownerId,
    reversalOfMovementId: originalMovementId,
  });
  const event = await db("financial_events")
    .where({ account_id: accountId, source_type: "stock_movement", source_id: movement.id })
    .first();
  return { movement, event };
}

async function insertHistoricalInventoryReversal(original: { movementId: string; entry: { id: string } }) {
  const originalLines = await db("journal_lines").where({ entry_id: original.entry.id }).orderBy("id");
  const reversalId = newId();
  await db.transaction(async (trx) => {
    await trx("journal_entries").insert({
      id: reversalId,
      account_id: accountId,
      branch_id: branchId,
      event_type: "inventory.reversal",
      source_type: "stock_movement",
      source_id: newId(),
      entry_date: new Date().toISOString().slice(0, 10),
      description: "Historical inventory reversal without journal linkage",
      meta: JSON.stringify({ reversal_of_stock_movement_id: original.movementId }),
      created_by: ownerId,
    });
    await trx("journal_lines").insert(originalLines.map((line) => ({
      id: newId(),
      account_id: accountId,
      entry_id: reversalId,
      accounting_account_id: line.accounting_account_id,
      branch_id: line.branch_id,
      component: `reversal:${line.component}`,
      debit: line.credit,
      credit: line.debit,
    })));
  });
  return reversalId;
}

beforeAll(async () => {
  await db.migrate.rollback(undefined, true);
  await db.migrate.latest();
  const seed = await seedFoundation(db);
  accountId = seed.accountId;
  branchId = seed.branchId;
  app = createApp(db);
  const login = await request(app)
    .post("/api/v1/auth/login")
    .send({ email: seed.ownerEmail, password: seed.ownerPassword });
  expect(login.status).toBe(200);
  token = login.body.token;
  ownerId = (await db("users").where({ account_id: accountId, email: seed.ownerEmail }).first()).id;
  sourceId = (await db("order_sources").where({ account_id: accountId, code: "direct" }).first()).id;

  const categoryId = newId();
  productId = newId();
  await db("categories").insert({
    id: categoryId,
    account_id: accountId,
    name_ar: "F-01 accounting reversal",
    sort_order: 140,
    is_active: true,
  });
  await db("products").insert({
    id: productId,
    account_id: accountId,
    category_id: categoryId,
    name_ar: "F-01 payment item",
    base_price: 10,
    sort_order: 0,
    is_active: true,
  });

  locationId = (await db("inventory_locations")
    .where({ account_id: accountId, branch_id: branchId, is_default: true })
    .first()).id;
  const unitId = (await db("inventory_units").where({ account_id: accountId, symbol: "kg" }).first()).id;
  itemId = newId();
  await db("inventory_items").insert({
    id: itemId,
    account_id: accountId,
    base_unit_id: unitId,
    name_ar: "F-01 inventory item",
    sku: "F01-REVERSAL",
    reorder_level: "0",
    is_active: true,
  });
});

afterAll(async () => {
  await db.destroy();
});

describe("F-01 duplicate economic reversal gate", () => {
  it("creates one manual reversal for a fresh capture and replays the same id", async () => {
    const payment = await createPostedPayment();
    const first = await request(app)
      .post(`/api/v1/accounting/journals/${payment.entry.id}/reverse`)
      .set(auth())
      .send({ reason: "F-01 fresh capture correction" });
    const replay = await request(app)
      .post(`/api/v1/accounting/journals/${payment.entry.id}/reverse`)
      .set(auth())
      .send({ reason: "F-01 replay" });
    expect(first.status).toBe(201);
    expect(replay.status).toBe(201);
    expect(replay.body.data.id).toBe(first.body.data.id);
    expect(await db("journal_entries").where({ reversal_of_entry_id: payment.entry.id })).toHaveLength(1);

    const detail = await request(app)
      .get(`/api/v1/accounting/journals/${payment.entry.id}`)
      .set(auth());
    expect(detail.body.data.manual_reversal_allowed).toBe(false);
    expect(detail.body.data.manual_reversal_block_reason.code).toBe("manual_reversal_exists");
    expect(detail.body.data.economically_reversed_by.manual_journal_reversal.id).toBe(first.body.data.id);
  });

  it.each([
    { label: "partial", amount: 4, expectedMinor: "400" },
    { label: "full", amount: 10, expectedMinor: "1000" },
  ])("rejects manual reversal after a $label posted refund", async ({ amount, expectedMinor }) => {
    const payment = await createPostedPayment();
    const refund = await request(app)
      .post(`/api/v1/orders/${payment.orderId}/refund`)
      .set(auth())
      .send({ amount, reason: `F-01 ${amount} refund` });
    expect(refund.status).toBe(201);
    expect((await processPending(`f01-refund-${amount}`)).every((result) => result.status === "posted")).toBe(true);

    const reversal = await request(app)
      .post(`/api/v1/accounting/journals/${payment.entry.id}/reverse`)
      .set(auth())
      .send({ reason: "Must be blocked after refund" });
    expect(reversal.status).toBe(409);
    expect(reversal.body.message).toContain("مردود");
    expect(await db("journal_entries").where({ reversal_of_entry_id: payment.entry.id, event_type: "journal.reversal" })).toHaveLength(0);

    const detail = await request(app).get(`/api/v1/accounting/journals/${payment.entry.id}`).set(auth());
    expect(detail.body.data.manual_reversal_allowed).toBe(false);
    expect(detail.body.data.manual_reversal_block_reason.code).toBe("refund_posted");
    expect(detail.body.data.economically_reversed_by.posted_refunds.total_gross_minor).toBe(expectedMinor);
  });

  it("does not post a refund journal after a manual reversal already won", async () => {
    const payment = await createPostedPayment();
    const manual = await request(app)
      .post(`/api/v1/accounting/journals/${payment.entry.id}/reverse`)
      .set(auth())
      .send({ reason: "Manual correction wins first" });
    expect(manual.status).toBe(201);
    const refund = await request(app)
      .post(`/api/v1/orders/${payment.orderId}/refund`)
      .set(auth())
      .send({ amount: 10, reason: "Refund requested after manual correction" });
    expect(refund.status).toBe(201);
    const results = await processPending("f01-manual-before-refund");
    expect(results.some((result) => result.status === "failed")).toBe(true);
    const refundPaymentId = refund.body.data.allocations[0].refund_payment_id;
    expect(await db("journal_entries").where({ payment_id: refundPaymentId, event_type: "refund.posted" })).toHaveLength(0);
    expect(await db("journal_entries").where({ reversal_of_entry_id: payment.entry.id })).toHaveLength(1);
  });

  it("links an inventory reversal to its original journal and blocks a later manual reversal", async () => {
    const original = await createPostedInventoryReceipt();
    const reversal = await createInventoryReversal(original.movementId);
    const results = await processPending("f01-inventory-linked");
    expect(results.find((result) => result.eventId === reversal.event.id)?.status).toBe("posted");
    const reversalEntry = await db("journal_entries").where({ financial_event_id: reversal.event.id }).first();
    expect(reversalEntry.reversal_of_entry_id).toBe(original.entry.id);

    const manual = await request(app)
      .post(`/api/v1/accounting/journals/${original.entry.id}/reverse`)
      .set(auth())
      .send({ reason: "Must be blocked after inventory reversal" });
    expect(manual.status).toBe(409);
    expect(manual.body.message).toContain("مسار تشغيلي");
    expect(await db("journal_entries").where({ reversal_of_entry_id: original.entry.id })).toHaveLength(1);

    const detail = await request(app).get(`/api/v1/accounting/journals/${original.entry.id}`).set(auth());
    expect(detail.body.data.manual_reversal_block_reason.code).toBe("inventory_reversal_exists");
    expect(detail.body.data.economically_reversed_by.inventory_reversal.id).toBe(reversalEntry.id);
  });

  it("does not post an inventory reversal after a manual reversal already won", async () => {
    const original = await createPostedInventoryReceipt();
    const reversal = await createInventoryReversal(original.movementId);
    const manual = await request(app)
      .post(`/api/v1/accounting/journals/${original.entry.id}/reverse`)
      .set(auth())
      .send({ reason: "Manual inventory correction wins first" });
    expect(manual.status).toBe(201);
    const results = await processPending("f01-manual-before-inventory");
    expect(results.find((result) => result.eventId === reversal.event.id)?.status).toBe("failed");
    expect(await db("journal_entries").where({ financial_event_id: reversal.event.id })).toHaveLength(0);
    expect(await db("journal_entries").where({ reversal_of_entry_id: original.entry.id })).toHaveLength(1);
  });

  it("blocks manual reversal through historical inventory movement fallback without mutating history", async () => {
    const original = await createPostedInventoryReceipt();
    const historicalId = await insertHistoricalInventoryReversal(original);
    const historicalBefore = await db("journal_entries").where({ id: historicalId }).first();
    expect(historicalBefore.reversal_of_entry_id).toBeNull();

    const manual = await request(app)
      .post(`/api/v1/accounting/journals/${original.entry.id}/reverse`)
      .set(auth())
      .send({ reason: "Historical fallback must block" });
    expect(manual.status).toBe(409);
    const historicalAfter = await db("journal_entries").where({ id: historicalId }).first();
    expect(historicalAfter.reversal_of_entry_id).toBeNull();
    expect(await db("journal_entries").where({ reversal_of_entry_id: original.entry.id })).toHaveLength(0);

    const detail = await request(app).get(`/api/v1/accounting/journals/${original.entry.id}`).set(auth());
    expect(detail.body.data.manual_reversal_block_reason.code).toBe("inventory_reversal_exists");
    expect(detail.body.data.economically_reversed_by.inventory_reversal).toMatchObject({
      id: historicalId,
      linkage_mode: "inventory_movement_fallback",
    });
  });

  it("serializes concurrent manual and inventory reversals to one economic result", async () => {
    const original = await createPostedInventoryReceipt();
    const reversal = await createInventoryReversal(original.movementId);
    const workerId = `f01-race-${newId()}`;
    const claimed = await claimFinancialEvents(db, { workerId, limit: 100, accountId });
    expect(claimed.map((event) => event.id)).toContain(reversal.event.id);

    const [manualResult, inventoryResult] = await Promise.allSettled([
      reverseJournalEntry(db, {
        accountId,
        entryId: original.entry.id,
        reason: "Concurrent F-01 manual reversal",
        createdBy: ownerId,
      }),
      postClaimedFinancialEvent(db, { eventId: reversal.event.id, workerId, createdBy: ownerId }),
    ]);
    expect(inventoryResult.status).toBe("fulfilled");
    const inventoryPosted = inventoryResult.status === "fulfilled" && inventoryResult.value.status === "posted";
    const manualPosted = manualResult.status === "fulfilled";
    expect([inventoryPosted, manualPosted].filter(Boolean)).toHaveLength(1);
    const reversingEntries = await db("journal_entries")
      .where({ account_id: accountId, reversal_of_entry_id: original.entry.id });
    expect(reversingEntries).toHaveLength(1);
    expect(["inventory.reversal", "journal.reversal"]).toContain(reversingEntries[0].event_type);
  });
});
