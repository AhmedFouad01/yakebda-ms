import { afterAll, beforeAll, describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import request from "supertest";
import { createApp } from "../src/app";
import { config } from "../src/config";
import { makeKnex } from "../src/db/knex";
import { seedFoundation } from "../src/db/seedData";
import { newId } from "../src/lib/ids";
import { getStorage, setStorage, StorageAdapter, StoredFile } from "../src/lib/storage";

const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const FALLBACK_LOGO = "/brand/yakebda-logo-placeholder.svg";

class MemoryStorage implements StorageAdapter {
  readonly files = new Map<string, Buffer>();
  private sequence = 0;

  async save(input: { data: Buffer; mime: string; prefix?: string }): Promise<StoredFile> {
    this.sequence += 1;
    const extension = input.mime === "image/png" ? "png" : input.mime === "image/webp" ? "webp" : "jpg";
    const prefix = input.prefix ?? "products";
    const key = `${prefix}/${this.sequence}-${String(this.sequence).padStart(16, "0")}.${extension}`;
    this.files.set(key, Buffer.from(input.data));
    return { url: `/uploads/${key}`, key, size: input.data.length, mime: input.mime };
  }

  async delete(key: string): Promise<void> {
    this.files.delete(key);
  }
}

const db = makeKnex(config.testDatabaseUrl);
const previousStorage = getStorage();
const storage = new MemoryStorage();
let app: ReturnType<typeof createApp>;
let accountId = "";
let ownerToken = "";
let adminToken = "";
let otherAccountId = "";

const authenticated = (token: string, operation: request.Test) =>
  operation.set("Authorization", `Bearer ${token}`);

beforeAll(async () => {
  await db.migrate.rollback(undefined, true);
  await db.migrate.latest();
  const seed = await seedFoundation(db);
  accountId = seed.accountId;
  setStorage(storage);
  app = createApp(db);

  const owner = await request(app)
    .post("/api/v1/auth/login")
    .send({ email: seed.ownerEmail, password: seed.ownerPassword });
  ownerToken = owner.body.token;

  const adminRole = await db("roles").where({ account_id: accountId, key: "admin" }).first();
  const adminId = newId();
  await db("users").insert({
    id: adminId,
    account_id: accountId,
    name: "مسؤول اختبار اللوجو",
    email: "logo-admin@ykms.local",
    password_hash: bcrypt.hashSync("LogoAdmin@12345", 10),
  });
  await db("user_roles").insert({ user_id: adminId, role_id: adminRole.id });
  const admin = await request(app)
    .post("/api/v1/auth/login")
    .send({ email: "logo-admin@ykms.local", password: "LogoAdmin@12345" });
  adminToken = admin.body.token;

  otherAccountId = newId();
  await db("accounts").insert({ id: otherAccountId, name: "حساب معزول" });
  await db("settings").insert({
    id: newId(),
    account_id: otherAccountId,
    branch_id: null,
    key: "logo_url",
    value: JSON.stringify(FALLBACK_LOGO),
  });
});

afterAll(async () => {
  setStorage(previousStorage);
  await db.destroy();
});

describe("W2b — secure restaurant logo settings", () => {
  it("يرفض الرفع بلا مصادقة أو بلا settings.manage", async () => {
    const unauthenticated = await request(app)
      .post("/api/v1/settings/logo")
      .send({ mime: "image/png", data_base64: PNG });
    expect(unauthenticated.status).toBe(401);

    const kitchen = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "kitchen@ykms.local", password: "Kitchen@12345" });
    const forbidden = await authenticated(
      kitchen.body.token,
      request(app).post("/api/v1/settings/logo").send({ mime: "image/png", data_base64: PNG })
    );
    expect(forbidden.status).toBe(403);
  });

  it("يرفع المالك لوجو باسم ومسار يولدهما السيرفر دون كشف storage key", async () => {
    const response = await authenticated(
      ownerToken,
      request(app).post("/api/v1/settings/logo").send({ mime: "image/png", data_base64: PNG })
    );
    expect(response.status).toBe(200);
    expect(response.body.data.logo_url).toMatch(new RegExp(`^/uploads/logos-${accountId}/`));
    expect(response.body.data.size).toBe(Buffer.from(PNG, "base64").length);
    expect(response.body.data).not.toHaveProperty("key");
    expect(JSON.stringify(response.body)).not.toContain("filesystem");

    const brand = await authenticated(ownerToken, request(app).get("/api/v1/settings/brand"));
    expect(brand.status).toBe(200);
    expect(brand.body.data).toEqual({ logo_url: response.body.data.logo_url });
  });

  it("يسمح للمسؤول الفعلي ويربط الملف بالحساب الحالي فقط", async () => {
    const beforeOther = await db("settings")
      .where({ account_id: otherAccountId, key: "logo_url" })
      .whereNull("branch_id")
      .first();
    const response = await authenticated(
      adminToken,
      request(app)
        .post("/api/v1/settings/logo")
        .send({ account_id: otherAccountId, mime: "image/png", data_base64: PNG })
    );
    expect(response.status).toBe(422);

    const valid = await authenticated(
      adminToken,
      request(app).post("/api/v1/settings/logo").send({ mime: "image/png", data_base64: PNG })
    );
    expect(valid.status).toBe(200);
    expect(valid.body.data.logo_url).toMatch(new RegExp(`^/uploads/logos-${accountId}/`));
    const afterOther = await db("settings")
      .where({ account_id: otherAccountId, key: "logo_url" })
      .whereNull("branch_id")
      .first();
    expect(afterOther.value).toEqual(beforeOther.value);
  });

  it("يرفض MIME غير مسموح ومحتوى لا يطابق MIME وبيانات base64 غير صالحة", async () => {
    const badMime = await authenticated(
      ownerToken,
      request(app).post("/api/v1/settings/logo").send({ mime: "image/svg+xml", data_base64: PNG })
    );
    expect(badMime.status).toBe(422);

    const badSignature = await authenticated(
      ownerToken,
      request(app)
        .post("/api/v1/settings/logo")
        .send({ mime: "image/jpeg", data_base64: Buffer.from("not-a-jpeg").toString("base64") })
    );
    expect(badSignature.status).toBe(422);

    const badBase64 = await authenticated(
      ownerToken,
      request(app).post("/api/v1/settings/logo").send({ mime: "image/png", data_base64: "%%%%" })
    );
    expect(badBase64.status).toBe(422);
  });

  it("يرفض صورة أكبر من 3MB قبل التخزين", async () => {
    const oversized = Buffer.concat([Buffer.from("89504e470d0a1a0a", "hex"), Buffer.alloc(3 * 1024 * 1024)]);
    const response = await authenticated(
      ownerToken,
      request(app)
        .post("/api/v1/settings/logo")
        .send({ mime: "image/png", data_base64: oversized.toString("base64") })
    );
    expect(response.status).toBe(422);
  });

  it("يمنع حقن logo_url عبر PATCH الإعدادات العامة", async () => {
    const response = await authenticated(
      ownerToken,
      request(app).patch("/api/v1/settings").send({ logo_url: "https://attacker.example/logo.svg" })
    );
    expect(response.status).toBe(422);
  });

  it("يزيل اللوجو ويعود للـfallback ويسجل الرفع والإزالة في audit", async () => {
    const uploaded = await authenticated(
      ownerToken,
      request(app).post("/api/v1/settings/logo").send({ mime: "image/png", data_base64: PNG })
    );
    const uploadedKey = String(uploaded.body.data.logo_url).replace("/uploads/", "");
    expect(storage.files.has(uploadedKey)).toBe(true);

    const removed = await authenticated(ownerToken, request(app).delete("/api/v1/settings/logo"));
    expect(removed.status).toBe(200);
    expect(removed.body.data.logo_url).toBe(FALLBACK_LOGO);
    expect(storage.files.has(uploadedKey)).toBe(false);

    const brand = await authenticated(ownerToken, request(app).get("/api/v1/settings/brand"));
    expect(brand.body.data.logo_url).toBe(FALLBACK_LOGO);
    const actions = await db("audit_logs")
      .where({ account_id: accountId, entity_type: "settings" })
      .whereIn("action", ["settings.logo_upload", "settings.logo_remove"])
      .pluck("action");
    expect(actions).toContain("settings.logo_upload");
    expect(actions).toContain("settings.logo_remove");
  });
});
