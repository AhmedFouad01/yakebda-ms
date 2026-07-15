import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
import { config } from "../src/config";
import { makeKnex } from "../src/db/knex";
import { seedFoundation } from "../src/db/seedData";
import { newId } from "../src/lib/ids";
import {
  claimFinancialEvents,
  enqueueFinancialEvent,
  failFinancialEvent,
  recoverStaleFinancialEvents,
} from "../src/modules/financialOutbox";

const db = makeKnex(config.testDatabaseUrl);
let app: ReturnType<typeof createApp>;
let token = "";
let accountId = "";
let branchId = "";
let paymentOrderId = "";
let shiftId = "";
let cashMovementId = "";

const auth = () => ({ Authorization: `Bearer ${token}` });

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
  token = login.body.token;
  const order = await db("orders")
    .where({ account_id: accountId, branch_id: branchId })
    .whereNot("status", "cancelled")
    .whereNotExists(db("payments").select(1).whereRaw("payments.order_id = orders.id").whereNot("method", "unpaid"))
    .first();
  paymentOrderId = order.id;
  shiftId = (await db("shifts").where({ account_id: accountId, branch_id: branchId, status: "open" }).first()).id;
});

afterAll(async () => {
  await db.destroy();
});

describe("Durable financial event outbox", () => {
  it("captures payment, refund, cash, and stock events atomically", async () => {
    const order = await db("orders").where({ id: paymentOrderId }).first();
    const payment = await request(app)
      .post(`/api/v1/orders/${paymentOrderId}/payments`)
      .set(auth())
      .send({ method: "card", amount: Number(order.total) });
    expect(payment.status).toBe(201);
    const paymentEvent = await db("financial_events").where({ source_type: "payment", source_id: payment.body.data.id, event_type: "payment.captured" }).first();
    expect(paymentEvent.status).toBe("pending");
    const paymentPayload = typeof paymentEvent.payload === "string" ? JSON.parse(paymentEvent.payload) : paymentEvent.payload;
    expect(paymentPayload).toMatchObject({ payment_id: payment.body.data.id, order_id: paymentOrderId, total: String(order.total) });

    const refund = await request(app)
      .post(`/api/v1/orders/${paymentOrderId}/refund`)
      .set(auth())
      .send({ amount: Number(order.total), reason: "اختبار outbox للاسترداد" });
    expect(refund.status).toBe(201);
    const refundEvent = await db("financial_events").where({ event_type: "refund.posted" }).first();
    expect(refundEvent).toBeTruthy();

    const cash = await request(app)
      .post(`/api/v1/shifts/${shiftId}/cash-in`)
      .set(auth())
      .send({ amount: 25, reason: "عهدة outbox" });
    expect(cash.status).toBe(200);
    const cashEvent = await db("financial_events").where({ event_type: "cash.movement" }).orderBy("created_at", "desc").first();
    expect(cashEvent).toBeTruthy();
    cashMovementId = cashEvent.source_id;

    const location = await db("inventory_locations").where({ account_id: accountId, branch_id: branchId, is_default: true }).first();
    const unit = await db("inventory_units").where({ account_id: accountId, symbol: "kg" }).first();
    const item = await request(app)
      .post("/api/v1/inventory/items")
      .set(auth())
      .send({ name_ar: "صنف outbox", sku: "OUTBOX-ITEM", base_unit_id: unit.id, reorder_level: "0" });
    const supplier = await request(app)
      .post("/api/v1/inventory/suppliers")
      .set(auth())
      .send({ name_ar: "مورد outbox" });
    const receipt = await request(app)
      .post("/api/v1/inventory/purchase-receipts")
      .set(auth())
      .send({
        location_id: location.id,
        item_id: item.body.data.id,
        supplier_id: supplier.body.data.id,
        quantity: "2",
        unit_cost: "7.5",
        receipt_reference: "OUTBOX-R1",
        idempotency_key: "outbox-inventory-receipt",
      });
    expect(receipt.status).toBe(201);
    expect(await db("financial_events").where({ source_type: "stock_movement", source_id: receipt.body.data.id, event_type: "inventory.receipt" }).first()).toBeTruthy();
  });

  it("rolls back the event when its operational transaction rolls back", async () => {
    const key = "outbox-atomic-rollback";
    await expect(
      db.transaction(async (trx) => {
        await enqueueFinancialEvent(trx, {
          accountId,
          branchId,
          sourceType: "test",
          sourceId: "rollback-source",
          eventType: "test.rollback",
          idempotencyKey: key,
          payload: { value: "must not persist" },
        });
        throw new Error("force transaction rollback");
      })
    ).rejects.toThrow("force transaction rollback");
    expect(await db("financial_events").where({ account_id: accountId, idempotency_key: key })).toHaveLength(0);
  });

  it("deduplicates matching events and rejects key reuse for another event", async () => {
    const key = "outbox-idempotency-test";
    const ids = await db.transaction(async (trx) => {
      const first = await enqueueFinancialEvent(trx, {
        accountId,
        branchId,
        sourceType: "test",
        sourceId: "same-source",
        eventType: "test.same",
        idempotencyKey: key,
        payload: { version: 1 },
      });
      const second = await enqueueFinancialEvent(trx, {
        accountId,
        branchId,
        sourceType: "test",
        sourceId: "same-source",
        eventType: "test.same",
        idempotencyKey: key,
        payload: { version: 1 },
      });
      return [first, second];
    });
    expect(ids[0]).toBe(ids[1]);
    await expect(
      db.transaction((trx) =>
        enqueueFinancialEvent(trx, {
          accountId,
          branchId,
          sourceType: "test",
          sourceId: "different-source",
          eventType: "test.different",
          idempotencyKey: key,
          payload: { version: 1 },
        })
      )
    ).rejects.toMatchObject({ status: 409 });
  });

  it("claims concurrently without duplicate delivery and supports retry/dead state", async () => {
    await db("financial_events").where({ account_id: accountId }).update({ status: "posted", posted_at: db.fn.now() });
    const ids: string[] = [];
    for (let index = 0; index < 5; index += 1) {
      ids.push(
        await db.transaction((trx) =>
          enqueueFinancialEvent(trx, {
            accountId,
            branchId,
            sourceType: "claim-test",
            sourceId: `source-${index}`,
            eventType: "claim.test",
            idempotencyKey: `claim-test-${index}`,
            payload: { index },
          })
        )
      );
    }
    const [first, second] = await Promise.all([
      claimFinancialEvents(db, { workerId: "worker-a", limit: 3, accountId }),
      claimFinancialEvents(db, { workerId: "worker-b", limit: 3, accountId }),
    ]);
    const claimed = [...first, ...second];
    expect(claimed).toHaveLength(5);
    expect(new Set(claimed.map((event) => event.id)).size).toBe(5);

    const retryTarget = first[0];
    expect((await failFinancialEvent(db, { eventId: retryTarget.id, workerId: retryTarget.claimed_by, error: "temporary", maxAttempts: 5 })).status).toBe("failed");
    const retried = await claimFinancialEvents(db, { workerId: "worker-retry", limit: 1, accountId });
    expect(retried[0].id).toBe(retryTarget.id);
    expect((await failFinancialEvent(db, { eventId: retryTarget.id, workerId: "worker-retry", error: "terminal", maxAttempts: 2 })).status).toBe("dead");
  });

  it("recovers stale claims and preserves source snapshots after source mutation", async () => {
    const event = await db("financial_events").where({ source_type: "shift_cash_movement", source_id: cashMovementId }).first();
    const originalPayload = typeof event.payload === "string" ? JSON.parse(event.payload) : event.payload;
    await db("shift_cash_movements").where({ id: cashMovementId }).update({ reason: "source changed after event" });
    const unchanged = await db("financial_events").where({ id: event.id }).first();
    const unchangedPayload = typeof unchanged.payload === "string" ? JSON.parse(unchanged.payload) : unchanged.payload;
    expect(unchangedPayload).toEqual(originalPayload);

    const stale = await db("financial_events").where({ status: "processing" }).first();
    await db("financial_events").where({ id: stale.id }).update({ claimed_at: new Date(Date.now() - 60_000) });
    expect(await recoverStaleFinancialEvents(db, new Date(Date.now() - 30_000))).toBeGreaterThanOrEqual(1);
    expect((await db("financial_events").where({ id: stale.id }).first()).status).toBe("failed");
  });

  it("keeps financial event reads isolated by account", async () => {
    const foreignAccountId = newId();
    await db("accounts").insert({ id: foreignAccountId, name: "حساب outbox أجنبي" });
    await db.transaction((trx) =>
      enqueueFinancialEvent(trx, {
        accountId: foreignAccountId,
        sourceType: "foreign",
        sourceId: "foreign-source",
        eventType: "foreign.event",
        idempotencyKey: "foreign-event-key",
        payload: { private: "foreign" },
      })
    );
    const response = await request(app).get("/api/v1/accounting/financial-events").set(auth());
    expect(response.status).toBe(200);
    expect(response.body.data.some((event: { account_id: string }) => event.account_id === foreignAccountId)).toBe(false);
  });
});
