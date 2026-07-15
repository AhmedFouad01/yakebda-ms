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
let branchUserToken = "";
let accountId = "";
let branchId = "";
let branch2Id = "";
let locationId = "";
let location2Id = "";
let kilogramId = "";
let gramId = "";
let itemId = "";

const auth = (token = ownerToken) => ({ Authorization: `Bearer ${token}` });

async function postMovement(body: Record<string, unknown>, token = ownerToken) {
  return request(app).post("/api/v1/inventory/movements").set(auth(token)).send(body);
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

  const locations = await request(app).get("/api/v1/inventory/locations").set(auth());
  locationId = locations.body.data.find((row: { branch_id: string }) => row.branch_id === branchId).id;
  location2Id = locations.body.data.find((row: { branch_id: string }) => row.branch_id === branch2Id).id;

  const units = await request(app).get("/api/v1/inventory/units").set(auth());
  kilogramId = units.body.data.find((row: { symbol: string }) => row.symbol === "kg").id;
  gramId = units.body.data.find((row: { symbol: string }) => row.symbol === "g").id;
  const conversion = await request(app)
    .post("/api/v1/inventory/unit-conversions")
    .set(auth())
    .send({ from_unit_id: gramId, to_unit_id: kilogramId, factor: "0.001" });
  expect(conversion.status).toBe(201);

  const item = await request(app)
    .post("/api/v1/inventory/items")
    .set(auth())
    .send({ name_ar: "دقيق اختبار", sku: "TEST-FLOUR", base_unit_id: kilogramId, reorder_level: "1.250000" });
  expect(item.status).toBe(201);
  itemId = item.body.data.id;

  const roleId = newId();
  const userId = newId();
  await db("roles").insert({ id: roleId, account_id: accountId, key: "inventory_branch_test", name_ar: "مخزون فرع", is_system: false });
  await db("role_permissions").insert([
    { role_id: roleId, permission_key: "inventory.view" },
    { role_id: roleId, permission_key: "inventory.manage" },
  ]);
  await db("users").insert({
    id: userId,
    account_id: accountId,
    branch_id: branchId,
    name: "مسؤول مخزون فرع",
    email: "inventory-branch@ykms.local",
    password_hash: bcrypt.hashSync("Inventory@12345", 10),
    is_active: true,
  });
  await db("user_roles").insert({ user_id: userId, role_id: roleId });
  const branchLogin = await request(app)
    .post("/api/v1/auth/login")
    .send({ email: "inventory-branch@ykms.local", password: "Inventory@12345" });
  branchUserToken = branchLogin.body.token;
});

afterAll(async () => {
  await db.destroy();
});

describe("Inventory foundation", () => {
  it("converts quantities exactly and derives movement-backed balances", async () => {
    const receipt = await postMovement({
      location_id: locationId,
      item_id: itemId,
      movement_type: "receipt",
      quantity: "1000",
      unit_id: gramId,
      unit_cost: "12.3456",
      source_type: "test_receipt",
      idempotency_key: "inventory-test-receipt-1",
    });
    expect(receipt.status).toBe(201);
    expect(receipt.body.data.quantity_base).toBe("1.000000");
    expect(receipt.body.data.total_value).toBe("12.3456");

    const levels = await request(app).get("/api/v1/inventory/levels").set(auth());
    const level = levels.body.data.find(
      (row: { location_id: string; item_id: string }) => row.location_id === locationId && row.item_id === itemId
    );
    expect(Number(level.quantity_on_hand)).toBe(1);
    expect(Number(level.stock_value)).toBeCloseTo(12.3456, 4);
  });

  it("returns an idempotent replay without duplicating stock", async () => {
    const body = {
      location_id: locationId,
      item_id: itemId,
      movement_type: "receipt",
      quantity: "0.250000",
      unit_cost: "12.3456",
      source_type: "test_receipt",
      idempotency_key: "inventory-test-idempotent",
    };
    expect((await postMovement(body)).status).toBe(201);
    const replay = await postMovement(body);
    expect(replay.status).toBe(200);
    expect(replay.body.data.idempotent_replay).toBe(true);
    const rows = await db("stock_movements").where({ account_id: accountId, idempotency_key: body.idempotency_key });
    expect(rows).toHaveLength(1);
  });

  it("rejects units without an explicit conversion", async () => {
    const piece = await db("inventory_units").where({ account_id: accountId, symbol: "pc" }).first();
    const response = await postMovement({
      location_id: locationId,
      item_id: itemId,
      movement_type: "receipt",
      quantity: "1",
      unit_id: piece.id,
      unit_cost: "1",
      source_type: "test",
      idempotency_key: "inventory-test-invalid-unit",
    });
    expect(response.status).toBe(422);
  });

  it("serializes concurrent issues and blocks negative stock", async () => {
    const results = await Promise.all([
      postMovement({
        location_id: locationId,
        item_id: itemId,
        movement_type: "issue",
        quantity: "0.800000",
        source_type: "concurrency_test",
        idempotency_key: "inventory-concurrent-a",
      }),
      postMovement({
        location_id: locationId,
        item_id: itemId,
        movement_type: "issue",
        quantity: "0.800000",
        source_type: "concurrency_test",
        idempotency_key: "inventory-concurrent-b",
      }),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual([201, 409]);
  });

  it("enforces branch/location access for branch-bound inventory users", async () => {
    const denied = await postMovement(
      {
        location_id: location2Id,
        item_id: itemId,
        movement_type: "receipt",
        quantity: "1",
        unit_cost: "2",
        source_type: "scope_test",
        idempotency_key: "inventory-cross-branch-denied",
      },
      branchUserToken
    );
    expect(denied.status).toBe(403);

    const visible = await request(app).get("/api/v1/inventory/locations").set(auth(branchUserToken));
    expect(visible.body.data.map((row: { branch_id: string }) => row.branch_id)).toEqual([branchId]);
  });

  it("does not resolve item or location identifiers from another account", async () => {
    const foreignAccount = newId();
    const foreignBranch = newId();
    const foreignLocation = newId();
    await db("accounts").insert({ id: foreignAccount, name: "حساب آخر" });
    await db("branches").insert({ id: foreignBranch, account_id: foreignAccount, name: "فرع آخر" });
    await db("inventory_locations").insert({ id: foreignLocation, account_id: foreignAccount, branch_id: foreignBranch, name_ar: "مخزون آخر", is_default: true });
    const response = await postMovement({
      location_id: foreignLocation,
      item_id: itemId,
      movement_type: "receipt",
      quantity: "1",
      unit_cost: "1",
      source_type: "scope_test",
      idempotency_key: "inventory-cross-account-denied",
    });
    expect(response.status).toBe(404);
  });

  it("keeps posted stock movements append-only", async () => {
    const row = await db("stock_movements").where({ account_id: accountId }).first();
    await expect(db("stock_movements").where({ id: row.id }).update({ reason: "mutated" })).rejects.toMatchObject({ code: "55000" });
    await expect(db("stock_movements").where({ id: row.id }).delete()).rejects.toMatchObject({ code: "55000" });
  });
});
