import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
import { config } from "../src/config";
import { makeKnex } from "../src/db/knex";
import { seedFoundation } from "../src/db/seedData";

const db = makeKnex(config.testDatabaseUrl);
let app: ReturnType<typeof createApp>;
let branchId = "";
let ownerEmail = "";
let ownerPassword = "";

beforeAll(async () => {
  await db.migrate.rollback(undefined, true);
  await db.migrate.latest();
  const seed = await seedFoundation(db);
  branchId = seed.branchId;
  ownerEmail = seed.ownerEmail;
  ownerPassword = seed.ownerPassword;
  app = createApp(db);
});

afterEach(async () => {
  delete process.env.AUTH_RATE_LIMIT_MAX;
  delete process.env.AUTH_RATE_LIMIT_WINDOW_MS;
  delete process.env.AUTH_LOCKOUT_THRESHOLD;
  delete process.env.AUTH_LOCKOUT_MS;
  await db("users").update({ failed_login_count: 0, locked_until: null });
  app = createApp(db);
});

afterAll(async () => {
  await db.destroy();
});

describe("Authentication abuse protection", () => {
  it("locks a known email account after the configured failure threshold", async () => {
    process.env.AUTH_RATE_LIMIT_MAX = "50";
    process.env.AUTH_LOCKOUT_THRESHOLD = "2";
    process.env.AUTH_LOCKOUT_MS = "60000";
    app = createApp(db);

    const first = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: ownerEmail, password: "wrong-one" });
    expect(first.status).toBe(401);

    const second = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: ownerEmail, password: "wrong-two" });
    expect(second.status).toBe(423);
    expect(second.body.message).toContain("مؤقتًا");

    const correctWhileLocked = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: ownerEmail, password: ownerPassword });
    expect(correctWhileLocked.status).toBe(423);

    const row = await db("users").where({ email: ownerEmail }).first();
    expect(Number(row.failed_login_count)).toBe(2);
    expect(row.locked_until).toBeTruthy();
  });

  it("rate limits repeated PIN failures by IP and branch", async () => {
    process.env.AUTH_RATE_LIMIT_MAX = "2";
    process.env.AUTH_RATE_LIMIT_WINDOW_MS = "60000";
    process.env.AUTH_LOCKOUT_THRESHOLD = "50";
    app = createApp(db);

    for (const pin of ["9998", "9999"]) {
      const failed = await request(app)
        .post("/api/v1/auth/pin-login")
        .send({ branch_id: branchId, pin });
      expect(failed.status).toBe(401);
    }

    const blocked = await request(app)
      .post("/api/v1/auth/pin-login")
      .send({ branch_id: branchId, pin: "1234" });
    expect(blocked.status).toBe(429);
    expect(blocked.body.message).toContain("محاولات كثيرة");
  });

  it("blocks a locked PIN user and resets an expired lock on success", async () => {
    const cashier = await db("users")
      .where({ branch_id: branchId })
      .whereNotNull("pin_hash")
      .first();
    await db("users").where({ id: cashier.id }).update({
      failed_login_count: 5,
      locked_until: new Date(Date.now() + 60_000),
    });

    app = createApp(db);
    const locked = await request(app)
      .post("/api/v1/auth/pin-login")
      .send({ branch_id: branchId, pin: "1234" });
    expect(locked.status).toBe(423);

    await db("users").where({ id: cashier.id }).update({
      failed_login_count: 5,
      locked_until: new Date(Date.now() - 1_000),
    });
    app = createApp(db);
    const success = await request(app)
      .post("/api/v1/auth/pin-login")
      .send({ branch_id: branchId, pin: "1234" });
    expect(success.status).toBe(200);

    const refreshed = await db("users").where({ id: cashier.id }).first();
    expect(Number(refreshed.failed_login_count)).toBe(0);
    expect(refreshed.locked_until).toBeNull();
  });

  it("audits failed email and PIN attempts without storing secrets", async () => {
    process.env.AUTH_RATE_LIMIT_MAX = "50";
    app = createApp(db);
    const password = "NeverStoreThisPassword!";
    const pin = "9876";

    await request(app)
      .post("/api/v1/auth/login")
      .send({ email: ownerEmail, password });
    await request(app)
      .post("/api/v1/auth/pin-login")
      .send({ branch_id: branchId, pin });

    const rows = await db("audit_logs")
      .whereIn("action", ["auth.login_failed", "auth.pin_failed"])
      .orderBy("created_at", "desc")
      .limit(2);
    expect(rows.map((row) => row.action)).toEqual(
      expect.arrayContaining(["auth.login_failed", "auth.pin_failed"])
    );

    const serialized = JSON.stringify(rows);
    expect(serialized).not.toContain(password);
    expect(serialized).not.toContain(pin);
    expect(rows.every((row) => Boolean(row.ip))).toBe(true);
  });
});
