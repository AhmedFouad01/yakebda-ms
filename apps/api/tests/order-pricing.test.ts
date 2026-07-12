import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
import { config } from "../src/config";
import { makeKnex } from "../src/db/knex";
import { seedFoundation } from "../src/db/seedData";
import { newId } from "../src/lib/ids";

const db = makeKnex(config.testDatabaseUrl);
let app: ReturnType<typeof createApp>;
let ownerToken = "";
let branchId = "";
let productId = "";
let variantId = "";
let modifierId = "";

const auth = () => ({ Authorization: `Bearer ${ownerToken}` });

function payload(extra: Record<string, unknown> = {}) {
  return {
    branch_id: branchId,
    order_type: "takeaway",
    delivery_fee: 0,
    discount: 5,
    items: [
      {
        product_id: productId,
        variant_id: variantId,
        modifier_ids: [modifierId],
        qty: 2,
        unit_price: 1,
      },
    ],
    ...extra,
  };
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
  ownerToken = login.body.token;

  const categoryId = newId();
  productId = newId();
  variantId = newId();
  const groupId = newId();
  modifierId = newId();

  await db("categories").insert({
    id: categoryId,
    account_id: seed.accountId,
    name_ar: "اختبار التسعير",
    sort_order: 50,
    is_active: true,
  });
  await db("products").insert({
    id: productId,
    account_id: seed.accountId,
    category_id: categoryId,
    name_ar: "منتج تسعير",
    base_price: 30,
    sort_order: 0,
    is_active: true,
  });
  await db("product_variants").insert({
    id: variantId,
    product_id: productId,
    name_ar: "كبير",
    price_delta: 10,
    is_active: true,
  });
  await db("modifier_groups").insert({
    id: groupId,
    account_id: seed.accountId,
    name_ar: "إضافات التسعير",
    min_select: 0,
    max_select: 2,
    is_required: false,
    sort_order: 0,
    is_active: true,
  });
  await db("modifiers").insert({
    id: modifierId,
    modifier_group_id: groupId,
    name_ar: "إضافة",
    price_delta: 5,
    is_active: true,
  });
  await db("product_modifier_groups").insert({
    product_id: productId,
    modifier_group_id: groupId,
    sort_order: 0,
  });
});

afterAll(async () => {
  await db.destroy();
});

describe("Order pricing source", () => {
  it("calculates quote prices from database state and ignores client price fields", async () => {
    const res = await request(app)
      .post("/api/v1/orders/quote")
      .set(auth())
      .send(payload());

    expect(res.status).toBe(200);
    expect(res.body.data.items[0].unit_price).toBe(45);
    expect(res.body.data.items[0].line_total).toBe(90);
    expect(res.body.data.subtotal).toBe(90);
    expect(res.body.data.discount).toBe(5);
    expect(res.body.data.total).toBe(85);
  });

  it("matches the persisted order totals for the same request", async () => {
    const quote = await request(app)
      .post("/api/v1/orders/quote")
      .set(auth())
      .send(payload());
    const created = await request(app)
      .post("/api/v1/orders")
      .set(auth())
      .send(payload());

    expect(quote.status).toBe(200);
    expect(created.status).toBe(201);
    expect(Number(created.body.data.subtotal)).toBe(quote.body.data.subtotal);
    expect(Number(created.body.data.discount)).toBe(quote.body.data.discount);
    expect(Number(created.body.data.total)).toBe(quote.body.data.total);
  });

  it("uses branch price overrides", async () => {
    await db("branch_product_prices").insert({
      branch_id: branchId,
      product_id: productId,
      price_override: 50,
    });

    const res = await request(app)
      .post("/api/v1/orders/quote")
      .set(auth())
      .send(payload({ discount: 0 }));

    expect(res.status).toBe(200);
    expect(res.body.data.items[0].unit_price).toBe(65);
    expect(res.body.data.total).toBe(130);

    await db("branch_product_prices").where({ branch_id: branchId, product_id: productId }).del();
  });

  it("rejects unavailable products with the same operational rule", async () => {
    await db("branch_product_availability").insert({
      branch_id: branchId,
      product_id: productId,
      is_available: false,
    });

    const res = await request(app)
      .post("/api/v1/orders/quote")
      .set(auth())
      .send(payload());

    expect(res.status).toBe(422);
    await db("branch_product_availability").where({ branch_id: branchId, product_id: productId }).del();
  });

  it("queues a receipt when create-order captures payment and auto-print is enabled", async () => {
    const settingsResponse = await request(app)
      .patch(`/api/v1/settings?branch_id=${branchId}`)
      .set(auth())
      .send({ auto_print_on_payment: true, receipt_printing_enabled: true });
    expect(settingsResponse.status).toBe(200);

    await db("hardware_endpoints").insert({
      id: newId(),
      branch_id: branchId,
      name: "طابعة إيصال اختبارية",
      kind: "receipt_printer",
      connection: "windows_driver",
      protocol: "windows_driver",
      address: "TEST-RECEIPT",
      is_active: true,
    });

    const [{ count: before }] = await db("print_jobs").where({ type: "receipt" }).count("id as count");
    const created = await request(app)
      .post("/api/v1/orders")
      .set(auth())
      .send(payload({ discount: 0, payment_method: "card" }));
    const [{ count: after }] = await db("print_jobs").where({ type: "receipt" }).count("id as count");

    expect(created.status).toBe(201);
    expect(Number(after)).toBe(Number(before) + 1);
    const job = await db("print_jobs").where({ type: "receipt" }).orderBy("created_at", "desc").first();
    expect(job.status).toBe("pending");
const printPayload =
  typeof job.payload === "string" ? JSON.parse(job.payload) : job.payload;

expect(printPayload.template).toBe("receipt_v1");

expect(printPayload.lines).toEqual(
  expect.arrayContaining([
    expect.stringContaining(`طلب رقم: ${created.body.data.order_no}`),
  ])
); });

});
