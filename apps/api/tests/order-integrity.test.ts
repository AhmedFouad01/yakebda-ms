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
let productA = "";
let productB = "";
let requiredModifierA = "";
let requiredModifierB = "";
let foreignModifier = "";

const auth = () => ({ Authorization: `Bearer ${ownerToken}` });

async function createOrder(modifierIds: string[]) {
  return request(app)
    .post("/api/v1/orders")
    .set(auth())
    .send({
      branch_id: branchId,
      order_type: "takeaway",
      payment_method: "unpaid",
      items: [{ product_id: productA, qty: 1, modifier_ids: modifierIds }],
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
  productA = newId();
  productB = newId();
  await db("categories").insert({
    id: categoryId,
    account_id: seed.accountId,
    name_ar: "سلامة الطلبات",
    sort_order: 0,
    is_active: true,
  });
  await db("products").insert([
    {
      id: productA,
      account_id: seed.accountId,
      category_id: categoryId,
      name_ar: "منتج أ",
      base_price: 30,
      sort_order: 0,
      is_active: true,
    },
    {
      id: productB,
      account_id: seed.accountId,
      category_id: categoryId,
      name_ar: "منتج ب",
      base_price: 40,
      sort_order: 1,
      is_active: true,
    },
  ]);

  const requiredGroup = newId();
  const foreignGroup = newId();
  requiredModifierA = newId();
  requiredModifierB = newId();
  foreignModifier = newId();

  await db("modifier_groups").insert([
    {
      id: requiredGroup,
      account_id: seed.accountId,
      name_ar: "اختيار إجباري",
      min_select: 1,
      max_select: 1,
      is_required: true,
      sort_order: 0,
      is_active: true,
    },
    {
      id: foreignGroup,
      account_id: seed.accountId,
      name_ar: "مجموعة منتج آخر",
      min_select: 0,
      max_select: 1,
      is_required: false,
      sort_order: 1,
      is_active: true,
    },
  ]);
  await db("modifiers").insert([
    {
      id: requiredModifierA,
      modifier_group_id: requiredGroup,
      name_ar: "اختيار 1",
      price_delta: 2,
      is_active: true,
    },
    {
      id: requiredModifierB,
      modifier_group_id: requiredGroup,
      name_ar: "اختيار 2",
      price_delta: 3,
      is_active: true,
    },
    {
      id: foreignModifier,
      modifier_group_id: foreignGroup,
      name_ar: "إضافة أجنبية",
      price_delta: 5,
      is_active: true,
    },
  ]);
  await db("product_modifier_groups").insert([
    { product_id: productA, modifier_group_id: requiredGroup, sort_order: 0 },
    { product_id: productB, modifier_group_id: foreignGroup, sort_order: 0 },
  ]);
});

afterAll(async () => {
  await db.destroy();
});

describe("Order configuration integrity", () => {
  it("rejects an order missing a required modifier group", async () => {
    const res = await createOrder([]);
    expect(res.status).toBe(422);
    expect(res.body.details.modifier_ids).toContain("يجب اختيار");
  });

  it("rejects a modifier that belongs to another product", async () => {
    const res = await createOrder([foreignModifier]);
    expect(res.status).toBe(422);
    expect(res.body.details.modifier_ids).toContain("لا يتبع الصنف");
  });

  it("rejects selecting more modifiers than max_select", async () => {
    const res = await createOrder([requiredModifierA, requiredModifierB]);
    expect(res.status).toBe(422);
    expect(res.body.details.modifier_ids).toContain("الحد الأقصى");
  });

  it("rejects selecting the same modifier more than once", async () => {
    const res = await createOrder([requiredModifierA, requiredModifierA]);
    expect(res.status).toBe(422);
    expect(res.body.details.modifier_ids).toContain("تكرار نفس الإضافة");
  });

  it("accepts a valid required selection", async () => {
    const res = await createOrder([requiredModifierA]);
    expect(res.status).toBe(201);
    expect(Number(res.body.data.total)).toBe(32);
  });
});
