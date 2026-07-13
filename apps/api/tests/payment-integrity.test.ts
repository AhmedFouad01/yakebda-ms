import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
import { config } from "../src/config";
import { makeKnex } from "../src/db/knex";
import { seedFoundation } from "../src/db/seedData";
import { newId } from "../src/lib/ids";

const db = makeKnex(config.testDatabaseUrl);
let app: ReturnType<typeof createApp>;
let token = "";
let branchId = "";
let sourceId = "";
let productId = "";

const auth = () => ({ Authorization: `Bearer ${token}` });

async function createOrder() {
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
  return response.body.data as { id: string; total: string | number };
}

function pay(orderId: string, amount: number, method: "cash" | "card" | "wallet" | "unpaid" = "card") {
  return request(app)
    .post(`/api/v1/orders/${orderId}/payments`)
    .set(auth())
    .send({ method, amount });
}

beforeAll(async () => {
  await db.migrate.rollback(undefined, true);
  await db.migrate.latest();
  const seed = await seedFoundation(db);
  branchId = seed.branchId;
  app = createApp(db);

  const login = await request(app)
    .post("/api/v1/auth/login")
    .send({ email: seed.ownerEmail, password: seed.ownerPassword });
  token = login.body.token;

  sourceId = (await db("order_sources")
    .where({ account_id: seed.accountId, code: "direct" })
    .first()).id;

  const categoryId = newId();
  productId = newId();
  await db("categories").insert({
    id: categoryId,
    account_id: seed.accountId,
    name_ar: "سلامة المدفوعات",
    sort_order: 95,
    is_active: true,
  });
  await db("products").insert({
    id: productId,
    account_id: seed.accountId,
    category_id: categoryId,
    name_ar: "صنف اختبار الدفع",
    base_price: 30,
    sort_order: 0,
    is_active: true,
  });
});

afterAll(async () => {
  await db.destroy();
});

describe("Payment record-time integrity", () => {
  it("accepts exact payment and rejects a duplicate payment", async () => {
    const order = await createOrder();
    const total = Number(order.total);
    expect((await pay(order.id, total)).status).toBe(201);

    const duplicate = await pay(order.id, total);
    expect(duplicate.status).toBe(422);
    expect(duplicate.body.details.amount).toContain("مدفوع بالكامل");
  });

  it("rejects zero and overpayment", async () => {
    const zeroOrder = await createOrder();
    const zero = await pay(zeroOrder.id, 0);
    expect(zero.status).toBe(422);
    expect(zero.body.details.amount).toContain("أكبر من صفر");

    const overOrder = await createOrder();
    const over = await pay(overOrder.id, Number(overOrder.total) + 1);
    expect(over.status).toBe(422);
    expect(over.body.details.amount).toContain("المتبقّي");
  });

  it("supports partial then exact completion", async () => {
    const order = await createOrder();
    const total = Number(order.total);
    expect((await pay(order.id, 10)).status).toBe(201);
    expect((await pay(order.id, total - 10)).status).toBe(201);
    expect((await pay(order.id, 1)).status).toBe(422);
  });

  it("serializes concurrent full-payment attempts", async () => {
    const order = await createOrder();
    const total = Number(order.total);
    const responses = await Promise.all([pay(order.id, total), pay(order.id, total)]);
    expect(responses.map((response) => response.status).sort()).toEqual([201, 422]);

    const [{ paid }] = await db("payments")
      .where({ order_id: order.id })
      .whereNot("method", "unpaid")
      .sum("amount as paid");
    expect(Number(paid)).toBe(total);
  });

  it("rejects a non-zero unpaid marker", async () => {
    const order = await createOrder();
    const response = await pay(order.id, 1, "unpaid");
    expect(response.status).toBe(422);
    expect(response.body.details.amount).toContain("صفر");
  });
});
