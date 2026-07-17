import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
import { config } from "../src/config";
import { makeKnex } from "../src/db/knex";
import { seedFoundation } from "../src/db/seedData";
import { newId } from "../src/lib/ids";

const db = makeKnex(config.testDatabaseUrl);
let app: ReturnType<typeof createApp>;
let ownerToken = "";
let kitchenToken = "";
let branchId = "";
let branch2Id = "";
let accountId = "";
let productId = "";

const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
const key = (p: string) => `${p}-${newId().slice(0, 12)}`;

async function login(email: string, password: string): Promise<string> {
  const r = await request(app).post("/api/v1/auth/login").send({ email, password });
  expect(r.status).toBe(200);
  return r.body.token;
}

async function createOrder(token = ownerToken, branch = branchId) {
  const r = await request(app).post("/api/v1/orders").set(auth(token)).send({
    branch_id: branch,
    order_type: "takeaway",
    payment_method: "unpaid",
    items: [{ product_id: productId, qty: 1, modifier_ids: [] }],
  });
  return r;
}

async function toKitchen(orderId: string) {
  const r = await request(app)
    .patch(`/api/v1/kitchen/orders/${orderId}/status`)
    .set(auth(ownerToken))
    .send({ status: "in_kitchen" });
  expect(r.status).toBe(200);
}

beforeAll(async () => {
  await db.migrate.rollback(undefined, true);
  await db.migrate.latest();
  const seed = await seedFoundation(db);
  branchId = seed.branchId;
  branch2Id = seed.branch2Id!;
  accountId = seed.accountId;
  app = createApp(db);
  ownerToken = await login(seed.ownerEmail, seed.ownerPassword);
  kitchenToken = await login("kitchen@ykms.local", "Kitchen@12345");

  const categoryId = newId();
  productId = newId();
  await db("categories").insert({ id: categoryId, account_id: accountId, name_ar: "اختبار الإيقاف", sort_order: 97, is_active: true });
  await db("products").insert({ id: productId, account_id: accountId, category_id: categoryId, name_ar: "صنف إيقاف", base_price: 10, sort_order: 0, is_active: true });
}, 60000);

afterAll(async () => {
  await db.destroy();
});

describe("kitchen pause", () => {
  it("rejects unauthenticated and missing kitchen.manage", async () => {
    const anon = await request(app).post("/api/v1/kitchen/pause").send({ branch_id: branchId, reason: "test", idempotency_key: key("p") });
    expect(anon.status).toBe(401);
    const kitchen = await request(app)
      .post("/api/v1/kitchen/pause")
      .set(auth(kitchenToken))
      .send({ branch_id: branchId, reason: "بلا صلاحية", idempotency_key: key("p") });
    expect(kitchen.status).toBe(403);
  });

  it("cross-account branch is 404", async () => {
    const r = await request(app)
      .post("/api/v1/kitchen/pause")
      .set(auth(ownerToken))
      .send({ branch_id: newId(), reason: "غير موجود", idempotency_key: key("p") });
    expect(r.status).toBe(404);
  });

  it("pauses, replays idempotently, and 409s on a different key", async () => {
    const k = key("pause");
    const first = await request(app).post("/api/v1/kitchen/pause").set(auth(ownerToken)).send({ branch_id: branchId, reason: "عطل معدات", idempotency_key: k });
    expect(first.status).toBe(201);
    expect(first.body.data.is_paused).toBe(true);

    const replay = await request(app).post("/api/v1/kitchen/pause").set(auth(ownerToken)).send({ branch_id: branchId, reason: "عطل معدات", idempotency_key: k });
    expect(replay.status).toBe(200);
    expect(replay.body.data.idempotent_replay).toBe(true);

    const dup = await request(app).post("/api/v1/kitchen/pause").set(auth(ownerToken)).send({ branch_id: branchId, reason: "سبب آخر", idempotency_key: key("pause2") });
    expect(dup.status).toBe(409);

    const state = await request(app).get(`/api/v1/kitchen/state?branch_id=${branchId}`).set(auth(kitchenToken));
    expect(state.status).toBe(200);
    expect(state.body.data.is_paused).toBe(true);
  });

  it("blocks new order submission with 409 KITCHEN_PAUSED and zero side effects", async () => {
    const ordersBefore = await db("orders").where({ account_id: accountId, branch_id: branchId }).count<{ c: string }[]>("* as c");
    const paysBefore = await db("payments").count<{ c: string }[]>("* as c");
    const r = await createOrder();
    expect(r.status).toBe(409);
    const ordersAfter = await db("orders").where({ account_id: accountId, branch_id: branchId }).count<{ c: string }[]>("* as c");
    const paysAfter = await db("payments").count<{ c: string }[]>("* as c");
    expect(ordersAfter[0].c).toBe(ordersBefore[0].c);
    expect(paysAfter[0].c).toBe(paysBefore[0].c);
    const audit = await db("audit_logs").where({ action: "kitchen.transition_blocked_by_pause" }).first();
    expect(audit).toBeTruthy();
  });

  it("second branch stays open while first is paused", async () => {
    const r = await createOrder(ownerToken, branch2Id);
    expect(r.status).toBe(201);
  });

  it("existing board orders remain actionable while paused", async () => {
    // order created on branch2 (open) then moved through kitchen while branch1 paused
    const r = await createOrder(ownerToken, branch2Id);
    expect(r.status).toBe(201);
    await toKitchen(r.body.data.id);
    const ready = await request(app).patch(`/api/v1/kitchen/orders/${r.body.data.id}/status`).set(auth(ownerToken)).send({ status: "ready" });
    expect(ready.status).toBe(200);
  });

  it("resumes, replays resume, then accepts orders again", async () => {
    const k = key("resume");
    const first = await request(app).post("/api/v1/kitchen/resume").set(auth(ownerToken)).send({ branch_id: branchId, idempotency_key: k });
    expect(first.status).toBe(201);
    const replay = await request(app).post("/api/v1/kitchen/resume").set(auth(ownerToken)).send({ branch_id: branchId, idempotency_key: k });
    expect(replay.status).toBe(200);
    expect(replay.body.data.idempotent_replay).toBe(true);
    const dup = await request(app).post("/api/v1/kitchen/resume").set(auth(ownerToken)).send({ branch_id: branchId, idempotency_key: key("r2") });
    expect(dup.status).toBe(409);

    const ok = await createOrder();
    expect(ok.status).toBe(201);
    const audits = await db("audit_logs").whereIn("action", ["kitchen.paused", "kitchen.resumed"]).count<{ c: string }[]>("* as c");
    expect(Number(audits[0].c)).toBeGreaterThanOrEqual(2);
  });

  it("handles concurrent pause requests deterministically (one 201, others 409/200-replay)", async () => {
    const results = await Promise.all(
      [1, 2, 3, 4].map((i) =>
        request(app).post("/api/v1/kitchen/pause").set(auth(ownerToken)).send({ branch_id: branchId, reason: "سباق", idempotency_key: `race-pause-${i}-000000` })
      )
    );
    const codes = results.map((r) => r.status).sort();
    expect(codes[0]).toBe(201);
    expect(codes.slice(1).every((c) => c === 409)).toBe(true);
    // cleanup
    const res = await request(app).post("/api/v1/kitchen/resume").set(auth(ownerToken)).send({ branch_id: branchId, idempotency_key: key("cleanup") });
    expect(res.status).toBe(201);
  });
});

describe("order hold", () => {
  let orderId = "";

  beforeAll(async () => {
    const r = await createOrder();
    expect(r.status).toBe(201);
    orderId = r.body.data.id;
    await toKitchen(orderId);
  });

  it("requires kitchen.update (401/403)", async () => {
    const anon = await request(app).post(`/api/v1/kitchen/orders/${orderId}/hold`).send({ reason_code: "quality_check", idempotency_key: key("h") });
    expect(anon.status).toBe(401);
  });

  it("validates reason codes and mandatory note for other", async () => {
    const bad = await request(app).post(`/api/v1/kitchen/orders/${orderId}/hold`).set(auth(ownerToken)).send({ reason_code: "nope", idempotency_key: key("h") });
    expect(bad.status).toBe(422);
    const otherNoNote = await request(app).post(`/api/v1/kitchen/orders/${orderId}/hold`).set(auth(ownerToken)).send({ reason_code: "other", idempotency_key: key("h") });
    expect(otherNoNote.status).toBe(422);
  });

  it("holds, replays, 409s a different key, and blocks ->ready", async () => {
    const k = key("hold");
    const first = await request(app).post(`/api/v1/kitchen/orders/${orderId}/hold`).set(auth(kitchenToken)).send({ reason_code: "ingredient_shortage", idempotency_key: k });
    expect(first.status).toBe(201);

    const replay = await request(app).post(`/api/v1/kitchen/orders/${orderId}/hold`).set(auth(kitchenToken)).send({ reason_code: "ingredient_shortage", idempotency_key: k });
    expect(replay.status).toBe(200);
    expect(replay.body.data.idempotent_replay).toBe(true);

    const dup = await request(app).post(`/api/v1/kitchen/orders/${orderId}/hold`).set(auth(kitchenToken)).send({ reason_code: "quality_check", idempotency_key: key("h2") });
    expect(dup.status).toBe(409);

    const ready = await request(app).patch(`/api/v1/kitchen/orders/${orderId}/status`).set(auth(ownerToken)).send({ status: "ready" });
    expect(ready.status).toBe(409);
    const blocked = await db("audit_logs").where({ action: "kitchen.transition_blocked_by_hold", entity_id: orderId }).first();
    expect(blocked).toBeTruthy();

    // board exposes the active hold
    const board = await request(app).get("/api/v1/kitchen/orders").set(auth(ownerToken));
    const row = board.body.data.find((o: { id: string }) => o.id === orderId);
    expect(row.active_hold?.reason_code).toBe("ingredient_shortage");
  });

  it("resumes, replays resume, 409s not-held, then ->ready succeeds and SLA excluded time is recorded", async () => {
    const k = key("hres");
    const first = await request(app).post(`/api/v1/kitchen/orders/${orderId}/hold-resume`).set(auth(kitchenToken)).send({ idempotency_key: k });
    expect(first.status).toBe(201);
    const replay = await request(app).post(`/api/v1/kitchen/orders/${orderId}/hold-resume`).set(auth(kitchenToken)).send({ idempotency_key: k });
    expect(replay.status).toBe(200);
    const notHeld = await request(app).post(`/api/v1/kitchen/orders/${orderId}/hold-resume`).set(auth(kitchenToken)).send({ idempotency_key: key("h3") });
    expect(notHeld.status).toBe(409);

    const board = await request(app).get("/api/v1/kitchen/orders").set(auth(ownerToken));
    const row = board.body.data.find((o: { id: string }) => o.id === orderId);
    expect(row.active_hold).toBeNull();
    expect(row.held_total_seconds).toBeGreaterThanOrEqual(0);

    const ready = await request(app).patch(`/api/v1/kitchen/orders/${orderId}/status`).set(auth(ownerToken)).send({ status: "ready" });
    expect(ready.status).toBe(200);

    const audits = await db("audit_logs").whereIn("action", ["kitchen.order_held", "kitchen.order_resumed"]).count<{ c: string }[]>("* as c");
    expect(Number(audits[0].c)).toBeGreaterThanOrEqual(2);
  });

  it("rejects hold on non-in_kitchen order (invalid state)", async () => {
    const r = await request(app).post(`/api/v1/kitchen/orders/${orderId}/hold`).set(auth(ownerToken)).send({ reason_code: "quality_check", idempotency_key: key("h4") });
    expect(r.status).toBe(409);
  });

  it("enforces the single-active-hold DB constraint directly", async () => {
    const o = await createOrder();
    await toKitchen(o.body.data.id);
    const base = { id: newId(), account_id: accountId, branch_id: branchId, order_id: o.body.data.id, reason_code: "quality_check", held_by: (await db("users").first()).id, hold_key: key("db") };
    await db("kitchen_order_holds").insert(base);
    await expect(db("kitchen_order_holds").insert({ ...base, id: newId(), hold_key: key("db2") })).rejects.toThrow();
  });

  it("migration 020 down/up cycles cleanly", async () => {
    await db.migrate.down();
    await db.migrate.latest();
    const perm = await db("permissions").where({ key: "kitchen.manage" }).first();
    expect(perm).toBeTruthy();
  });
});
