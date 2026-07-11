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
