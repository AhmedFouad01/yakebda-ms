import { beforeAll, afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import { makeKnex } from "../src/db/knex";
import { createApp } from "../src/app";
import { seedFoundation } from "../src/db/seedData";
import { config } from "../src/config";

const db = makeKnex(config.testDatabaseUrl);
let app: ReturnType<typeof createApp>;
let ownerToken = "";
let branchId = "";
let deviceId = "";
let endpointId = "";
let bridgeToken = "";
let printJobId = "";

beforeAll(async () => {
  await db.migrate.rollback(undefined, true);
  await db.migrate.latest();
  const seed = await seedFoundation(db);
  branchId = seed.branchId;
  app = createApp(db);

  const res = await request(app)
    .post("/api/v1/auth/login")
    .send({ email: seed.ownerEmail, password: seed.ownerPassword });
  expect(res.status).toBe(200);
  ownerToken = res.body.token;
});

afterAll(async () => {
  await db.destroy();
});

const asOwner = (r: request.Test) => r.set("Authorization", `Bearer ${ownerToken}`);

describe("YKMS-01 — التأسيس", () => {
  it("health endpoint is Arabic / RTL by default", async () => {
    const res = await request(app).get("/api/v1/health");
    expect(res.body.locale).toBe("ar");
    expect(res.body.dir).toBe("rtl");
  });

  it("rejects bad credentials with an Arabic error", async () => {
    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "owner@ykms.local", password: "wrong" });
    expect(res.status).toBe(401);
    expect(res.body.message).toContain("غير صحيحة");
  });

  it("owner can create a branch (FR-001)", async () => {
    const res = await asOwner(
      request(app).post("/api/v1/branches").send({ name: "فرع مدينة نصر", address: "القاهرة" })
    );
    expect(res.status).toBe(201);
    expect(res.body.data.name).toBe("فرع مدينة نصر");
  });

  it("creates a user with a role (FR-010)", async () => {
    const res = await asOwner(
      request(app).post("/api/v1/users").send({
        name: "مدير الفرع",
        email: "manager@rms.local",
        password: "Manager@123",
        role_keys: ["manager"],
        branch_id: branchId,
      })
    );
    expect(res.status).toBe(201);
  });

  it("cashier PIN login works (FR-012)", async () => {
    const res = await request(app)
      .post("/api/v1/auth/pin-login")
      .send({ branch_id: branchId, pin: "1234" });
    expect(res.status).toBe(200);
    expect(res.body.user.roles).toContain("cashier");
  });

  it("RBAC blocks a cashier from managing branches (FR-013)", async () => {
    const login = await request(app)
      .post("/api/v1/auth/pin-login")
      .send({ branch_id: branchId, pin: "1234" });
    const res = await request(app)
      .post("/api/v1/branches")
      .set("Authorization", `Bearer ${login.body.token}`)
      .send({ name: "فرع غير مسموح" });
    expect(res.status).toBe(403);
    expect(res.body.message).toContain("صلاحية");
  });
});

describe("YKMS-01H — الهاردوير والطباعة", () => {
  it("registers a Windows POS device (FR-002/FR-004)", async () => {
    const res = await asOwner(
      request(app)
        .post("/api/v1/devices")
        .send({ branch_id: branchId, name: "كاشير 1", type: "pos", platform: "windows" })
    );
    expect(res.status).toBe(201);
    deviceId = res.body.data.id;
  });

  it("creates a device profile", async () => {
    const res = await asOwner(
      request(app)
        .post(`/api/v1/devices/${deviceId}/profiles`)
        .send({ name: "وضع الكشك", settings: { kiosk: true, numerals: "arabic" } })
    );
    expect(res.status).toBe(201);
  });

  it("creates a hardware endpoint (FR-070)", async () => {
    const res = await asOwner(
      request(app).post("/api/v1/hardware-endpoints").send({
        branch_id: branchId,
        device_id: deviceId,
        name: "طابعة الإيصالات",
        kind: "receipt_printer",
        connection: "usb",
        protocol: "escpos",
      })
    );
    expect(res.status).toBe(201);
    endpointId = res.body.data.id;
  });

  it("creates a pending print job (FR-071)", async () => {
    const res = await asOwner(
      request(app).post("/api/v1/print-jobs").send({
        endpoint_id: endpointId,
        type: "test",
        payload: { lines: ["YAKEBDA MS", "طباعة تجريبية"] },
      })
    );
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe("pending");
    printJobId = res.body.data.id;
  });

  it("issues a bridge API token shown only once (FR-161/162, NFR-003)", async () => {
    const client = await asOwner(
      request(app).post("/api/v1/api-clients").send({ name: "Bridge فرع رئيسي", kind: "bridge" })
    );
    expect(client.status).toBe(201);
    const token = await asOwner(
      request(app)
        .post(`/api/v1/api-clients/${client.body.data.id}/tokens`)
        .send({ name: "رمز الجسر", scopes: ["bridge"] })
    );
    expect(token.status).toBe(201);
    expect(token.body.data.token).toMatch(/^ykms_/);
    bridgeToken = token.body.data.token;
    // token never returned again in listings
    const list = await asOwner(request(app).get("/api/v1/api-clients"));
    const listed = JSON.stringify(list.body);
    expect(listed).not.toContain(bridgeToken);
  });

  it("bridge claims the job and reports success (FR-072)", async () => {
    const hb = await request(app)
      .post("/api/v1/bridge/heartbeat")
      .set("Authorization", `Bearer ${bridgeToken}`)
      .send({ device_id: deviceId, endpoints: [{ id: endpointId, status: "online" }] });
    expect(hb.status).toBe(200);

    const claim = await request(app)
      .get(`/api/v1/bridge/print-jobs?device_id=${deviceId}`)
      .set("Authorization", `Bearer ${bridgeToken}`);
    expect(claim.status).toBe(200);
    expect(claim.body.data.map((j: any) => j.id)).toContain(printJobId);

    const result = await request(app)
      .post(`/api/v1/bridge/print-jobs/${printJobId}/result`)
      .set("Authorization", `Bearer ${bridgeToken}`)
      .send({ status: "printed" });
    expect(result.status).toBe(200);

    const job = await db("print_jobs").where({ id: printJobId }).first();
    expect(job.status).toBe("printed");
  });

  it("bridge scope is enforced (wrong scope → 403)", async () => {
    const client = await asOwner(
      request(app).post("/api/v1/api-clients").send({ name: "موقع", kind: "website" })
    );
    const token = await asOwner(
      request(app)
        .post(`/api/v1/api-clients/${client.body.data.id}/tokens`)
        .send({ name: "رمز الموقع", scopes: ["orders.read"] })
    );
    const res = await request(app)
      .get(`/api/v1/bridge/print-jobs?device_id=${deviceId}`)
      .set("Authorization", `Bearer ${token.body.data.token}`);
    expect(res.status).toBe(403);
  });

  it("audit log recorded user, action, branch and device (FR-014)", async () => {
    const res = await asOwner(request(app).get("/api/v1/audit-logs"));
    expect(res.status).toBe(200);
    const actions = res.body.data.map((a: any) => a.action);
    expect(actions).toEqual(
      expect.arrayContaining([
        "auth.login",
        "branch.create",
        "device.register",
        "hardware_endpoint.create",
        "print_job.create",
        "print_job.printed",
        "api_token.create",
      ])
    );
    const printCreate = res.body.data.find((a: any) => a.action === "print_job.create");
    expect(printCreate.user_name).toBeTruthy();
    expect(printCreate.branch_name).toBeTruthy();
  });
});
