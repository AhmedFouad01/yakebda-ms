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
let modifierId = "";

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
  const groupId = newId();
  productId = newId();
  modifierId = newId();

  await db("categories").insert({
    id: categoryId,
    account_id: seed.accountId,
    name_ar: "سلامة الطلبات",
    sort_order: 0,
    is_active: true,
  });
  await db("products").insert({
    id: productId,
    account_id: seed.accountId,
    category_id: categoryId,
    name_ar: "منتج سليم",
    base_price: 30,
    sort_order: 0,
    is_active: true,
  });
  await db("modifier_groups").insert({
    id: groupId,
    account_id: seed.accountId,
    name_ar: "اختيار إجباري",
    min_select: 1,
    max_select: 1,
    is_required: true,
    sort_order: 0,
    is_active: true,
  });
  await db("modifiers").insert({
    id: modifierId,
    modifier_group_id: groupId,
    name_ar: "اختيار صالح",
    price_delta: 2,
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

describe("Order configuration integrity", () => {
  it("accepts a valid required selection", async () => {
    const res = await request(app)
      .post("/api/v1/orders")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({
        branch_id: branchId,
        order_type: "takeaway",
        payment_method: "unpaid",
        items: [{ product_id: productId, qty: 1, modifier_ids: [modifierId] }],
      });

    expect(res.status).toBe(201);
    expect(Number(res.body.data.total)).toBe(32);
  });
});
