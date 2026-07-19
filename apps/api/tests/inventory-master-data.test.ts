import { afterAll, beforeAll, describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import request from "supertest";
import { createApp } from "../src/app";
import { config } from "../src/config";
import { makeKnex } from "../src/db/knex";
import { seedFoundation } from "../src/db/seedData";
import { newId } from "../src/lib/ids";

/**
 * Sprint 2 — master-data management over the CURRENT create-only contracts:
 * permission rejection for view-only users, clear constraint errors
 * (409/422 with field details — never a generic 500), and account scope.
 */

const db = makeKnex(config.testDatabaseUrl);
let app: ReturnType<typeof createApp>;
let ownerToken = "";
let viewerToken = "";
let accountId = "";
let unitAId = "";
let unitBId = "";

const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

async function login(email: string, password: string): Promise<string> {
  const r = await request(app).post("/api/v1/auth/login").send({ email, password });
  expect(r.status).toBe(200);
  return r.body.token;
}

beforeAll(async () => {
  await db.migrate.rollback(undefined, true);
  await db.migrate.latest();
  const seed = await seedFoundation(db);
  accountId = seed.accountId;
  app = createApp(db);
  ownerToken = await login(seed.ownerEmail, seed.ownerPassword);

  // view-only user: inventory.view without inventory.manage
  const roleId = newId();
  const userId = newId();
  await db("roles").insert({ id: roleId, account_id: accountId, key: "inv_viewer_test", name_ar: "مراقب مخزون", is_system: false });
  await db("role_permissions").insert({ role_id: roleId, permission_key: "inventory.view" });
  await db("users").insert({
    id: userId,
    account_id: accountId,
    branch_id: null,
    name: "مراقب المخزون",
    email: "inv.viewer@ykms.local",
    password_hash: bcrypt.hashSync("Viewer@12345", 10),
    is_active: true,
  });
  await db("user_roles").insert({ user_id: userId, role_id: roleId });
  viewerToken = await login("inv.viewer@ykms.local", "Viewer@12345");
}, 60000);

afterAll(async () => {
  await db.destroy();
});

describe("view-only permission boundary (S2.8-1)", () => {
  it("allows reads but rejects every master-data write with 403", async () => {
    for (const path of ["/api/v1/inventory/units", "/api/v1/inventory/items", "/api/v1/inventory/suppliers", "/api/v1/inventory/locations", "/api/v1/inventory/levels"]) {
      const read = await request(app).get(path).set(auth(viewerToken));
      expect(read.status, `GET ${path}`).toBe(200);
    }
    const writes: Array<[string, Record<string, unknown>]> = [
      ["/api/v1/inventory/units", { name_ar: "لتر", symbol: "ل" }],
      ["/api/v1/inventory/items", { name_ar: "زيت", base_unit_id: newId() }],
      ["/api/v1/inventory/suppliers", { name_ar: "مورد" }],
      ["/api/v1/inventory/unit-conversions", { from_unit_id: newId(), to_unit_id: newId(), factor: "1000" }],
    ];
    for (const [path, body] of writes) {
      const res = await request(app).post(path).set(auth(viewerToken)).send(body);
      expect(res.status, `POST ${path}`).toBe(403);
    }
  });
});

describe("manage operations on current contracts (S2.8-2)", () => {
  it("creates units with name_ar + symbol and items with base_unit_id", async () => {
    const unitA = await request(app).post("/api/v1/inventory/units").set(auth(ownerToken)).send({ name_ar: "كيلوجرام", symbol: "كجم" });
    expect(unitA.status).toBe(201);
    expect(unitA.body.data.symbol).toBe("كجم");
    unitAId = unitA.body.data.id;

    const unitB = await request(app).post("/api/v1/inventory/units").set(auth(ownerToken)).send({ name_ar: "جرام", symbol: "جم" });
    expect(unitB.status).toBe(201);
    unitBId = unitB.body.data.id;

    const item = await request(app).post("/api/v1/inventory/items").set(auth(ownerToken)).send({ name_ar: "دقيق فاخر", sku: "FLR-1", base_unit_id: unitAId, reorder_level: "10" });
    expect(item.status).toBe(201);
    expect(item.body.data.base_unit_id).toBe(unitAId);

    const supplier = await request(app).post("/api/v1/inventory/suppliers").set(auth(ownerToken)).send({ name_ar: "مطاحن الدلتا", phone: "0100000000" });
    expect(supplier.status).toBe(201);

    const conversion = await request(app).post("/api/v1/inventory/unit-conversions").set(auth(ownerToken)).send({ from_unit_id: unitAId, to_unit_id: unitBId, factor: "1000" });
    expect(conversion.status).toBe(201);
    expect(Number(conversion.body.data.factor)).toBe(1000);
  });

  it("rejects missing unit fields with server validation", async () => {
    const res = await request(app).post("/api/v1/inventory/units").set(auth(ownerToken)).send({ name_ar: "بدون رمز" });
    expect(res.status).toBe(422);
  });
});

describe("SKU and supplier phone format validation (F1/F2)", () => {
  it("rejects an Arabic SKU with 422 and a field-level message", async () => {
    const res = await request(app).post("/api/v1/inventory/items").set(auth(ownerToken)).send({ name_ar: "صنف SKU عربي", sku: "دقيق١", base_unit_id: unitAId });
    expect(res.status).toBe(422);
    expect(res.body.details?.fieldErrors?.sku).toBeTruthy();
  });

  it("accepts an English/numeric/hyphenated SKU", async () => {
    const res = await request(app).post("/api/v1/inventory/items").set(auth(ownerToken)).send({ name_ar: "صنف SKU إنجليزي", sku: "FLR-2", base_unit_id: unitAId });
    expect(res.status).toBe(201);
    expect(res.body.data.sku).toBe("FLR-2");
  });

  it("accepts an omitted SKU", async () => {
    const res = await request(app).post("/api/v1/inventory/items").set(auth(ownerToken)).send({ name_ar: "صنف بدون SKU", base_unit_id: unitAId });
    expect(res.status).toBe(201);
    expect(res.body.data.sku).toBeNull();
  });

  it("rejects a non-numeric supplier phone with 422 and a field-level message", async () => {
    const res = await request(app).post("/api/v1/inventory/suppliers").set(auth(ownerToken)).send({ name_ar: "مورد هاتف نصي", phone: "غير رقمي" });
    expect(res.status).toBe(422);
    expect(res.body.details?.fieldErrors?.phone).toBeTruthy();
  });

  it("accepts a numeric supplier phone", async () => {
    const res = await request(app).post("/api/v1/inventory/suppliers").set(auth(ownerToken)).send({ name_ar: "مورد هاتف رقمي", phone: "0101234567" });
    expect(res.status).toBe(201);
    expect(res.body.data.phone).toBe("0101234567");
  });

  it("accepts an omitted supplier phone", async () => {
    const res = await request(app).post("/api/v1/inventory/suppliers").set(auth(ownerToken)).send({ name_ar: "مورد بدون هاتف" });
    expect(res.status).toBe(201);
    expect(res.body.data.phone).toBeNull();
  });
});

describe("constraint violations surface clearly (S2.2/S2.3)", () => {
  it("duplicate unit symbol → 409 with a field-level Arabic message (not 500)", async () => {
    const res = await request(app).post("/api/v1/inventory/units").set(auth(ownerToken)).send({ name_ar: "كيلو مكرر", symbol: "كجم" });
    expect(res.status).toBe(409);
    expect(res.body.details?.symbol).toContain("مستخدم بالفعل");
  });

  it("duplicate item name → 409 with field detail", async () => {
    const res = await request(app).post("/api/v1/inventory/items").set(auth(ownerToken)).send({ name_ar: "دقيق فاخر", base_unit_id: unitAId });
    expect(res.status).toBe(409);
    expect(res.body.details?.name_ar).toContain("مستخدم بالفعل");
  });

  it("duplicate supplier name → 409 with field detail", async () => {
    const res = await request(app).post("/api/v1/inventory/suppliers").set(auth(ownerToken)).send({ name_ar: "مطاحن الدلتا" });
    expect(res.status).toBe(409);
    expect(res.body.details?.name_ar).toContain("مستخدم بالفعل");
  });

  it("duplicate conversion pair → 409; self-conversion → clear rejection (not 500)", async () => {
    const dup = await request(app).post("/api/v1/inventory/unit-conversions").set(auth(ownerToken)).send({ from_unit_id: unitAId, to_unit_id: unitBId, factor: "500" });
    expect(dup.status).toBe(409);
    expect(dup.body.details?.to_unit_id).toBeTruthy();

    // self-conversion: the route's two-distinct-units count check fires first (404),
    // and the DB CHECK remains the deeper guard — either way, never a 500.
    const self = await request(app).post("/api/v1/inventory/unit-conversions").set(auth(ownerToken)).send({ from_unit_id: unitAId, to_unit_id: unitAId, factor: "1" });
    expect([404, 422]).toContain(self.status);
  });
});

describe("account isolation (S2.8-3)", () => {
  it("cannot build master data against another tenant's units", async () => {
    const foreignAccountId = newId();
    const foreignUnitId = newId();
    await db("accounts").insert({ id: foreignAccountId, name: "حساب أجنبي" });
    await db("inventory_units").insert({ id: foreignUnitId, account_id: foreignAccountId, name_ar: "وحدة أجنبية", symbol: "أج" });

    // item referencing a foreign unit → 404 (no disclosure)
    const item = await request(app).post("/api/v1/inventory/items").set(auth(ownerToken)).send({ name_ar: "صنف متسلل", base_unit_id: foreignUnitId });
    expect(item.status).toBe(404);

    // conversion using a foreign unit → 404
    const conv = await request(app).post("/api/v1/inventory/unit-conversions").set(auth(ownerToken)).send({ from_unit_id: unitAId, to_unit_id: foreignUnitId, factor: "2" });
    expect(conv.status).toBe(404);

    // foreign unit never appears in this account's list
    const list = await request(app).get("/api/v1/inventory/units").set(auth(ownerToken));
    expect(list.body.data.some((u: { id: string }) => u.id === foreignUnitId)).toBe(false);
  });
});
