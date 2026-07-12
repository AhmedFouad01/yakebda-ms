import { beforeAll, afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import { makeKnex } from "../src/db/knex";
import { createApp } from "../src/app";
import { seedFoundation } from "../src/db/seedData";
import { config } from "../src/config";

/** YKMS-02 — اختبارات MVP: المنيو، الطلبات، المطبخ، المدفوعات، التقارير، RBAC. */

const db = makeKnex(config.testDatabaseUrl);
let app: ReturnType<typeof createApp>;
let ownerToken = "";
let kitchenToken = "";
let branchId = "";
let branch2Id = "";
let orderId = "";
let orderTotal = 0;

const asOwner = (r: request.Test) => r.set("Authorization", `Bearer ${ownerToken}`);
const asKitchen = (r: request.Test) => r.set("Authorization", `Bearer ${kitchenToken}`);

beforeAll(async () => {
  await db.migrate.rollback(undefined, true);
  await db.migrate.latest();
  const seed = await seedFoundation(db);
  branchId = seed.branchId;
  branch2Id = seed.branch2Id!;
  app = createApp(db);

  const owner = await request(app)
    .post("/api/v1/auth/login")
    .send({ email: seed.ownerEmail, password: seed.ownerPassword });
  ownerToken = owner.body.token;

  const kitchen = await request(app)
    .post("/api/v1/auth/login")
    .send({ email: "kitchen@ykms.local", password: "Kitchen@12345" });
  expect(kitchen.status).toBe(200);
  kitchenToken = kitchen.body.token;
});

afterAll(async () => {
  await db.destroy();
});

describe("YKMS-02 — المنيو", () => {
  it("إنشاء وتعديل فئة (Category CRUD)", async () => {
    const created = await asOwner(
      request(app).post("/api/v1/categories").send({ name_ar: "حلويات", sort_order: 9 })
    );
    expect(created.status).toBe(201);
    const patched = await asOwner(
      request(app).patch(`/api/v1/categories/${created.body.data.id}`).send({ is_active: false })
    );
    expect(patched.status).toBe(200);
    expect(patched.body.data.is_active).toBe(false);
  });

  it("إنشاء وتعديل صنف (Product CRUD)", async () => {
    const cats = await asOwner(request(app).get("/api/v1/categories"));
    const cat = cats.body.data.find((c: { name_ar: string }) => c.name_ar === "مشروبات");
    const created = await asOwner(
      request(app)
        .post("/api/v1/products")
        .send({ category_id: cat.id, name_ar: "شاي", base_price: 7 })
    );
    expect(created.status).toBe(201);
    const patched = await asOwner(
      request(app).patch(`/api/v1/products/${created.body.data.id}`).send({ base_price: 8 })
    );
    expect(patched.status).toBe(200);
    expect(Number(patched.body.data.base_price)).toBe(8);
  });

  it("منيو الفرع يعرض السعر الفعّال والإتاحة (branch menu)", async () => {
    const res = await asOwner(request(app).get(`/api/v1/branches/${branch2Id}/menu`));
    expect(res.status).toBe(200);
    const all = res.body.data.categories.flatMap((c: { products: unknown[] }) => c.products) as Array<{
      name_ar: string;
      effective_price: number;
      is_available: boolean;
    }>;
    const sandwich = all.find((p) => p.name_ar === "ساندوتش كبدة")!;
    expect(sandwich.effective_price).toBe(28); // سعر مخصص للفرع التجريبي
    const plate = all.find((p) => p.name_ar === "طبق كبدة")!;
    expect(plate.is_available).toBe(false); // غير متاح في الفرع التجريبي
  });
});

describe("YKMS-02 — الطلبات والدفع والمطبخ", () => {
  it("إنشاء طلب بأصناف وإضافات والحساب من الخادم (create order)", async () => {
    const menu = await asOwner(request(app).get(`/api/v1/branches/${branchId}/menu`));
    const all = menu.body.data.categories.flatMap((c: { products: unknown[] }) => c.products) as Array<{
      id: string;
      name_ar: string;
      variants: Array<{ id: string; name_ar: string }>;
      modifier_groups: Array<{ name_ar: string; modifiers: Array<{ id: string; name_ar: string }> }>;
    }>;
    const sandwich = all.find((p) => p.name_ar === "ساندوتش كبدة")!;
    const big = sandwich.variants.find((v) => v.name_ar === "كبير")!;
    const mods = sandwich.modifier_groups.flatMap((g) => g.modifiers);
    const cheese = mods.find((m) => m.name_ar === "جبنة")!;
    const breadGroup = sandwich.modifier_groups.find((g) => g.name_ar === "نوع العيش")!;
    const bread = breadGroup.modifiers.find((m) => m.name_ar === "فينو") ?? breadGroup.modifiers[0];
    const pepsi = all.find((p) => p.name_ar === "بيبسي")!;

    const res = await asOwner(
      request(app)
        .post("/api/v1/orders")
        .send({
          branch_id: branchId,
          order_type: "takeaway",
          discount: 5,
          items: [
            { product_id: sandwich.id, variant_id: big.id, qty: 2, modifier_ids: [cheese.id, bread.id], notes: "بدون بصل" },
            { product_id: pepsi.id, qty: 1 },
          ],
        })
    );
    expect(res.status).toBe(201);
    const order = res.body.data;
    orderId = order.id;
    // 2 × (25 + 10 + 5 + 0) = 80 ، + بيبسي 10 = 90 ، خصم 5 → 85
    expect(Number(order.subtotal)).toBe(90);
    expect(Number(order.total)).toBe(85);
    orderTotal = Number(order.total);
    expect(order.status).toBe("submitted");
    expect(order.items[0].modifiers.map((m: { name_ar: string }) => m.name_ar)).toEqual(
      expect.arrayContaining(["جبنة", bread.name_ar])
    );
  });

  it("يرفض طلب صنف غير متاح في الفرع", async () => {
    const menu = await asOwner(request(app).get(`/api/v1/branches/${branch2Id}/menu`));
    const all = menu.body.data.categories.flatMap((c: { products: unknown[] }) => c.products) as Array<{
      id: string;
      name_ar: string;
    }>;
    const plate = all.find((p) => p.name_ar === "طبق كبدة")!;
    const res = await asOwner(
      request(app)
        .post("/api/v1/orders")
        .send({ branch_id: branch2Id, items: [{ product_id: plate.id, qty: 1 }] })
    );
    expect(res.status).toBe(422);
  });

  it("موظف المطبخ يحدث حالة الطلب (kitchen flow)", async () => {
    const list = await asKitchen(request(app).get("/api/v1/kitchen/orders"));
    expect(list.status).toBe(200);
    expect(list.body.data.map((o: { id: string }) => o.id)).toContain(orderId);

    const prep = await asKitchen(
      request(app).patch(`/api/v1/kitchen/orders/${orderId}/status`).send({ status: "in_kitchen" })
    );
    expect(prep.status).toBe(200);
    const ready = await asKitchen(
      request(app).patch(`/api/v1/kitchen/orders/${orderId}/status`).send({ status: "ready" })
    );
    expect(ready.body.data.status).toBe("ready");
  });

  it("تسجيل دفعة وإكمال الطلب (payment)", async () => {
    const shift = await asOwner(
      request(app).post("/api/v1/shifts/open").send({ branch_id: branchId, opening_cash: 100 })
    );
    expect([200, 201]).toContain(shift.status);

    const pay = await asOwner(
      request(app).post(`/api/v1/orders/${orderId}/payments`).send({ method: "cash", amount: orderTotal })
    );
    expect(pay.status).toBe(201);
    expect(pay.body.data.shift_id).toBeTruthy();

    const done = await asOwner(
      request(app).patch(`/api/v1/orders/${orderId}/status`).send({ status: "completed" })
    );
    expect(done.body.data.status).toBe("completed");
  });

  it("طباعة الإيصال تنشئ مهمة طباعة بعلامة يا كبدة", async () => {
    const res = await asOwner(request(app).post(`/api/v1/orders/${orderId}/print`).send({}));
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe("pending");
    const payload = typeof res.body.data.payload === "string" ? JSON.parse(res.body.data.payload) : res.body.data.payload;
    expect(payload.lines[0]).toContain("يا كبدة");
    expect(payload.lines[payload.lines.length - 1]).toBe("شكرًا لاختيارك يا كبدة");
  });
});

describe("YKMS-02 — التقارير و RBAC", () => {
  it("ملخص التقارير يعرض قيمًا حقيقية", async () => {
    const res = await asOwner(request(app).get("/api/v1/reports/summary"));
    expect(res.status).toBe(200);
    expect(res.body.data.sales_today).toBeGreaterThanOrEqual(orderTotal);
    expect(res.body.data.orders_today).toBeGreaterThanOrEqual(1);
    const methods = await asOwner(request(app).get("/api/v1/reports/payment-methods"));
    expect(methods.body.data.map((m: { method: string }) => m.method)).toContain("cash");
    const top = await asOwner(request(app).get("/api/v1/reports/top-products"));
    expect(top.body.data.length).toBeGreaterThan(0);
  });

  it("موظف المطبخ ممنوع من إدارة المنيو والتقارير (RBAC)", async () => {
    const cat = await asKitchen(request(app).post("/api/v1/categories").send({ name_ar: "ممنوع" }));
    expect(cat.status).toBe(403);
    const rep = await asKitchen(request(app).get("/api/v1/reports/summary"));
    expect(rep.status).toBe(403);
  });
});
