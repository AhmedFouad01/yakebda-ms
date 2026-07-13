import { afterAll, beforeAll, describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import request from "supertest";
import { createApp } from "../src/app";
import { config } from "../src/config";
import { makeKnex } from "../src/db/knex";
import { seedFoundation } from "../src/db/seedData";
import { newId } from "../src/lib/ids";

const db = makeKnex(config.testDatabaseUrl);
let app: ReturnType<typeof createApp>;
let ownerToken = "";
let managerToken = "";
let kitchenToken = "";
let cashierToken = "";
let driverToken = "";
let branchId = "";
let branch2Id = "";

async function login(email: string, password: string): Promise<string> {
  const response = await request(app)
    .post("/api/v1/auth/login")
    .send({ email, password });
  expect(response.status).toBe(200);
  return response.body.token;
}

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

beforeAll(async () => {
  await db.migrate.rollback(undefined, true);
  await db.migrate.latest();
  const seed = await seedFoundation(db);
  branchId = seed.branchId;
  branch2Id = seed.branch2Id!;
  app = createApp(db);

  ownerToken = await login(seed.ownerEmail, seed.ownerPassword);
  managerToken = await login("manager@ykms.local", "Manager@12345");
  kitchenToken = await login("kitchen@ykms.local", "Kitchen@12345");

  const cashier = await request(app)
    .post("/api/v1/auth/pin-login")
    .send({ branch_id: branchId, pin: "1234" });
  expect(cashier.status).toBe(200);
  cashierToken = cashier.body.token;

  const account = await db("accounts").first();
  const driverRole = await db("roles")
    .where({ account_id: account.id, key: "driver" })
    .first();
  const driverId = newId();
  const driverPassword = "Driver@12345";
  await db("users").insert({
    id: driverId,
    account_id: account.id,
    branch_id: branchId,
    name: "سائق اختبار الصلاحيات",
    email: "driver.permissions@ykms.local",
    password_hash: bcrypt.hashSync(driverPassword, 10),
    is_active: true,
  });
  await db("user_roles").insert({ user_id: driverId, role_id: driverRole.id });
  driverToken = await login("driver.permissions@ykms.local", driverPassword);
});

afterAll(async () => {
  await db.destroy();
});

describe("Read permission scoping", () => {
  it("grants explicit read permissions when manage permissions are assigned", async () => {
    const rows = await db("roles as r")
      .join("role_permissions as rp", "rp.role_id", "r.id")
      .whereIn("r.key", ["owner", "manager"])
      .whereIn("rp.permission_key", ["settings.view", "customers.view"])
      .select("r.key", "rp.permission_key");

    for (const role of ["owner", "manager"]) {
      expect(rows.filter((row) => row.key === role).map((row) => row.permission_key).sort())
        .toEqual(["customers.view", "settings.view"]);
    }
  });

  it("returns full settings only to settings read/manage holders", async () => {
    for (const token of [ownerToken, managerToken]) {
      const response = await request(app)
        .get(`/api/v1/settings?branch_id=${branchId}`)
        .set(auth(token));
      expect(response.status).toBe(200);
      expect(response.body.data.tax_number).toBeDefined();
      expect(response.body.data.brand_primary_color).toBeDefined();
    }
  });

  it("returns only the runtime allowlist to POS and KDS roles", async () => {
    const cashierSettings = await request(app)
      .get(`/api/v1/settings?branch_id=${branchId}`)
      .set(auth(cashierToken));
    expect(cashierSettings.status).toBe(200);
    expect(cashierSettings.body.data.enabled_payment_methods).toBeTruthy();
    expect(cashierSettings.body.data.tax_number).toBeUndefined();
    expect(cashierSettings.body.data.brand_primary_color).toBeUndefined();

    const kitchenSettings = await request(app)
      .get("/api/v1/settings")
      .set(auth(kitchenToken));
    expect(kitchenSettings.status).toBe(200);
    expect(kitchenSettings.body.data.kds_enabled).toBeTypeOf("boolean");
    expect(kitchenSettings.body.data.tax_number).toBeUndefined();
  });

  it("blocks unrelated roles and cross-branch settings reads", async () => {
    const driver = await request(app)
      .get(`/api/v1/settings?branch_id=${branchId}`)
      .set(auth(driverToken));
    expect(driver.status).toBe(403);

    const crossBranch = await request(app)
      .get(`/api/v1/settings?branch_id=${branch2Id}`)
      .set(auth(managerToken));
    expect(crossBranch.status).toBe(403);
  });

  it("protects the full customer list while preserving POS lookup", async () => {
    for (const token of [ownerToken, managerToken]) {
      const list = await request(app).get("/api/v1/customers").set(auth(token));
      expect(list.status).toBe(200);
      expect(Array.isArray(list.body.data)).toBe(true);
    }

    const cashierList = await request(app)
      .get("/api/v1/customers")
      .set(auth(cashierToken));
    expect(cashierList.status).toBe(403);

    const lookup = await request(app)
      .get("/api/v1/customers/lookup")
      .set(auth(cashierToken));
    expect(lookup.status).toBe(200);

    const kitchenList = await request(app)
      .get("/api/v1/customers")
      .set(auth(kitchenToken));
    expect(kitchenList.status).toBe(403);
  });
});
