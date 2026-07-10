import { beforeAll, afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import { makeKnex } from "../src/db/knex";
import { createApp } from "../src/app";
import { seedFoundation } from "../src/db/seedData";
import { config } from "../src/config";

/** YKMS-02E — الإعدادات مصدر الحقيقة التشغيلي: ضرائب/أنواع طلب/خصومات/ترقيم/محطات/سائقون/طباعة تلقائية. */

const db = makeKnex(config.testDatabaseUrl);
let app: ReturnType<typeof createApp>;
let ownerToken = "";
let cashierToken = "";
let branchId = "";
let productId = ""; // بيبسي — بلا أحجام أو إضافات

const asOwner = (r: request.Test) => r.set("Authorization", `Bearer ${ownerToken}`);
const asCashier = (r: request.Test) => r.set("Authorization", `Bearer ${cashierToken}`);

async function patchSettings(body: Record<string, unknown>) {
  const res = await asOwner(request(app).patch("/api/v1/settings").send(body));
  expect(res.status).toBe(200);
}

async function createOrder(overrides: Record<string, unknown> = {}, token = ownerToken) {
  return request(app)
    .post("/api/v1/orders")
    .set("Authorization", `Bearer ${token}`)
    .send({
      branch_id: branchId,
      order_type: "takeaway",
      items: [{ product_id: productId, qty: 1 }],
      ...overrides,
    });
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

  const cashier = await request(app)
    .post("/api/v1/auth/pin-login")
    .send({ branch_id: branchId, pin: "1234" });
  expect(cashier.status).toBe(200);
  cashierToken = cashier.body.token;

  const pepsi = await db("products").where({ name_ar: "بيبسي" }).first();
  productId = pepsi.id;
});

afterAll(async () => {
  await db.destroy();
});

describe("YKMS-02E — الضرائب والرسوم والتقريب", () => {
  it("VAT فوق السعر + رسوم خدمة + تقريب لأقرب جنيه — snapshot على الطلب", async () => {
    await patchSettings({
      vat_enabled: true,
      vat_percentage: 14,
      prices_include_vat: false,
      service_fee_enabled: true,
      service_fee_type: "percent",
      service_fee_value: 10,
      rounding_rule: "nearest_1",
    });
    const res = await createOrder();
    expect(res.status).toBe(201);
    const o = res.body.data;
    // بيبسي 10 → خدمة 1.00 → ض.ق.م 14% من 11 = 1.54 → 12.54 → تقريب = 13.00
    expect(Number(o.service_fee)).toBe(1);
    expect(Number(o.vat_amount)).toBe(1.54);
    expect(Number(o.total)).toBe(13);
    expect(Number(o.rounding_adjustment)).toBeCloseTo(0.46, 2);
    await patchSettings({
      vat_enabled: false,
      service_fee_enabled: false,
      rounding_rule: "none",
    });
  });
});

describe("YKMS-02E — أنواع الطلب من الإعدادات", () => {
  it("الصالة مقفولة افتراضيًا (dine-in hidden) → 422", async () => {
    const res = await createOrder({ order_type: "dine_in" });
    expect(res.status).toBe(422);
  });

  it("تعطيل التيك أواي يمنع إنشاءه ثم يعود بعد التفعيل", async () => {
    await patchSettings({ order_type_takeaway_enabled: false });
    const rejected = await createOrder();
    expect(rejected.status).toBe(422);
    await patchSettings({ order_type_takeaway_enabled: true });
    const ok = await createOrder();
    expect(ok.status).toBe(201);
  });
});

describe("YKMS-02E — متطلبات الدليفري", () => {
  it("دليفري بلا عميل أو عنوان → 422، ومع الحد الأدنى للتوصيل", async () => {
    const noCustomer = await createOrder({ order_type: "delivery", delivery_address: "العبور" });
    expect(noCustomer.status).toBe(422);

    const customer = await db("customers").first();
    const noAddress = await createOrder({ order_type: "delivery", customer_id: customer.id });
    expect(noAddress.status).toBe(422);

    await patchSettings({ min_delivery_order: 50 });
    const tooSmall = await createOrder({
      order_type: "delivery",
      customer_id: customer.id,
      delivery_address: "العبور — الحي الأول",
    });
    expect(tooSmall.status).toBe(422);
    await patchSettings({ min_delivery_order: 0 });

    const ok = await createOrder({
      order_type: "delivery",
      customer_id: customer.id,
      delivery_address: "العبور — الحي الأول",
      delivery_fee: 10,
    });
    expect(ok.status).toBe(201);
  });
});

describe("YKMS-02E — قواعد الخصم", () => {
  it("خصم فوق حد الكاشير: مرفوض للكاشير ومقبول للمالك، وسبب الخصم إلزامي عند التفعيل", async () => {
    await patchSettings({ max_discount_without_manager: 2, max_cashier_discount_percent: 90 });
    const rejected = await createOrder({ discount: 5 }, cashierToken);
    expect(rejected.status).toBe(422);

    const ownerOk = await createOrder({ discount: 5 });
    expect(ownerOk.status).toBe(201);

    await patchSettings({ discount_reason_required: true });
    const noReason = await createOrder({ discount: 1 }, cashierToken);
    expect(noReason.status).toBe(422);
    const withReason = await createOrder({ discount: 1, discount_reason: "عرض" }, cashierToken);
    expect(withReason.status).toBe(201);
    expect(withReason.body.data.discount_reason).toBe("عرض");
    await patchSettings({ discount_reason_required: false, max_discount_without_manager: 20 });
  });
});

describe("YKMS-02E — ترقيم الطلبات", () => {
  it("بادئة عامة + حرف نوع الطلب تُحفظ snapshot على الطلب", async () => {
    await patchSettings({ order_number_prefix: "YK", order_type_letter_prefix: true });
    const res = await createOrder();
    expect(res.status).toBe(201);
    expect(res.body.data.order_prefix).toBe("YKT");
    await patchSettings({ order_number_prefix: "", order_type_letter_prefix: false });
  });
});

describe("YKMS-02E — محطات التحضير والسائقون والمناطق", () => {
  it("المحطات الأربع مزروعة (جريل/قلاية/تجهيز/مشروبات)", async () => {
    const res = await asOwner(request(app).get("/api/v1/prep-stations"));
    expect(res.status).toBe(200);
    const names = res.body.data.map((s: { name_ar: string }) => s.name_ar);
    expect(names).toEqual(expect.arrayContaining(["جريل", "قلاية", "تجهيز", "مشروبات"]));
  });

  it("منطقة توصيل + سائق + تعيينه على طلب دليفري (وليس تيك أواي)", async () => {
    const zone = await asOwner(
      request(app).post("/api/v1/delivery-zones").send({ name_ar: "الحي الأول", fee: 15, min_order: 30 })
    );
    expect(zone.status).toBe(201);

    const driver = await asOwner(request(app).post("/api/v1/drivers").send({ name: "سائق تجريبي", phone: "0100" }));
    expect(driver.status).toBe(201);

    const customer = await db("customers").first();
    const delivery = await createOrder({
      order_type: "delivery",
      customer_id: customer.id,
      delivery_address: "العبور",
    });
    const assigned = await asOwner(
      request(app)
        .post(`/api/v1/orders/${delivery.body.data.id}/assign-driver`)
        .send({ driver_id: driver.body.data.id })
    );
    expect(assigned.status).toBe(200);
    expect(assigned.body.data.driver_name).toBe("سائق تجريبي");

    const takeaway = await createOrder();
    const wrong = await asOwner(
      request(app)
        .post(`/api/v1/orders/${takeaway.body.data.id}/assign-driver`)
        .send({ driver_id: driver.body.data.id })
    );
    expect(wrong.status).toBe(422);

    // الكاشير بلا delivery.assign
    const forbidden = await asCashier(
      request(app)
        .post(`/api/v1/orders/${delivery.body.data.id}/assign-driver`)
        .send({ driver_id: null })
    );
    expect(forbidden.status).toBe(403);
  });
});

describe("YKMS-02E — الطباعة التلقائية", () => {
  it("auto_print_on_payment ينشئ مهمة طباعة إيصال عند الدفع", async () => {
    await patchSettings({ auto_print_on_payment: true });
    const order = await createOrder();
    const before = await db("print_jobs").where({ type: "receipt" }).count("id as c").first();
    const pay = await asOwner(
      request(app)
        .post(`/api/v1/orders/${order.body.data.id}/payments`)
        .send({ method: "card", amount: Number(order.body.data.total) })
    );
    expect(pay.status).toBe(201);
    const after = await db("print_jobs").where({ type: "receipt" }).count("id as c").first();
    expect(Number(after!.c)).toBe(Number(before!.c) + 1);
    const job = await db("print_jobs").where({ type: "receipt" }).orderBy("created_at", "desc").first();
    const payload = typeof job.payload === "string" ? JSON.parse(job.payload) : job.payload;
    expect(payload.paper_width_mm).toBe(80);
    expect(payload.lines[payload.lines.length - 1]).toBe("شكرًا لاختيارك يا كبدة");
    await patchSettings({ auto_print_on_payment: false });
  });
});
