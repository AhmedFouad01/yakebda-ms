import { beforeAll, afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import { makeKnex } from "../src/db/knex";
import { createApp } from "../src/app";
import { seedFoundation } from "../src/db/seedData";
import { config } from "../src/config";
import { newApiToken, newId } from "../src/lib/ids";

/**
 * YKMS-01H — اختبارات العزل بين الحسابات Tenant Isolation.
 * حساب (أ) هو الحساب المزروع seed، وحساب (ب) نُنشئه مباشرة في قاعدة البيانات.
 * أي token جسر Bridge لحساب (ب) يجب ألا يرى أو يعدّل أي شيء يخص حساب (أ).
 */

const db = makeKnex(config.testDatabaseUrl);
let app: ReturnType<typeof createApp>;

// حساب (أ) — المزروع
let aOwnerToken = "";
let aBranchId = "";
let aDeviceId = "";
let aEndpointId = "";
let aPrintJobId = "";
let aBridgeToken = "";

// حساب (ب) — الدخيل
let bBranchId = "";
let bDeviceId = "";
let bBridgeToken = "";

const asAOwner = (r: request.Test) => r.set("Authorization", `Bearer ${aOwnerToken}`);
const asABridge = (r: request.Test) => r.set("Authorization", `Bearer ${aBridgeToken}`);
const asBBridge = (r: request.Test) => r.set("Authorization", `Bearer ${bBridgeToken}`);

beforeAll(async () => {
  await db.migrate.rollback(undefined, true);
  await db.migrate.latest();
  const seed = await seedFoundation(db);
  aBranchId = seed.branchId;
  app = createApp(db);

  const login = await request(app)
    .post("/api/v1/auth/login")
    .send({ email: seed.ownerEmail, password: seed.ownerPassword });
  aOwnerToken = login.body.token;

  // حساب (أ): جهاز + نقطة هاردوير + مهمة طباعة + token جسر
  const dev = await asAOwner(
    request(app)
      .post("/api/v1/devices")
      .send({ branch_id: aBranchId, name: "كاشير أ", type: "pos" })
  );
  aDeviceId = dev.body.data.id;

  const ep = await asAOwner(
    request(app).post("/api/v1/hardware-endpoints").send({
      branch_id: aBranchId,
      device_id: aDeviceId,
      name: "طابعة إيصالات أ",
      kind: "receipt_printer",
      connection: "usb",
    })
  );
  aEndpointId = ep.body.data.id;

  const job = await asAOwner(
    request(app).post("/api/v1/print-jobs").send({
      branch_id: aBranchId,
      endpoint_id: aEndpointId,
      device_id: aDeviceId,
      type: "test",
      payload: { lines: ["اختبار"] },
    })
  );
  aPrintJobId = job.body.data.id;

  const aClient = await asAOwner(
    request(app).post("/api/v1/api-clients").send({ name: "جسر أ", kind: "bridge" })
  );
  const aTok = await asAOwner(
    request(app)
      .post(`/api/v1/api-clients/${aClient.body.data.id}/tokens`)
      .send({ name: "token جسر أ", scopes: ["bridge"] })
  );
  aBridgeToken = aTok.body.data.token;

  // حساب (ب): إنشاء مباشر في قاعدة البيانات
  const bAccountId = newId();
  await db("accounts").insert({ id: bAccountId, name: "مطعم دخيل" });
  bBranchId = newId();
  await db("branches").insert({
    id: bBranchId,
    account_id: bAccountId,
    name: "فرع دخيل",
    timezone: "Africa/Cairo",
  });
  bDeviceId = newId();
  await db("devices").insert({
    id: bDeviceId,
    account_id: bAccountId,
    branch_id: bBranchId,
    name: "كاشير ب",
    type: "pos",
    platform: "windows",
  });
  const bClientId = newId();
  await db("api_clients").insert({
    id: bClientId,
    account_id: bAccountId,
    name: "جسر ب",
    kind: "bridge",
    is_active: true,
  });
  const t = newApiToken();
  await db("api_tokens").insert({
    id: newId(),
    client_id: bClientId,
    name: "token جسر ب",
    token_hash: t.hash,
    prefix: t.prefix,
    scopes: JSON.stringify(["bridge"]),
  });
  bBridgeToken = t.plain;
});

afterAll(async () => {
  await db.destroy();
});

describe("YKMS-01H — عزل الجسر بين الحسابات", () => {
  it("جسر حساب (ب) لا يستطيع سحب مهام طباعة جهاز في حساب (أ)", async () => {
    const res = await asBBridge(
      request(app).get(`/api/v1/bridge/print-jobs?device_id=${aDeviceId}`)
    );
    expect(res.status).toBe(404);
    // ولم تتغير حالة مهمة حساب (أ)
    const job = await db("print_jobs").where({ id: aPrintJobId }).first();
    expect(job.status).toBe("pending");
  });

  it("جسر حساب (ب) لا يستطيع إرسال heartbeat لجهاز حساب (أ)", async () => {
    const res = await asBBridge(
      request(app).post("/api/v1/bridge/heartbeat").send({ device_id: aDeviceId })
    );
    expect(res.status).toBe(404);
  });

  it("heartbeat لا يُحدّث نقاط هاردوير خارج الحساب حتى لو مرّت في القائمة", async () => {
    const before = await db("hardware_endpoints").where({ id: aEndpointId }).first();
    const res = await asBBridge(
      request(app)
        .post("/api/v1/bridge/heartbeat")
        .send({
          device_id: bDeviceId,
          endpoints: [{ id: aEndpointId, status: "offline" }],
        })
    );
    expect(res.status).toBe(200); // جهازه صحيح، لكن نقطة حساب (أ) تُتجاهل
    const after = await db("hardware_endpoints").where({ id: aEndpointId }).first();
    expect(after.is_active).toBe(before.is_active);
    expect(after.last_seen_at).toEqual(before.last_seen_at);
  });

  it("جسر حساب (ب) لا يستطيع تحديث نتيجة مهمة طباعة حساب (أ)", async () => {
    const res = await asBBridge(
      request(app)
        .post(`/api/v1/bridge/print-jobs/${aPrintJobId}/result`)
        .send({ status: "failed", error: "تخريب" })
    );
    expect(res.status).toBe(404);
    const job = await db("print_jobs").where({ id: aPrintJobId }).first();
    expect(job.status).toBe("pending");
    expect(job.error).toBeNull();
  });

  it("جسر الحساب الصحيح (أ) ما زال يعمل كاملًا بعد التقييد", async () => {
    const claim = await asABridge(
      request(app).get(`/api/v1/bridge/print-jobs?device_id=${aDeviceId}`)
    );
    expect(claim.status).toBe(200);
    expect(claim.body.data.map((j: { id: string }) => j.id)).toContain(aPrintJobId);

    const result = await asABridge(
      request(app).post(`/api/v1/bridge/print-jobs/${aPrintJobId}/result`).send({ status: "printed" })
    );
    expect(result.status).toBe(200);
    const job = await db("print_jobs").where({ id: aPrintJobId }).first();
    expect(job.status).toBe("printed");
  });
});

describe("YKMS-01H — عزل نقاط الهاردوير", () => {
  it("لا يمكن ربط نقطة هاردوير بجهاز من حساب آخر", async () => {
    const res = await asAOwner(
      request(app).post("/api/v1/hardware-endpoints").send({
        branch_id: aBranchId,
        device_id: bDeviceId, // جهاز حساب (ب)
        name: "طابعة مشبوهة",
        kind: "receipt_printer",
        connection: "usb",
      })
    );
    expect(res.status).toBe(404);
  });

  it("لا يمكن ربط نقطة هاردوير بجهاز من فرع مختلف داخل نفس الحساب", async () => {
    const otherBranch = await asAOwner(
      request(app).post("/api/v1/branches").send({ name: "فرع ثانٍ", address: "الجيزة" })
    );
    const res = await asAOwner(
      request(app).post("/api/v1/hardware-endpoints").send({
        branch_id: otherBranch.body.data.id,
        device_id: aDeviceId, // جهاز الفرع الرئيسي
        name: "طابعة فرع آخر",
        kind: "receipt_printer",
        connection: "usb",
      })
    );
    expect(res.status).toBe(404);
  });
});
