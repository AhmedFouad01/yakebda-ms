import { beforeAll, afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import { makeKnex } from "../src/db/knex";
import { createApp } from "../src/app";
import { seedFoundation } from "../src/db/seedData";
import { config } from "../src/config";

/** YKMS-02G — نوع العيش كخيار مُنظَّم (لا استنتاج من النص) + بطاقة POS. */

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
  const owner = await request(app).post("/api/v1/auth/login").send({ email: seed.ownerEmail, password: seed.ownerPassword });
  ownerToken = owner.body.token;
});

afterAll(async () => {
  await db.destroy();
});

describe("YKMS-02G — مجموعة نوع العيش المنظمة", () => {
  it("مجموعة «نوع العيش» إلزامية أحادية (فينو/سياحي) موجودة", async () => {
    const res = await asOwner(request(app).get("/api/v1/modifier-groups"));
    expect(res.status).toBe(200);
    const bread = res.body.data.find((g: { name_ar: string }) => g.name_ar === "نوع العيش");
    expect(bread).toBeTruthy();
    expect(bread.is_required).toBe(true);
    expect(bread.max_select).toBe(1);
    const names = bread.modifiers.map((m: { name_ar: string }) => m.name_ar);
    expect(names).toEqual(expect.arrayContaining(["فينو", "سياحي"]));
  });

  it("مجموعة حواوشي (كبسولة/رغيف) جاهزة للربط", async () => {
    const res = await asOwner(request(app).get("/api/v1/modifier-groups"));
    const h = res.body.data.find((g: { name_ar: string }) => g.name_ar === "نوع العيش (حواوشي)");
    expect(h).toBeTruthy();
    const names = h.modifiers.map((m: { name_ar: string }) => m.name_ar);
    expect(names).toEqual(expect.arrayContaining(["كبسولة", "رغيف"]));
  });

  it("أصناف الساندوتشات مرتبطة ببنية العيش (بالفئة لا بالنص)", async () => {
    const menu = await asOwner(request(app).get(`/api/v1/branches/${branchId}/menu`));
    expect(menu.status).toBe(200);
    const sandwiches = menu.body.data.categories.find((c: { name_ar: string }) => c.name_ar === "ساندوتشات");
    expect(sandwiches).toBeTruthy();
    for (const p of sandwiches.products) {
      const hasBread = p.modifier_groups.some((g: { name_ar: string; is_required: boolean; max_select: number }) => g.name_ar === "نوع العيش" && g.is_required && g.max_select === 1);
      expect(hasBread, `${p.name_ar} has bread group`).toBe(true);
    }
  });

  it("طلب بصنف ساندوتش مع اختيار عيش يُنشأ بنجاح", async () => {
    const menu = await asOwner(request(app).get(`/api/v1/branches/${branchId}/menu`));
    const sandwiches = menu.body.data.categories.find((c: { name_ar: string }) => c.name_ar === "ساندوتشات");
    const product = sandwiches.products[0];
    const bread = product.modifier_groups.find((g: { name_ar: string }) => g.name_ar === "نوع العيش");
    const variant = product.variants[0];
    const res = await asOwner(
      request(app).post("/api/v1/orders").send({
        branch_id: branchId,
        order_type: "takeaway",
        items: [{ product_id: product.id, variant_id: variant?.id ?? null, modifier_ids: [bread.modifiers[0].id], qty: 1 }],
      })
    );
    expect(res.status).toBe(201);
  });
});

describe("YKMS-02G — مؤشرات المطبخ الحقيقية", () => {
  it("/kitchen/metrics يحسب زمن التحضير من المكتمل لا من مدة الجلوس", async () => {
    const pepsi = await db("products").where({ name_ar: "بيبسي" }).first();
    // طلب يكتمل بالكامل خلال الاختبار → يدخل حساب المتوسط
    const o = await asOwner(
      request(app).post("/api/v1/orders").send({ branch_id: branchId, order_type: "takeaway", submit: true, items: [{ product_id: pepsi.id, qty: 1 }] })
    );
    const id = o.body.data.id;
    await asOwner(request(app).patch(`/api/v1/orders/${id}/status`).send({ status: "in_kitchen" }));
    await asOwner(request(app).patch(`/api/v1/orders/${id}/status`).send({ status: "ready" }));

    const res = await asOwner(request(app).get("/api/v1/kitchen/metrics"));
    expect(res.status).toBe(200);
    expect(res.body.data.completed_today).toBeGreaterThanOrEqual(1);
    // زمن التحضير الفوري صغير جدًا (< دقيقة) — يثبت أنه من submitted→ready لا مدة الجلوس
    expect(res.body.data.avg_prep_minutes).toBeLessThan(60);
    expect(res.body.data).toHaveProperty("median_prep_minutes");
    expect(res.body.data).toHaveProperty("within_sla");
    expect(res.body.data).toHaveProperty("currently_preparing");
  });
});

describe("YKMS-02G — تفاصيل الطلب الكاملة", () => {
  it("loadFullOrder يرجع الطاقم والطوابع الزمنية للمراجعة", async () => {
    const pepsi = await db("products").where({ name_ar: "بيبسي" }).first();
    const o = await asOwner(
      request(app).post("/api/v1/orders").send({ branch_id: branchId, order_type: "takeaway", submit: true, items: [{ product_id: pepsi.id, qty: 1 }] })
    );
    const detail = await asOwner(request(app).get(`/api/v1/orders/${o.body.data.id}`));
    expect(detail.status).toBe(200);
    const d = detail.body.data;
    expect(d).toHaveProperty("cashier_name");
    expect(d).toHaveProperty("submitted_at");
    expect(d).toHaveProperty("in_kitchen_at");
    expect(d).toHaveProperty("branch_name");
    expect(Array.isArray(d.items)).toBe(true);
    expect(Array.isArray(d.payments)).toBe(true);
  });
});
