import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
import { config } from "../src/config";
import { makeKnex } from "../src/db/knex";
import { seedFoundation } from "../src/db/seedData";

const db = makeKnex(config.testDatabaseUrl);
let app: ReturnType<typeof createApp>;
let ownerToken = "";
let kitchenToken = "";
let branchId = "";

const asOwner = (test: request.Test) => test.set("Authorization", `Bearer ${ownerToken}`);
const asKitchen = (test: request.Test) => test.set("Authorization", `Bearer ${kitchenToken}`);

beforeAll(async () => {
  await db.migrate.rollback(undefined, true);
  await db.migrate.latest();
  const seed = await seedFoundation(db);
  branchId = seed.branchId;
  app = createApp(db);

  const owner = await request(app)
    .post("/api/v1/auth/login")
    .send({ email: seed.ownerEmail, password: seed.ownerPassword });
  expect(owner.status).toBe(200);
  ownerToken = owner.body.token;

  const kitchen = await request(app)
    .post("/api/v1/auth/login")
    .send({ email: "kitchen@ykms.local", password: "Kitchen@12345" });
  expect(kitchen.status).toBe(200);
  kitchenToken = kitchen.body.token;
});

afterAll(async () => {
  await db.destroy();
});

describe("Reporting foundation", () => {
  it("returns the active code-defined report catalog", async () => {
    const response = await asOwner(request(app).get("/api/v1/reports/catalog"));
    expect(response.status).toBe(200);
    expect(response.body.data.map((entry: { id: string }) => entry.id)).toContain("sales.by_source");
    expect(response.body.data.every((entry: { status: string }) => entry.status === "active")).toBe(true);
    expect(response.body.data).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "inventory.current_stock" })])
    );
  });

  it("returns summary data with a stable report-run metadata envelope", async () => {
    const response = await asOwner(
      request(app).get(`/api/v1/reports/summary?branch_id=${branchId}`)
    );
    expect(response.status).toBe(200);
    expect(response.body.meta).toMatchObject({
      report_id: "sales.summary",
      currency: "EGP",
      filters: { branch_id: branchId },
    });
    expect(response.body.meta.generated_at).toEqual(expect.any(String));
    expect(response.body.meta.timezone).toBe("Africa/Cairo");
    expect(response.body.data.sales_today).toEqual(expect.any(Number));
  });

  it("applies period and branch scope to sales, products, and payments", async () => {
    const sales = await asOwner(
      request(app).get(`/api/v1/reports/sales?days=30&branch_id=${branchId}`)
    );
    expect(sales.status).toBe(200);
    expect(sales.body.meta).toMatchObject({
      report_id: "sales.trend",
      filters: { days: 30, branch_id: branchId },
    });
    expect(sales.body.data.by_day).toEqual(expect.any(Array));
    expect(sales.body.data.by_source).toEqual(expect.any(Array));
    expect(
      sales.body.data.by_branch.every((row: { branch_id: string }) => row.branch_id === branchId)
    ).toBe(true);

    const top = await asOwner(
      request(app).get(`/api/v1/reports/top-products?days=30&branch_id=${branchId}`)
    );
    expect(top.status).toBe(200);
    expect(top.body.meta.filters).toEqual({ days: 30, branch_id: branchId });

    const payments = await asOwner(
      request(app).get(`/api/v1/reports/payment-methods?days=30&branch_id=${branchId}`)
    );
    expect(payments.status).toBe(200);
    expect(payments.body.meta.filters).toEqual({ days: 30, branch_id: branchId });
  });

  it("rejects invalid report filters", async () => {
    const response = await asOwner(request(app).get("/api/v1/reports/sales?days=91"));
    expect(response.status).toBe(422);
  });

  it("keeps report catalog and runs behind reports.view", async () => {
    const catalog = await asKitchen(request(app).get("/api/v1/reports/catalog"));
    expect(catalog.status).toBe(403);
    const summary = await asKitchen(request(app).get("/api/v1/reports/summary"));
    expect(summary.status).toBe(403);
  });
});
