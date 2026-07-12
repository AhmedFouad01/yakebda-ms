import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
import { config } from "../src/config";
import { makeKnex } from "../src/db/knex";
import { seedFoundation } from "../src/db/seedData";

const db = makeKnex(config.testDatabaseUrl);
let app: ReturnType<typeof createApp>;
let ownerToken = "";
let accountId = "";
let branchId = "";
let branch2Id = "";
let productId = "";

const auth = () => ({ Authorization: `Bearer ${ownerToken}` });

async function createOrder(targetBranchId: string) {
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

  const pepsi = await db("products").where({ account_id: accountId, name_ar: "بيبسي" }).first();
  productId = pepsi.id;
});

afterAll(async () => {
  await db.destroy();
});

describe("Atomic order numbering", () => {
  it("assigns unique sequential numbers to concurrent orders in one branch", async () => {
    const responses = await Promise.all(
      Array.from({ length: 8 }, () => createOrder(branchId))
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
    const settings = await request(app)
      .patch("/api/v1/settings")
      .set(auth())
      .send({ branch_specific_numbering: false });
    expect(settings.status).toBe(200);

    const [first, second] = await Promise.all([
      createOrder(branchId),
      createOrder(branch2Id),
    ]);

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(first.body.data.order_no).not.toBe(second.body.data.order_no);

    const rows = await db("orders")
      .whereIn("id", [first.body.data.id, second.body.data.id])
      .orderBy("order_no", "asc")
      .select("numbering_key", "order_no");
    expect(rows).toHaveLength(2);
    expect(rows[0].numbering_key).toBe(rows[1].numbering_key);
    expect(rows[0].numbering_key).toBe(`account:${accountId}:continuous`);
    expect(Number(rows[1].order_no)).toBe(Number(rows[0].order_no) + 1);
  });
});
