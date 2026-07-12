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

const auth = () => ({ Authorization: `Bearer ${ownerToken}` });

async function createOrder() {
  return request(app)
    .post("/api/v1/orders")
    .set(auth())
    .send({
      branch_id: branchId,
      order_type: "takeaway",
      payment_method: "unpaid",
      items: [{ product_id: productId, qty: 1, modifier_ids: [] }],
    });
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
  await db("categories").insert({
    id: categoryId,
    account_id: seed.accountId,
    name_ar: "اختبار الترقيم",
    sort_order: 99,
    is_active: true,
  });
  await db("products").insert({
    id: productId,
    account_id: seed.accountId,
    category_id: categoryId,
    name_ar: "صنف ترقيم مستقل",
    base_price: 10,
    sort_order: 0,
    is_active: true,
  });
});

afterAll(async () => {
  await db.destroy();
});

describe("Atomic order numbering", () => {
  it("assigns unique sequential numbers to concurrent orders in one branch", async () => {
    const responses = await Promise.all(
      Array.from({ length: 8 }, () => createOrder())
    );

    expect(responses.map((res) => res.status)).toEqual(Array(8).fill(201));
    const numbers = responses.map((res) => Number(res.body.data.order_no));
    expect(new Set(numbers).size).toBe(numbers.length);

    const sorted = [...numbers].sort((a, b) => a - b);
    for (let index = 1; index < sorted.length; index += 1) {
      expect(sorted[index]).toBe(sorted[index - 1] + 1);
    }
  });
});
