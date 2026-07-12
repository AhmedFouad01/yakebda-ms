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
let accountId = "";
let branchId = "";
let branch2Id = "";
let productA = "";
let productB = "";
let requiredModifierA = "";
let requiredModifierB = "";
let foreignModifier = "";

const auth = () => ({ Authorization: `Bearer ${ownerToken}` });

async function createOrder(
  targetBranchId: string,
  modifierIds: string[],
  productId = productA
) {
  return request(app)
    .post("/api/v1/orders")
    .set(auth())
    .send({
      branch_id: targetBranchId,
      order_type: "takeaway",
      payment_method: "unpaid",
      items: [{ product_id: productId, qty: 1, modifier_ids: modifierIds }],
    });
}

beforeAll(async () => {
  await db.migrate.rollback(undefined, true);
  await db.migrate.latest();
  const seed = await seedFoundation(db);
  accountId = seed.accountId;
  branchId = seed.branchId;
  branch2Id = seed.branch2Id!;
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
    account_id: accountId,
    name_ar: "سلامة الطلبات",
    sort_order: 0,
    is_active: true,
  });
  await db("products").insert([
    {
      id: productA,
      account_id: accountId,
      category_id: categoryId,
      name_ar: "منتج أ",
      base_price: 30,
      sort_order: 0,
      is_active: true,
    },
    {
      id: productB,
      account_id: accountId,
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
      account_id: accountId,
      name_ar: "اختيار إجباري",
      min_select: 1,
      max_select: 1,
      is_required: true,
      sort_order: 0,
      is_active: true,
    },
    {
      id: foreignGroup,
      account_id: accountId,
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
    const res = await createOrder(branchId, []);
    expect(res.status).toBe(422);
    expect(res.body.details.order_configuration).toBe("order_item_modifier_min_select_check");
  });

  it("rejects a modifier that belongs to another product", async () => {
    const res = await createOrder(branchId, [foreignModifier]);
    expect(res.status).toBe(422);
    expect(res.body.details.order_configuration).toBe("order_item_modifier_product_check");
  });

  it("rejects selecting more modifiers than max_select", async () => {
    const res = await createOrder(branchId, [requiredModifierA, requiredModifierB]);
    expect(res.status).toBe(422);
    expect(res.body.details.order_configuration).toBe("order_item_modifier_max_select_check");
  });

  it("rejects selecting the same modifier more than once", async () => {
    const res = await createOrder(branchId, [requiredModifierA, requiredModifierA]);
    expect(res.status).toBe(422);
    expect(res.body.details.order_configuration).toBe("order_item_modifier_duplicate_check");
  });

  it("accepts a valid required selection", async () => {
    const res = await createOrder(branchId, [requiredModifierA]);
    expect(res.status).toBe(201);
    expect(Number(res.body.data.total)).toBe(32);
  });
});

describe("Atomic order numbering", () => {
  it("assigns unique sequential numbers to concurrent orders in one branch", async () => {
    const responses = await Promise.all(
      Array.from({ length: 8 }, () => createOrder(branchId, [requiredModifierA]))
    );

    expect(responses.every((res) => res.status === 201)).toBe(true);
    const numbers = responses.map((res) => Number(res.body.data.order_no));
    expect(new Set(numbers).size).toBe(numbers.length);

    const sorted = [...numbers].sort((a, b) => a - b);
    for (let index = 1; index < sorted.length; index += 1) {
      expect(sorted[index]).toBe(sorted[index - 1] + 1);
    }
  });

  it("serializes account-wide numbering across different branches", async () => {
    await request(app)
      .patch("/api/v1/settings")
      .set(auth())
      .send({ branch_specific_numbering: false });

    const [first, second] = await Promise.all([
      createOrder(branchId, [requiredModifierA]),
      createOrder(branch2Id, [requiredModifierA]),
    ]);

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(first.body.data.order_no).not.toBe(second.body.data.order_no);

    const rows = await db("orders")
      .whereIn("id", [first.body.data.id, second.body.data.id])
      .select("numbering_key", "order_no");
    expect(rows).toHaveLength(2);
    expect(rows[0].numbering_key).toBe(rows[1].numbering_key);
    expect(rows[0].numbering_key).toBe(`account:${accountId}:continuous`);
  });
});
