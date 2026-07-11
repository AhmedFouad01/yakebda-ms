import { beforeAll, afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import { makeKnex } from "../src/db/knex";
import { createApp } from "../src/app";
import { seedFoundation } from "../src/db/seedData";
import { config } from "../src/config";

/**
 * YKMS-02F — RBAC الحقيقي بلا تجاوزات + timestamps المطبخ + endpoints محرر الأصناف.
 * لا يوجد أي role-name override: الاختبارات تثبت أن owner/admin يملكان
 * settings.manage عبر role_permissions الفعلية (زرع + مزامنة الهجرة 008).
 */

const db = makeKnex(config.testDatabaseUrl);
let app: ReturnType<typeof createApp>;
let ownerToken = "";
let branchId = "";

const asOwner = (r: request.Test) => r.set("Authorization", `Bearer ${ownerToken}`);

beforeAll(async () => {
  await db.migrate.rollback(undefined, true);
  await db.migrate.latest();
  const seed = await seedFoundation(db);
  branchId = seed.branchId;
  app = createApp(db);
  const owner = await request(app)
    .post("/api/v1/auth/login")
    .send({ email: seed.ownerEmail, password: seed.ownerPassword });
  ownerToken = owner.body.token;
});

afterAll(async () => {
  await db.destroy();
});

describe("YKMS-02F — RBAC عبر البيانات لا عبر أسماء الأدوار", () => {
  it("owner وadmin يملكان settings.manage في role_permissions فعليًا (بعد المزامنة)", async () => {
    for (const key of ["owner", "admin"]) {
      const role = await db("roles").where({ key }).first();
      expect(role, `role ${key} exists`).toBeTruthy();
      const perms = await db("role_permissions").where({ role_id: role.id }).pluck("permission_key");
      expect(perms).toContain("settings.manage");
      expect(perms).toContain("orders.discount_above_limit");
      expect(perms).toContain("delivery.assign");
    }
  });

  it("مزامنة الهجرة تعالج قاعدة قديمة: حذف صلاحيات المالك ثم rollback+migrate يعيدها", async () => {
    const role = await db("roles").where({ key: "owner" }).first();
    // محاكاة قاعدة قديمة ناقصة
    await db("role_permissions").where({ role_id: role.id, permission_key: "settings.manage" }).del();
    let perms = await db("role_permissions").where({ role_id: role.id }).pluck("permission_key");
    expect(perms).not.toContain("settings.manage");
    // إعادة تشغيل الهجرة 008 (المزامنة idempotent)
    const { syncPermissionCatalog } = await import("../src/db/seedData");
    await syncPermissionCatalog(db);
    perms = await db("role_permissions").where({ role_id: role.id }).pluck("permission_key");
    expect(perms).toContain("settings.manage");
  });

  it("/auth/me يرجع permissions تتضمن settings.manage للمالك — وPATCH /settings يعمل", async () => {
    const me = await asOwner(request(app).get("/api/v1/auth/me"));
    expect(me.status).toBe(200);
    expect(me.body.user.permissions).toContain("settings.manage");
    const patch = await asOwner(request(app).patch("/api/v1/settings").send({ receipt_copies: 2 }));
    expect(patch.status).toBe(200);
    expect(patch.body.data.receipt_copies).toBe(2);
    await asOwner(request(app).patch("/api/v1/settings").send({ receipt_copies: 1 }));
  });

  it("موظف المطبخ (بلا settings.manage) يُرفض 403 — لا تجاوز خلفي", async () => {
    const kitchen = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "kitchen@ykms.local", password: "Kitchen@12345" });
    const res = await request(app)
      .patch("/api/v1/settings")
      .set("Authorization", `Bearer ${kitchen.body.token}`)
      .send({ receipt_copies: 3 });
    expect(res.status).toBe(403);
  });
});

describe("YKMS-02F — timestamps المطبخ (مصدر المؤقت الجاري)", () => {
  it("in_kitchen_at وready_at وcompleted_at تُختم عند الانتقالات", async () => {
    const pepsi = await db("products").where({ name_ar: "بيبسي" }).first();
    const created = await asOwner(
      request(app).post("/api/v1/orders").send({
        branch_id: branchId,
        order_type: "takeaway",
        submit: true,
        items: [{ product_id: pepsi.id, qty: 1 }],
      })
    );
    expect(created.status).toBe(201);
    const id = created.body.data.id;
    expect(created.body.data.submitted_at).toBeTruthy();

    const inKitchen = await asOwner(request(app).patch(`/api/v1/orders/${id}/status`).send({ status: "in_kitchen" }));
    expect(inKitchen.status).toBe(200);
    let row = await db("orders").where({ id }).first();
    expect(row.in_kitchen_at).toBeTruthy();
    expect(row.ready_at).toBeNull();

    await asOwner(request(app).patch(`/api/v1/orders/${id}/status`).send({ status: "ready" }));
    row = await db("orders").where({ id }).first();
    expect(row.ready_at).toBeTruthy();

    await asOwner(request(app).patch(`/api/v1/orders/${id}/status`).send({ status: "completed" }));
    row = await db("orders").where({ id }).first();
    expect(row.completed_at).toBeTruthy();
  });

  it("GET /kitchen/orders يعرض الطوابع الزمنية اللازمة للمؤقت", async () => {
    const pepsi = await db("products").where({ name_ar: "بيبسي" }).first();
    await asOwner(
      request(app).post("/api/v1/orders").send({
        branch_id: branchId,
        order_type: "takeaway",
        submit: true,
        items: [{ product_id: pepsi.id, qty: 1 }],
      })
    );
    const res = await asOwner(request(app).get("/api/v1/kitchen/orders"));
    expect(res.status).toBe(200);
    const order = res.body.data.find((o: { status: string }) => o.status === "submitted");
    expect(order).toBeTruthy();
    expect(order.submitted_at).toBeTruthy();
    expect(order.created_at).toBeTruthy();
    expect("in_kitchen_at" in order).toBe(true);
    expect("ready_at" in order).toBe(true);
  });
});

describe("YKMS-02F — endpoints محرر الأصناف", () => {
  it("GET /products/:id يرجع الصنف كاملًا بالأحجام وروابط الإضافات + حفظ وإعادة تحميل", async () => {
    const hawawshi = await db("products").where({ name_ar: "حواوشي كبدة" }).first();
    const target = hawawshi ?? (await db("products").first());
    const res = await asOwner(request(app).get(`/api/v1/products/${target.id}`));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data.variants)).toBe(true);
    expect(Array.isArray(res.body.data.modifier_group_ids)).toBe(true);

    // حفظ حقول المحرر ثم إعادة التحميل تعكسها
    const patch = await asOwner(
      request(app).patch(`/api/v1/products/${target.id}`).send({
        description_ar: "وصف اختباري",
        prep_time_minutes: 7,
        pos_visible: true,
      })
    );
    expect(patch.status).toBe(200);
    const reload = await asOwner(request(app).get(`/api/v1/products/${target.id}`));
    expect(reload.body.data.description_ar).toBe("وصف اختباري");
    expect(reload.body.data.prep_time_minutes).toBe(7);
  });

  it("تعديل سعر حجم (variant) وحذف حجم غير مستخدم", async () => {
    const product = await db("products").first();
    const created = await asOwner(
      request(app).post(`/api/v1/products/${product.id}/variants`).send({ name_ar: "حجم اختباري", price_delta: 5 })
    );
    expect(created.status).toBe(201);
    const variantId = created.body.data.id;

    const patched = await asOwner(
      request(app).patch(`/api/v1/products/variants/${variantId}`).send({ price_delta: 8 })
    );
    expect(patched.status).toBe(200);
    expect(Number(patched.body.data.price_delta)).toBe(8);

    const deleted = await asOwner(request(app).delete(`/api/v1/products/variants/${variantId}`));
    expect(deleted.status).toBe(200);
    const gone = await db("product_variants").where({ id: variantId }).first();
    expect(gone).toBeUndefined();
  });
});
