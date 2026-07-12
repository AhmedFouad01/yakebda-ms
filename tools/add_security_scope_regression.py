from pathlib import Path

migration = '''import { Knex } from "knex";
import { syncPermissionCatalog } from "../seedData";

/**
 * Security stabilization:
 * - adds customers.lookup for least-privilege POS customer search;
 * - removes full CRM management from the system cashier role;
 * - grants lookup to operational and administrative system roles.
 */
export async function up(db: Knex): Promise<void> {
  await syncPermissionCatalog(db);

  const lookupRoles = await db("roles")
    .where({ is_system: true })
    .whereIn("key", ["cashier", "manager", "owner", "admin"]);

  for (const role of lookupRoles) {
    await db("role_permissions")
      .insert({ role_id: role.id, permission_key: "customers.lookup" })
      .onConflict(["role_id", "permission_key"])
      .ignore();
  }

  const cashierRoles = await db("roles").where({ is_system: true, key: "cashier" });
  for (const role of cashierRoles) {
    await db("role_permissions")
      .where({ role_id: role.id, permission_key: "customers.manage" })
      .del();
  }
}

export async function down(db: Knex): Promise<void> {
  const cashierRoles = await db("roles").where({ is_system: true, key: "cashier" });
  for (const role of cashierRoles) {
    await db("role_permissions")
      .insert({ role_id: role.id, permission_key: "customers.manage" })
      .onConflict(["role_id", "permission_key"])
      .ignore();
  }

  await db("role_permissions").where({ permission_key: "customers.lookup" }).del();
  await db("permissions").where({ key: "customers.lookup" }).del();
}
'''
Path("apps/api/src/db/migrations/20260712_011_security_scope_stabilization.ts").write_text(migration, encoding="utf-8")

test = '''import { afterAll, beforeAll, describe, expect, it } from "vitest";
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
let limitedToken = "";
let cashierToken = "";
let branchId = "";
let branch2Id = "";
let productId = "";
let limitedOrderId = "";
let ownerOrderId = "";

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

beforeAll(async () => {
  await db.migrate.rollback(undefined, true);
  await db.migrate.latest();
  const seed = await seedFoundation(db);
  branchId = seed.branchId;
  branch2Id = seed.branch2Id!;
  app = createApp(db);

  const ownerLogin = await request(app)
    .post("/api/v1/auth/login")
    .send({ email: seed.ownerEmail, password: seed.ownerPassword });
  ownerToken = ownerLogin.body.token;

  const cashierLogin = await request(app)
    .post("/api/v1/auth/pin-login")
    .send({ branch_id: branchId, pin: "1234" });
  cashierToken = cashierLogin.body.token;

  const categoryId = newId();
  productId = newId();
  await db("categories").insert({ id: categoryId, account_id: seed.accountId, name_ar: "اختبار", sort_order: 0, is_active: true });
  await db("products").insert({
    id: productId,
    account_id: seed.accountId,
    category_id: categoryId,
    name_ar: "صنف أمني",
    base_price: 25,
    sort_order: 0,
    is_active: true,
  });

  const roleId = newId();
  const userId = newId();
  await db("roles").insert({
    id: roleId,
    account_id: seed.accountId,
    key: "order_only_test",
    name_ar: "اختبار إنشاء فقط",
    is_system: false,
  });
  await db("role_permissions").insert({ role_id: roleId, permission_key: "orders.create" });
  await db("users").insert({
    id: userId,
    account_id: seed.accountId,
    branch_id: branchId,
    name: "مستخدم إنشاء فقط",
    email: "order-only@ykms.local",
    password_hash: bcrypt.hashSync("OrderOnly@123", 10),
    is_active: true,
  });
  await db("user_roles").insert({ user_id: userId, role_id: roleId });

  const limitedLogin = await request(app)
    .post("/api/v1/auth/login")
    .send({ email: "order-only@ykms.local", password: "OrderOnly@123" });
  limitedToken = limitedLogin.body.token;
});

afterAll(async () => {
  await db.destroy();
});

describe("Security and branch scope stabilization", () => {
  it("limits a branch-bound cashier to the assigned branch", async () => {
    const res = await request(app).get("/api/v1/branches").set(auth(cashierToken));
    expect(res.status).toBe(200);
    expect(res.body.data.map((row: any) => row.id)).toEqual([branchId]);
  });

  it("allows POS customer lookup without granting CRM management", async () => {
    const lookup = await request(app).get("/api/v1/customers/lookup").set(auth(cashierToken));
    expect(lookup.status).toBe(200);

    const crm = await request(app).get("/api/v1/customers").set(auth(cashierToken));
    expect(crm.status).toBe(403);
  });

  it("rejects payment capture when the user lacks payments.record", async () => {
    const res = await request(app)
      .post("/api/v1/orders")
      .set(auth(limitedToken))
      .send({
        branch_id: branchId,
        order_type: "takeaway",
        payment_method: "card",
        items: [{ product_id: productId, qty: 1, modifier_ids: [] }],
      });
    expect(res.status).toBe(403);
  });

  it("allows the same user to create an unpaid order in the assigned branch", async () => {
    const res = await request(app)
      .post("/api/v1/orders")
      .set(auth(limitedToken))
      .send({
        branch_id: branchId,
        order_type: "takeaway",
        payment_method: "unpaid",
        items: [{ product_id: productId, qty: 1, modifier_ids: [] }],
      });
    expect(res.status).toBe(201);
    limitedOrderId = res.body.data.id;
  });

  it("rejects order creation in another branch", async () => {
    const res = await request(app)
      .post("/api/v1/orders")
      .set(auth(limitedToken))
      .send({
        branch_id: branch2Id,
        order_type: "takeaway",
        payment_method: "unpaid",
        items: [{ product_id: productId, qty: 1, modifier_ids: [] }],
      });
    expect(res.status).toBe(403);
  });

  it("limits orders.create users to their own orders", async () => {
    const ownerOrder = await request(app)
      .post("/api/v1/orders")
      .set(auth(ownerToken))
      .send({
        branch_id: branchId,
        order_type: "takeaway",
        payment_method: "unpaid",
        items: [{ product_id: productId, qty: 1, modifier_ids: [] }],
      });
    expect(ownerOrder.status).toBe(201);
    ownerOrderId = ownerOrder.body.data.id;

    const list = await request(app).get("/api/v1/orders").set(auth(limitedToken));
    expect(list.status).toBe(200);
    expect(list.body.data.map((row: any) => row.id)).toContain(limitedOrderId);
    expect(list.body.data.map((row: any) => row.id)).not.toContain(ownerOrderId);

    const own = await request(app).get(`/api/v1/orders/${limitedOrderId}`).set(auth(limitedToken));
    expect(own.status).toBe(200);

    const other = await request(app).get(`/api/v1/orders/${ownerOrderId}`).set(auth(limitedToken));
    expect(other.status).toBe(403);
  });
});
'''
Path("apps/api/tests/security-scope.test.ts").write_text(test, encoding="utf-8")

print("Added security migration and regression tests")
