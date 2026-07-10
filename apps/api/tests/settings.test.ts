import { beforeAll, afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import { makeKnex } from "../src/db/knex";
import { createApp } from "../src/app";
import { seedFoundation } from "../src/db/seedData";
import { config } from "../src/config";

/** YKMS-02C — اختبارات الإعدادات والشيفتات وتأثيرها الفعلي على السلوك. */

const db = makeKnex(config.testDatabaseUrl);
let app: ReturnType<typeof createApp>;
let ownerToken = "";
let kitchenToken = "";
let branchId = "";
let orderId = "";

const asOwner = (r: request.Test) => r.set("Authorization", `Bearer ${ownerToken}`);
const asKitchen = (r: request.Test) => r.set("Authorization", `Bearer ${kitchenToken}`);

async function createOrder() {
  const menu = await asOwner(request(app).get(`/api/v1/branches/${branchId}/menu`));
  const all = menu.body.data.categories.flatMap((c: { products: unknown[] }) => c.products) as Array<{
    id: string;
    name_ar: string;
  }>;
  const pepsi = all.find((p) => p.name_ar === "بيبسي")!;
  const res = await asOwner(
    request(app).post("/api/v1/orders").send({ branch_id: branchId, items: [{ product_id: pepsi.id, qty: 1 }] })
  );
  return res.body.data;
}

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
  const kitchen = await request(app)
    .post("/api/v1/auth/login")
    .send({ email: "kitchen@ykms.local", password: "Kitchen@12345" });
  kitchenToken = kitchen.body.token;
  orderId = (await createOrder()).id;
});

afterAll(async () => {
  await db.destroy();
});

describe("YKMS-02C — الإعدادات", () => {
  it("GET يرجع الافتراضيات مدموجة مع الصفوف المزروعة", async () => {
    const res = await asOwner(request(app).get("/api/v1/settings"));
    expect(res.status).toBe(200);
    expect(res.body.data.brand_name_ar).toBe("يا كبدة");
    expect(res.body.data.require_open_shift_for_cash).toBe(true);
    expect(res.body.data.enabled_payment_methods).toContain("cash");
  });

  it("PATCH يحدّث القيم — وممنوع على موظف المطبخ (RBAC)", async () => {
    const forbidden = await asKitchen(
      request(app).patch("/api/v1/settings").send({ allow_discounts: false })
    );
    expect(forbidden.status).toBe(403);
    const ok = await asOwner(
      request(app).patch("/api/v1/settings").send({ max_discount_without_manager: 10 })
    );
    expect(ok.status).toBe(200);
    expect(ok.body.data.max_discount_without_manager).toBe(10);
  });
});

describe("YKMS-02C — الشيفت وطرق الدفع تؤثر فعلًا", () => {
  it("النقدي مرفوض بدون شيفت مفتوح ثم مقبول بعد فتحه", async () => {
    const rejected = await asOwner(
      request(app).post(`/api/v1/orders/${orderId}/payments`).send({ method: "cash", amount: 10 })
    );
    expect(rejected.status).toBe(422);

    const shift = await asOwner(
      request(app).post("/api/v1/shifts/open").send({ branch_id: branchId, opening_cash: 100 })
    );
    expect(shift.status).toBe(201);
    const dup = await asOwner(
      request(app).post("/api/v1/shifts/open").send({ branch_id: branchId })
    );
    expect(dup.status).toBe(200); // النظام يعيد الشيفت المفتوح بدل فتح شيفت ثانٍ

    const accepted = await asOwner(
      request(app).post(`/api/v1/orders/${orderId}/payments`).send({ method: "cash", amount: 10 })
    );
    expect(accepted.status).toBe(201);
  });

  it("طريقة دفع معطلة في الإعدادات تُرفض", async () => {
    await asOwner(
      request(app)
        .patch("/api/v1/settings")
        .send({ enabled_payment_methods: ["cash", "card"] })
    );
    const order = await createOrder();
    const res = await asOwner(
      request(app).post(`/api/v1/orders/${order.id}/payments`).send({ method: "wallet", amount: 5 })
    );
    expect(res.status).toBe(422);
  });

  it("إيقاف طباعة الإيصالات يمنع إنشاء مهمة الطباعة", async () => {
    await asOwner(request(app).patch("/api/v1/settings").send({ receipt_printing_enabled: false }));
    const res = await asOwner(request(app).post(`/api/v1/orders/${orderId}/print`).send({}));
    expect(res.status).toBe(422);
    await asOwner(request(app).patch("/api/v1/settings").send({ receipt_printing_enabled: true }));
    const ok = await asOwner(request(app).post(`/api/v1/orders/${orderId}/print`).send({}));
    expect(ok.status).toBe(201);
  });

  it("إغلاق الشيفت يعمل", async () => {
    const current = await asOwner(request(app).get(`/api/v1/shifts/current?branch_id=${branchId}`));
    expect(current.body.data).not.toBeNull();
    const closed = await asOwner(
      request(app).post(`/api/v1/shifts/${current.body.data.id}/close`).send({ actual_cash: 150 })
    );
    expect(closed.status).toBe(200);
    expect(closed.body.data.status).toBe("closed");
  });
});
