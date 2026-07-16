import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
import { config } from "../src/config";
import { makeKnex } from "../src/db/knex";
import { seedFoundation } from "../src/db/seedData";
import { newId } from "../src/lib/ids";
import { claimFinancialEvents } from "../src/modules/financialOutbox";
import { postClaimedFinancialEvent } from "../src/modules/accountingLedger";

const db = makeKnex(config.testDatabaseUrl);
let app: ReturnType<typeof createApp>;
let token = "";
let accountId = "";
let branchId = "";
let sourceId = "";
let productId = "";

const auth = () => ({ Authorization: `Bearer ${token}` });

async function createOrder(total: string, vat: string) {
  const response = await request(app)
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
  expect(response.status).toBe(201);
  await db("orders").where({ id: response.body.data.id }).update({ subtotal: total, vat_amount: vat, total });
  return response.body.data.id as string;
}

function pay(orderId: string, method: "card" | "wallet", amount: number, idempotencyKey: string) {
  return request(app)
    .post(`/api/v1/orders/${orderId}/payments`)
    .set(auth())
    .send({ method, amount, idempotency_key: idempotencyKey });
}

async function postPendingWithIndependentWorkers() {
  const pending = await db("financial_events").where({ account_id: accountId, status: "pending" }).count<{ count: string }>("id as count").first();
  const count = Number(pending?.count ?? 0);
  const claims = await Promise.all(
    Array.from({ length: count }, (_, index) =>
      claimFinancialEvents(db, { workerId: `p0-payment-worker-${index}`, limit: 1, accountId })
    )
  );
  const events = claims.flat();
  expect(events).toHaveLength(count);
  return Promise.all(
    events.map((event, index) =>
      postClaimedFinancialEvent(db, { eventId: event.id, workerId: `p0-payment-worker-${index}` })
    )
  );
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
  token = login.body.token;
  sourceId = (await db("order_sources").where({ account_id: accountId, code: "direct" }).first()).id;
  const categoryId = newId();
  productId = newId();
  await db("categories").insert({ id: categoryId, account_id: accountId, name_ar: "P0 payment concurrency", sort_order: 120, is_active: true });
  await db("products").insert({ id: productId, account_id: accountId, category_id: categoryId, name_ar: "P0 payment item", base_price: 10, sort_order: 0, is_active: true });
});

afterAll(async () => {
  await db.destroy();
});

describe("P0 concurrent payment allocation", () => {
  it("preserves exact VAT and revenue across concurrent multi-tender workers", async () => {
    const orderId = await createOrder("0.03", "0.01");
    const responses = await Promise.all([
      pay(orderId, "card", 0.01, "p0-multi-a"),
      pay(orderId, "wallet", 0.01, "p0-multi-b"),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([201, 201]);
    expect((await pay(orderId, "card", 0.01, "p0-multi-c")).status).toBe(201);

    const events = await db("financial_events as event")
      .joinRaw("join payments as payment on payment.id::text = event.source_id")
      .where({ "payment.order_id": orderId, "event.event_type": "payment.captured" })
      .select("event.payload");
    expect(events).toHaveLength(3);
    const allocations = events.map((event) => typeof event.payload === "string" ? JSON.parse(event.payload) : event.payload);
    expect(allocations.reduce((sum, payload) => sum + Number(payload.accounting_gross_minor), 0)).toBe(3);
    expect(allocations.reduce((sum, payload) => sum + Number(payload.accounting_revenue_minor), 0)).toBe(2);
    expect(allocations.reduce((sum, payload) => sum + Number(payload.accounting_vat_minor), 0)).toBe(1);

    const posted = await postPendingWithIndependentWorkers();
    expect(posted.every((result) => result.status === "posted")).toBe(true);
    const entries = await db("journal_entries").where({ account_id: accountId, order_id: orderId, event_type: "payment.captured" });
    const lines = await db("journal_lines").whereIn("entry_id", entries.map((entry) => entry.id));
    expect(lines.filter((line) => line.component === "tender").reduce((sum, line) => sum + Number(line.debit), 0)).toBeCloseTo(0.03, 2);
    expect(lines.filter((line) => line.component === "revenue").reduce((sum, line) => sum + Number(line.credit), 0)).toBeCloseTo(0.02, 2);
    expect(lines.filter((line) => line.component === "vat").reduce((sum, line) => sum + Number(line.credit), 0)).toBeCloseTo(0.01, 2);
  });

  it("serializes two partial payments that exactly complete the order", async () => {
    const orderId = await createOrder("10.00", "1.40");
    const responses = await Promise.all([
      pay(orderId, "card", 6, "p0-complete-a"),
      pay(orderId, "wallet", 4, "p0-complete-b"),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([201, 201]);
    const paid = await db("payments").where({ order_id: orderId }).whereNot("method", "unpaid").sum<{ total: string }>("amount as total").first();
    expect(Number(paid?.total)).toBe(10);
    await postPendingWithIndependentWorkers();
  });

  it("rejects the concurrent payment that would overpay the order", async () => {
    const orderId = await createOrder("10.00", "1.40");
    const responses = await Promise.all([
      pay(orderId, "card", 6, "p0-over-a"),
      pay(orderId, "wallet", 6, "p0-over-b"),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([201, 422]);
    const paid = await db("payments").where({ order_id: orderId }).whereNot("method", "unpaid").sum<{ total: string }>("amount as total").first();
    expect(Number(paid?.total)).toBe(6);
    expect(await db("financial_events as event").joinRaw("join payments as payment on payment.id::text = event.source_id").where({ "payment.order_id": orderId })).toHaveLength(1);
    await postPendingWithIndependentWorkers();
  });

  it("replays one idempotency key without another payment or event", async () => {
    const orderId = await createOrder("10.00", "1.40");
    const first = await pay(orderId, "card", 4, "p0-payment-retry");
    const replay = await pay(orderId, "card", 4, "p0-payment-retry");
    expect(first.status).toBe(201);
    expect(replay.status).toBe(200);
    expect(replay.body.data.id).toBe(first.body.data.id);
    expect(await db("payments").where({ order_id: orderId, idempotency_key: "p0-payment-retry" })).toHaveLength(1);
    expect(await db("financial_events").where({ source_type: "payment", source_id: first.body.data.id })).toHaveLength(1);
    await postPendingWithIndependentWorkers();
  });
});
