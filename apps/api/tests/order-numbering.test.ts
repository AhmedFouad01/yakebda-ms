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
let productId = "";

const auth = () => ({ Authorization: `Bearer ${ownerToken}` });

async function createOrder(targetBranchId = branchId) {
  return request(app)
    .post("/api/v1/orders")
    .set(auth())
    .send({
      branch_id: targetBranchId,
      order_type: "takeaway",
      payment_method: "unpaid",
      items: [{ product_id: productId, qty: 1, modifier_ids: [] }],
    });
}

function expectUniqueSequentialNumbers(responses: Array<{ status: number; body: any }>) {
  expect(responses.map((res) => res.status)).toEqual(Array(responses.length).fill(201));
  const numbers = responses.map((res) => Number(res.body.data.order_no));
  expect(new Set(numbers).size).toBe(numbers.length);

  const sorted = [...numbers].sort((a, b) => a - b);
  for (let index = 1; index < sorted.length; index += 1) {
    expect(sorted[index]).toBe(sorted[index - 1] + 1);
  }
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
  it("keeps the database advisory-lock allocator installed", async () => {
    const result = await db.raw(`
      select
        pg_get_triggerdef(t.oid) as trigger_def,
        pg_get_functiondef(p.oid) as function_def
      from pg_trigger t
      join pg_proc p on p.oid = t.tgfoid
      where t.tgname = 'orders_assign_number_before_insert'
        and not t.tgisinternal
    `);

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].trigger_def).toContain("BEFORE INSERT");
    expect(result.rows[0].function_def).toContain("pg_advisory_xact_lock");
    expect(result.rows[0].function_def).toContain("v_numbering_key");
  });

  it("assigns unique sequential numbers to concurrent orders in one branch", async () => {
    const responses = await Promise.all(
      Array.from({ length: 8 }, () => createOrder())
    );

    expectUniqueSequentialNumbers(responses);
    expect(new Set(responses.map((res) => res.body.data.numbering_key)).size).toBe(1);
    expect(responses[0].body.data.numbering_key).toBe(`branch:${branchId}:continuous`);
  });

  it("assigns one account-wide sequence across concurrent orders in two branches", async () => {
    const settings = await request(app)
      .patch("/api/v1/settings")
      .set(auth())
      .send({ branch_specific_numbering: false });
    expect(settings.status).toBe(200);

    const responses = await Promise.all(
      Array.from({ length: 8 }, (_, index) => createOrder(index % 2 === 0 ? branchId : branch2Id))
    );

    expectUniqueSequentialNumbers(responses);
    expect(new Set(responses.map((res) => res.body.data.numbering_key)).size).toBe(1);
    expect(responses[0].body.data.numbering_key).toBe(`account:${accountId}:continuous`);
  });
});
