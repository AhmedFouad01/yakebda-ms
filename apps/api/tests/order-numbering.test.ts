import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
import { config } from "../src/config";
import { makeKnex } from "../src/db/knex";
import { seedFoundation } from "../src/db/seedData";

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

  const pepsi = await db("products").where({ account_id: seed.accountId, name_ar: "بيبسي" }).first();
  productId = pepsi.id;
});

afterAll(async () => {
  await db.destroy();
});

describe("Atomic order numbering", () => {
  it("assigns unique sequential numbers to concurrent orders in one branch", async () => {
    const responses = await Promise.all(
      Array.from({ length: 8 }, () => createOrder())
    );

    expect(responses.every((res) => res.status === 201)).toBe(true);
    const numbers = responses.map((res) => Number(res.body.data.order_no));
    expect(new Set(numbers).size).toBe(numbers.length);

    const sorted = [...numbers].sort((a, b) => a - b);
    for (let index = 1; index < sorted.length; index += 1) {
      expect(sorted[index]).toBe(sorted[index - 1] + 1);
    }
  });
});
