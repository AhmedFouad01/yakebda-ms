import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";
import { createApp } from "../src/app";
import { config } from "../src/config";
import { makeKnex } from "../src/db/knex";
import { seedFoundation } from "../src/db/seedData";
import { newId } from "../src/lib/ids";

const db = makeKnex(config.testDatabaseUrl);
let app: ReturnType<typeof createApp>;
let ownerToken = "";
let kitchenToken = "";
let branchUserToken = "";
let accountId = "";
let branchId = "";
let branch2Id = "";

const asOwner = (test: request.Test) => test.set("Authorization", `Bearer ${ownerToken}`);
const asKitchen = (test: request.Test) => test.set("Authorization", `Bearer ${kitchenToken}`);
const asBranchUser = (test: request.Test) => test.set("Authorization", `Bearer ${branchUserToken}`);

beforeAll(async () => {
  await db.migrate.rollback(undefined, true);
  await db.migrate.latest();
  const seed = await seedFoundation(db);
  accountId = seed.accountId;
  branchId = seed.branchId;
  branch2Id = seed.branch2Id!;
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

  const cashierRole = await db("roles")
    .where({ account_id: accountId, key: "cashier" })
    .first();
  const branchUserId = newId();
  await db("users").insert({
    id: branchUserId,
    account_id: accountId,
    branch_id: branchId,
    name: "مستخدم تقارير الفرع",
    email: "branch-reports@ykms.local",
    password_hash: bcrypt.hashSync("BranchReports@12345", 10),
  });
  await db("user_roles").insert({ user_id: branchUserId, role_id: cashierRole.id });

  const branchUser = await request(app)
    .post("/api/v1/auth/login")
    .send({ email: "branch-reports@ykms.local", password: "BranchReports@12345" });
  expect(branchUser.status).toBe(200);
  branchUserToken = branchUser.body.token;
});

afterAll(async () => {
  await db.destroy();
});

describe("Reporting foundation", () => {
  it("returns typed active definitions and hides planned reports", async () => {
    const response = await asOwner(request(app).get("/api/v1/reports/catalog"));
    expect(response.status).toBe(200);
    const sourceDefinition = response.body.data.find(
      (entry: { id: string }) => entry.id === "sales.by_source"
    );
    expect(sourceDefinition).toMatchObject({
      required_permissions: ["reports.view"],
      default_template_key: "sales-by-source-default",
      query_version: "1.1.0",
      supported_outputs: ["screen"],
    });
    expect(sourceDefinition.filters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "days", kind: "period_days" }),
        expect.objectContaining({ key: "branch_id", kind: "branch" }),
      ])
    );
    expect(sourceDefinition.dimensions).toEqual(
      expect.arrayContaining([expect.objectContaining({ key: "source_id" })])
    );
    expect(response.body.data).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "inventory.current_stock" })])
    );
  });

  it("returns request-scoped metadata without claiming a persisted report run", async () => {
    const response = await asOwner(
      request(app).get(`/api/v1/reports/summary?branch_id=${branchId}`)
    );
    expect(response.status).toBe(200);
    expect(response.body.meta).toMatchObject({
      report_id: "sales.summary",
      query_version: "1.1.0",
      currency: "EGP",
      timezone_policy: "branch",
      filters: { branch_id: branchId },
      effective_scope: { account_id: accountId, branch_ids: [branchId] },
    });
    expect(response.body.meta.request_id).toEqual(expect.any(String));
    expect(response.body.meta.generated_by_user_id).toEqual(expect.any(String));
    expect(response.body.meta.generated_at).toEqual(expect.any(String));
  });

  it("uses distinct report IDs and endpoints for trend, branch and source runs", async () => {
    const [trend, byBranch, bySource] = await Promise.all([
      asOwner(request(app).get(`/api/v1/reports/sales/trend?days=30&branch_id=${branchId}`)),
      asOwner(request(app).get(`/api/v1/reports/sales/by-branch?days=30&branch_id=${branchId}`)),
      asOwner(request(app).get(`/api/v1/reports/sales/by-source?days=30&branch_id=${branchId}`)),
    ]);

    expect(trend.status).toBe(200);
    expect(byBranch.status).toBe(200);
    expect(bySource.status).toBe(200);
    expect(trend.body.meta.report_id).toBe("sales.trend");
    expect(byBranch.body.meta.report_id).toBe("sales.by_branch");
    expect(bySource.body.meta.report_id).toBe("sales.by_source");
    expect(trend.body.data.rows).toEqual(expect.any(Array));
    expect(byBranch.body.data.rows.every(
      (row: { branch_id: string }) => row.branch_id === branchId
    )).toBe(true);
  });

  it("enforces branch access and reports the effective timezone policy", async () => {
    const denied = await asBranchUser(
      request(app).get(`/api/v1/reports/sales/trend?days=30&branch_id=${branch2Id}`)
    );
    expect(denied.status).toBe(403);

    await db("branches").where({ id: branchId }).update({ timezone: "Asia/Riyadh" });
    const scoped = await asBranchUser(
      request(app).get("/api/v1/reports/sales/trend?days=30")
    );
    expect(scoped.status).toBe(200);
    expect(scoped.body.meta).toMatchObject({
      timezone: "Asia/Riyadh",
      timezone_policy: "branch",
      effective_scope: { account_id: accountId, branch_ids: [branchId] },
    });

    const global = await asOwner(request(app).get("/api/v1/reports/sales/trend?days=30"));
    expect(global.status).toBe(200);
    expect(global.body.meta.timezone_policy).toBe("account_default");
    expect(global.body.meta.timezone).toBe("Africa/Cairo");
    expect(global.body.meta.effective_scope.branch_ids.sort()).toEqual(
      [branchId, branch2Id].sort()
    );
    await db("branches").where({ id: branchId }).update({ timezone: "Africa/Cairo" });
  });

  it("returns 404 for a branch outside the authenticated account", async () => {
    const response = await asOwner(
      request(app).get(`/api/v1/reports/summary?branch_id=${newId()}`)
    );
    expect(response.status).toBe(404);
  });

  it("preserves the historical source snapshot after the source is renamed", async () => {
    // The seed pays orders but never attaches an order source, so this test
    // builds its own fixture instead of depending on incidental seed data.
    const orderSource = await db("order_sources").where({ account_id: accountId }).first();
    expect(orderSource).toBeTruthy();

    const paidOrder = await db("orders as o")
      .join("payments as p", "p.order_id", "o.id")
      .where("o.account_id", accountId)
      .where("o.branch_id", branchId)
      .whereNot("p.method", "unpaid")
      .select("o.id")
      .first();
    expect(paidOrder).toBeTruthy();

    await db("orders").where({ id: paidOrder.id }).update({ source_id: orderSource.id });
    const row = { id: paidOrder.id, source_id: orderSource.id };

    await db("orders").where({ id: row.id }).update({ source_name_snapshot: "اسم المصدر وقت الطلب" });
    await db("order_sources").where({ id: row.source_id }).update({ name_ar: "اسم المصدر بعد التعديل" });

    const response = await asOwner(
      request(app).get(`/api/v1/reports/sales/by-source?days=30&branch_id=${branchId}`)
    );
    expect(response.status).toBe(200);
    const source = response.body.data.rows.find(
      (entry: { source_id: string }) => entry.source_id === row.source_id
    );
    expect(source.source).toBe("اسم المصدر وقت الطلب");
  });

  it("keeps products with the same snapshot name separate by product identity", async () => {
    // Build products without modifier-group links and a dedicated order so the
    // assertion never depends on seed product ordering or required modifiers.
    const categoryId = newId();
    const orderId = newId();
    const productIds = [newId(), newId()];

    await db("categories").insert({
      id: categoryId,
      account_id: accountId,
      name_ar: "اختبار هوية منتجات التقارير",
      sort_order: 900,
      is_active: true,
    });
    await db("products").insert(productIds.map((id, index) => ({
      id,
      account_id: accountId,
      category_id: categoryId,
      name_ar: `منتج هوية ${index + 1}`,
      base_price: 10,
      sort_order: index,
      is_active: true,
    })));
    await db("orders").insert({
      id: orderId,
      account_id: accountId,
      branch_id: branchId,
      order_no: 900001,
      order_type: "takeaway",
      status: "completed",
      subtotal: 2030,
      discount: 0,
      total: 2030,
      submitted_at: db.fn.now(),
      completed_at: db.fn.now(),
    });

    await db("order_items").insert([
      {
        id: newId(),
        order_id: orderId,
        product_id: productIds[0],
        name_ar: "اسم مكرر للاختبار",
        qty: 101,
        unit_price: 10,
        line_total: 1010,
      },
      {
        id: newId(),
        order_id: orderId,
        product_id: productIds[1],
        name_ar: "اسم مكرر للاختبار",
        qty: 102,
        unit_price: 10,
        line_total: 1020,
      },
    ]);

    const response = await asOwner(
      request(app).get(`/api/v1/reports/top-products?days=30&branch_id=${branchId}`)
    );
    expect(response.status).toBe(200);
    const matching = response.body.data.filter(
      (entry: { name_ar: string }) => entry.name_ar === "اسم مكرر للاختبار"
    );
    expect(matching).toHaveLength(2);
    expect(new Set(matching.map((entry: { product_id: string }) => entry.product_id)).size).toBe(2);
    expect(matching.every((entry: { gross_item_sales: number }) =>
      typeof entry.gross_item_sales === "number"
    )).toBe(true);
  });

  it("excludes unpaid markers and includes negative refund rows in payment totals", async () => {
    const positive = await db("payments")
      .whereNot("method", "unpaid")
      .where("amount", ">", 1)
      .first();
    expect(positive).toBeTruthy();

    await db("payments").insert({
      id: newId(),
      order_id: positive.order_id,
      branch_id: positive.branch_id,
      method: positive.method,
      amount: -1,
      kind: "refund",
      reason: "اختبار تقرير المرتجعات",
      reversal_of_payment_id: positive.id,
    });
    await db("payments").insert({
      id: newId(),
      order_id: positive.order_id,
      branch_id: positive.branch_id,
      method: "unpaid",
      amount: 0,
      kind: "payment",
    });

    const expectedRows = await db("payments as p")
      .join("orders as o", "o.id", "p.order_id")
      .where("o.account_id", accountId)
      .where("o.branch_id", positive.branch_id)
      .whereNot("p.method", "unpaid")
      .select("p.method")
      .sum("p.amount as total")
      .count("p.id as count")
      .groupBy("p.method");

    const response = await asOwner(
      request(app).get(`/api/v1/reports/payment-methods?days=30&branch_id=${positive.branch_id}`)
    );
    expect(response.status).toBe(200);
    expect(response.body.data.some((entry: { method: string }) => entry.method === "unpaid")).toBe(false);
    for (const expected of expectedRows) {
      const actual = response.body.data.find(
        (entry: { method: string }) => entry.method === expected.method
      );
      expect(actual.total).toBe(Number(expected.total));
      expect(actual.count).toBe(Number(expected.count));
    }
  });

  it("rejects unsupported periods", async () => {
    const response = await asOwner(
      request(app).get("/api/v1/reports/sales/trend?days=91")
    );
    expect(response.status).toBe(422);
  });

  it("keeps the catalog and report runs behind reports.view", async () => {
    const catalog = await asKitchen(request(app).get("/api/v1/reports/catalog"));
    expect(catalog.status).toBe(200);
    expect(catalog.body.data).toEqual([]);
    const summary = await asKitchen(request(app).get("/api/v1/reports/summary"));
    expect(summary.status).toBe(403);
  });
});
