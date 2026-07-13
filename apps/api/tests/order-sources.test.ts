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
let productId = "";
let directSourceId = "";
let sourceId = "";

const auth = () => ({ Authorization: "Bearer " + token });

function orderPayload(extra: Record<string, unknown> = {}) {
  return {
    branch_id: branchId,
    source_id: sourceId,
    order_type: "takeaway",
    delivery_fee: 0,
    discount: 0,
    items: [{ product_id: productId, qty: 1, modifier_ids: [] }],
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
  token = login.body.token;

  const categoryId = newId();
  productId = newId();
  await db("categories").insert({
    id: categoryId,
    account_id: seed.accountId,
    name_ar: "مصادر الاختبار",
    sort_order: 80,
    is_active: true,
  });
  await db("products").insert({
    id: productId,
    account_id: seed.accountId,
    category_id: categoryId,
    name_ar: "صنف مصدر",
    base_price: 30,
    sort_order: 0,
    is_active: true,
  });

  const sources = await request(app).get("/api/v1/order-sources?active_only=false").set(auth());
  directSourceId = sources.body.data.find((source: { code: string }) => source.code === "direct").id;

  const created = await request(app)
    .post("/api/v1/order-sources")
    .set(auth())
    .send({
      name_ar: "طلبات الهاتف",
      supports_takeaway: true,
      supports_delivery: false,
      is_active: true,
      sort_order: 1,
      copy_from_source_id: directSourceId,
    });
  expect(created.status).toBe(201);
  sourceId = created.body.data.id;
});

afterAll(async () => {
  await db.destroy();
});

describe("Order sources and source price lists", () => {
  it("creates and lists sources scoped to the account", async () => {
    const response = await request(app)
      .get("/api/v1/order-sources?active_only=false")
      .set(auth());

    expect(response.status).toBe(200);
    expect(response.body.data.map((source: { name_ar: string }) => source.name_ar)).toEqual(
      expect.arrayContaining(["طلب مباشر", "طلبات الهاتف"])
    );
  });

  it("uses source price override in branch menu and quote", async () => {
    const update = await request(app)
      .put("/api/v1/order-sources/" + sourceId + "/menu")
      .set(auth())
      .send({
        items: [{ product_id: productId, price_override: 44, is_available: true }],
      });
    expect(update.status).toBe(200);

    const menu = await request(app)
      .get("/api/v1/branches/" + branchId + "/menu?source_id=" + sourceId)
      .set(auth());
    const product = menu.body.data.categories
      .flatMap((category: { products: unknown[] }) => category.products)
      .find((row: { id: string }) => row.id === productId);
    expect(product.effective_price).toBe(44);

    const quote = await request(app)
      .post("/api/v1/orders/quote")
      .set(auth())
      .send(orderPayload());
    expect(quote.status).toBe(200);
    expect(quote.body.data.items[0].unit_price).toBe(44);
    expect(quote.body.data.source.name_ar).toBe("طلبات الهاتف");
  });

  it("rejects a source that does not support the order type", async () => {
    const response = await request(app)
      .post("/api/v1/orders/quote")
      .set(auth())
      .send(orderPayload({ order_type: "delivery" }));

    expect(response.status).toBe(422);
  });

  it("stores source snapshot on the created order", async () => {
    const response = await request(app)
      .post("/api/v1/orders")
      .set(auth())
      .send(orderPayload({ submit: true, payment_method: "unpaid" }));

    expect(response.status).toBe(201);
    expect(response.body.data.source_id).toBe(sourceId);
    expect(response.body.data.source_name).toBe("طلبات الهاتف");
    expect(response.body.data.source_name_snapshot).toBe("طلبات الهاتف");
  });

  it("keeps API compatibility by mapping a missing source to direct", async () => {
    const response = await request(app)
      .post("/api/v1/orders/quote")
      .set(auth())
      .send(orderPayload({ source_id: undefined }));

    expect(response.status).toBe(200);
    expect(response.body.data.source.id).toBe(directSourceId);
  });
});
