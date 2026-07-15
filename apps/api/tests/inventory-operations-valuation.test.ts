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
let branchToken = "";
let accountId = "";
let branchId = "";
let branch2Id = "";
let sourceLocationId = "";
let destinationLocationId = "";
let itemId = "";
let supplierId = "";

const auth = (token = ownerToken) => ({ Authorization: `Bearer ${token}` });

async function level(locationId: string) {
  const row = await db("stock_movements")
    .where({ account_id: accountId, location_id: locationId, item_id: itemId })
    .select(
      db.raw("coalesce(sum(quantity_base), 0)::text as quantity"),
      db.raw("coalesce(sum(total_value), 0)::text as value")
    )
    .first();
  return { quantity: Number(row.quantity), value: Number(row.value) };
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
  sourceLocationId = locations.body.data.find((row: { branch_id: string }) => row.branch_id === branchId).id;
  destinationLocationId = locations.body.data.find((row: { branch_id: string }) => row.branch_id === branch2Id).id;
  const unit = await db("inventory_units").where({ account_id: accountId, symbol: "kg" }).first();
  const item = await request(app)
    .post("/api/v1/inventory/items")
    .set(auth())
    .send({ name_ar: "صنف تقييم اختبار", sku: "VALUATION-TEST", base_unit_id: unit.id, reorder_level: "3" });
  itemId = item.body.data.id;
  const supplier = await request(app)
    .post("/api/v1/inventory/suppliers")
    .set(auth())
    .send({ name_ar: "مورد تقييم اختبار", phone: "01000000000" });
  supplierId = supplier.body.data.id;

  const roleId = newId();
  const userId = newId();
  await db("roles").insert({ id: roleId, account_id: accountId, key: "inventory_ops_branch", name_ar: "تشغيل مخزون فرع", is_system: false });
  await db("role_permissions").insert([
    { role_id: roleId, permission_key: "inventory.view" },
    { role_id: roleId, permission_key: "inventory.manage" },
  ]);
  await db("users").insert({
    id: userId,
    account_id: accountId,
    branch_id: branchId,
    name: "تشغيل مخزون فرع",
    email: "inventory-ops-branch@ykms.local",
    password_hash: bcrypt.hashSync("InventoryOps@123", 10),
    is_active: true,
  });
  await db("user_roles").insert({ user_id: userId, role_id: roleId });
  const branchLogin = await request(app)
    .post("/api/v1/auth/login")
    .send({ email: "inventory-ops-branch@ykms.local", password: "InventoryOps@123" });
  branchToken = branchLogin.body.token;
});

afterAll(async () => {
  await db.destroy();
});

describe("Inventory operations and moving weighted average", () => {
  it("posts supplier receipts and derives a weighted average", async () => {
    for (const [quantity, cost, key] of [["10", "10", "valuation-receipt-a"], ["10", "20", "valuation-receipt-b"]]) {
      const response = await request(app)
        .post("/api/v1/inventory/purchase-receipts")
        .set(auth())
        .send({
          location_id: sourceLocationId,
          item_id: itemId,
          supplier_id: supplierId,
          quantity,
          unit_cost: cost,
          receipt_reference: key,
          idempotency_key: key,
        });
      expect(response.status).toBe(201);
      expect(response.body.data.supplier_id).toBe(supplierId);
    }
    expect(await level(sourceLocationId)).toEqual({ quantity: 20, value: 300 });
  });

  it("values waste at the current moving weighted average", async () => {
    const response = await request(app)
      .post("/api/v1/inventory/waste")
      .set(auth())
      .send({
        location_id: sourceLocationId,
        item_id: itemId,
        quantity: "2",
        reason: "هالك تشغيل اختباري",
        idempotency_key: "valuation-waste-a",
      });
    expect(response.status).toBe(201);
    expect(Number(response.body.data.unit_cost)).toBe(15);
    expect(Number(response.body.data.total_value)).toBe(-30);
    expect(await level(sourceLocationId)).toEqual({ quantity: 18, value: 270 });
  });

  it("posts atomic double-entry transfer movements with carried cost", async () => {
    const body = {
      source_location_id: sourceLocationId,
      destination_location_id: destinationLocationId,
      item_id: itemId,
      quantity: "3",
      reason: "تحويل بين فرعين للاختبار",
      idempotency_key: "valuation-transfer-a",
    };
    const response = await request(app).post("/api/v1/inventory/transfers").set(auth()).send(body);
    expect(response.status).toBe(201);
    expect(Number(response.body.data.out.unit_cost)).toBe(15);
    expect(Number(response.body.data.out.total_value)).toBe(-45);
    expect(Number(response.body.data.in.total_value)).toBe(45);
    expect(response.body.data.out.transfer_group_id).toBe(response.body.data.in.transfer_group_id);
    expect(await level(sourceLocationId)).toEqual({ quantity: 15, value: 225 });
    expect(await level(destinationLocationId)).toEqual({ quantity: 3, value: 45 });

    const replay = await request(app).post("/api/v1/inventory/transfers").set(auth()).send(body);
    expect(replay.status).toBe(200);
    expect(replay.body.data.idempotent_replay).toBe(true);
    expect(await db("stock_movements").where({ source_type: "inventory_transfer" })).toHaveLength(2);
  });

  it("records a count and posts only the measured difference", async () => {
    const body = {
      location_id: sourceLocationId,
      item_id: itemId,
      counted_quantity: "14",
      reason: "جرد فعلي اختباري",
      idempotency_key: "valuation-count-a",
    };
    const response = await request(app).post("/api/v1/inventory/stock-counts").set(auth()).send(body);
    expect(response.status).toBe(201);
    expect(Number(response.body.data.expected_quantity)).toBe(15);
    expect(Number(response.body.data.difference_quantity)).toBe(-1);
    expect(response.body.data.movement_id).toBeTruthy();
    expect(await level(sourceLocationId)).toEqual({ quantity: 14, value: 210 });

    const replay = await request(app).post("/api/v1/inventory/stock-counts").set(auth()).send(body);
    expect(replay.status).toBe(200);
    expect(replay.body.data.idempotent_replay).toBe(true);
    expect(await db("inventory_stock_counts").where({ account_id: accountId, idempotency_key: body.idempotency_key })).toHaveLength(1);
  });

  it("rejects negative physical counts", async () => {
    const response = await request(app)
      .post("/api/v1/inventory/stock-counts")
      .set(auth())
      .send({
        location_id: sourceLocationId,
        item_id: itemId,
        counted_quantity: "-1",
        reason: "قيمة غير صالحة",
        idempotency_key: "valuation-count-negative",
      });
    expect(response.status).toBe(422);
  });

  it("does not let branch-bound users transfer into another branch", async () => {
    const response = await request(app)
      .post("/api/v1/inventory/transfers")
      .set(auth(branchToken))
      .send({
        source_location_id: sourceLocationId,
        destination_location_id: destinationLocationId,
        item_id: itemId,
        quantity: "1",
        reason: "تحويل غير مسموح",
        idempotency_key: "valuation-transfer-denied",
      });
    expect(response.status).toBe(403);
    expect(await db("stock_movements").where({ idempotency_key: "valuation-transfer-denied:out" })).toHaveLength(0);
  });
});
