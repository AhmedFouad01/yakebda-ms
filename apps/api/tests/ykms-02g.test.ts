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
let accountId = "";

const asOwner = (r: request.Test) => r.set("Authorization", `Bearer ${ownerToken}`);

// جامع بايتات للاستجابات الثنائية (Excel)
function binaryParser(res: request.Response, cb: (err: Error | null, body: Buffer) => void) {
  const chunks: Buffer[] = [];
  res.on("data", (c: Buffer) => chunks.push(Buffer.from(c)));
  res.on("end", () => cb(null, Buffer.concat(chunks)));
}

beforeAll(async () => {
  await db.migrate.rollback(undefined, true);
  await db.migrate.latest();
  const seed = await seedFoundation(db);
  branchId = seed.branchId;
  accountId = seed.accountId;
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

describe("YKMS-02G — رفع صور الأصناف", () => {
  const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

  it("يرفع صورة صالحة ويحدّث image_url", async () => {
    const prod = await db("products").where({ name_ar: "بيبسي" }).first();
    const res = await asOwner(
      request(app).post("/api/v1/products/upload-image").send({ product_id: prod.id, mime: "image/png", data_base64: png })
    );
    expect(res.status).toBe(201);
    expect(res.body.data.url).toMatch(/^\/uploads\/products\//);
    const updated = await db("products").where({ id: prod.id }).first();
    expect(updated.image_url).toBe(res.body.data.url);
  });

  it("يرفض نوع MIME غير مسموح", async () => {
    const res = await asOwner(
      request(app).post("/api/v1/products/upload-image").send({ mime: "application/x-sh", data_base64: png })
    );
    expect(res.status).toBe(422);
  });

  it("يرفض صورة تتجاوز الحد", async () => {
    const big = Buffer.alloc(4 * 1024 * 1024).toString("base64");
    const res = await asOwner(
      request(app).post("/api/v1/products/upload-image").send({ mime: "image/png", data_base64: big })
    );
    expect(res.status).toBe(422);
  });
});

describe("YKMS-02G — استيراد/تصدير Excel", () => {
  it("يصدّر المنيو إلى ملف Excel", async () => {
    const res = await asOwner(request(app).get("/api/v1/products/export-excel")).buffer().parse(binaryParser);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("spreadsheet");
    expect((res.body as Buffer).length).toBeGreaterThan(100);
  });

  it("ينزّل قالبًا فارغًا", async () => {
    const res = await asOwner(request(app).get("/api/v1/products/import-template")).buffer().parse(binaryParser);
    expect(res.status).toBe(200);
    expect((res.body as Buffer).length).toBeGreaterThan(100);
  });

  it("معاينة الاستيراد (dry-run) لا تكتب شيئًا وتطابق بالـ SKU", async () => {
    const XLSX = await import("xlsx");
    await db("products").where({ name_ar: "بيبسي" }).update({ sku: "DRK-PEP" });
    const before = Number((await db("products").where({ account_id: accountId }).count("id as c"))[0].c);
    const aoa = [
      ["معرف الصنف", "الاسم بالعربية", "الاسم بالإنجليزية", "SKU", "الفئة", "السعر", "نشط", "ظاهر في الكاشير", "قابل للخصم", "زمن التحضير", "رابط الصورة", "الوصف", "المكونات", "الحجم/الحصة"],
      ["", "بيبسي", "", "DRK-PEP", "مشروبات", 14, "نعم", "نعم", "نعم", 5, "", "", "", ""],
      ["", "صنف اختبار جديد", "", "NEW-XL-1", "مشروبات", 8, "نعم", "نعم", "نعم", 3, "", "", "", ""],
      ["", "", "", "BAD", "مشروبات", 5, "نعم", "نعم", "نعم", 1, "", "", "", ""],
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "المنيو");
    const b64 = (XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer).toString("base64");

    const prev = await asOwner(request(app).post("/api/v1/products/import-excel").send({ mode: "preview", data_base64: b64 }));
    expect(prev.status).toBe(200);
    expect(prev.body.data.summary).toEqual({ created: 1, updated: 1, failed: 1, total: 3 });
    const updateRow = prev.body.data.rows.find((r: { action: string }) => r.action === "update");
    expect(updateRow.matched_by).toBe("sku");
    const after = Number((await db("products").where({ account_id: accountId }).count("id as c"))[0].c);
    expect(after).toBe(before); // dry-run لا يكتب

    const applied = await asOwner(request(app).post("/api/v1/products/import-excel").send({ mode: "apply", data_base64: b64 }));
    expect(applied.status).toBe(201);
    expect(applied.body.data.created).toBe(1);
    expect(applied.body.data.updated).toBe(1);
    const pep = await db("products").where({ sku: "DRK-PEP" }).first();
    expect(Number(pep.base_price)).toBe(14);
  });
});

describe("YKMS-02G-D — CRM تحليلات العملاء", () => {
  it("ملف العميل يجمّع الطلبات والإنفاق والصنف المفضّل", async () => {
    const cust = await asOwner(request(app).post("/api/v1/customers").send({ name: "عميل تحليلات", phone: "0155", is_vip: true, tags: "دائم", email: "z@z.com" }));
    expect(cust.status).toBe(201);
    expect(cust.body.data.is_vip).toBe(true);
    const cid = cust.body.data.id;
    const pepsi = await db("products").where({ name_ar: "بيبسي" }).first();
    for (let i = 0; i < 2; i++) {
      const o = await asOwner(request(app).post("/api/v1/orders").send({ branch_id: branchId, order_type: "takeaway", customer_id: cid, submit: true, items: [{ product_id: pepsi.id, qty: 2 }] }));
      await asOwner(request(app).patch(`/api/v1/orders/${o.body.data.id}/status`).send({ status: "in_kitchen" }));
      await asOwner(request(app).patch(`/api/v1/orders/${o.body.data.id}/status`).send({ status: "ready" }));
      await asOwner(request(app).patch(`/api/v1/orders/${o.body.data.id}/status`).send({ status: "completed" }));
    }
    const prof = await asOwner(request(app).get(`/api/v1/customers/${cid}`));
    expect(prof.status).toBe(200);
    const a = prof.body.data.analytics;
    expect(a.total_orders).toBe(2);
    expect(a.completed_orders).toBe(2);
    // الإنفاق موجب ومتوسط الطلب = الإجمالي/عدد المكتمل (بصرف النظر عن الرسوم/الضريبة)
    expect(a.total_spend).toBeGreaterThan(0);
    expect(a.avg_order_value).toBeCloseTo(a.total_spend / 2, 2);
    expect(a.favourite_product).toBe("بيبسي");
  });

  it("سجل طلبات العميل مصفح", async () => {
    const cust = await asOwner(request(app).post("/api/v1/customers").send({ name: "سجل", phone: "0166" }));
    const pepsi = await db("products").where({ name_ar: "بيبسي" }).first();
    await asOwner(request(app).post("/api/v1/orders").send({ branch_id: branchId, order_type: "takeaway", customer_id: cust.body.data.id, submit: true, items: [{ product_id: pepsi.id, qty: 1 }] }));
    const hist = await asOwner(request(app).get(`/api/v1/customers/${cust.body.data.id}/orders`));
    expect(hist.status).toBe(200);
    expect(hist.body.data.length).toBe(1);
  });

  it("قائمة العملاء خفيفة بلا تحليلات لكل صف", async () => {
    const list = await asOwner(request(app).get("/api/v1/customers"));
    expect(list.status).toBe(200);
    if (list.body.data.length) expect("analytics" in list.body.data[0]).toBe(false);
  });
});

describe("YKMS-02G-D — RBAC الأدوار والصلاحيات", () => {
  it("تحديث صلاحيات دور غير نظامي", async () => {
    const roles = await asOwner(request(app).get("/api/v1/roles"));
    const cashier = roles.body.data.find((r: { key: string }) => r.key === "cashier");
    const newPerms = [...new Set([...cashier.permissions, "reports.view"])];
    const upd = await asOwner(request(app).patch(`/api/v1/roles/${cashier.id}`).send({ permissions: newPerms }));
    expect(upd.status).toBe(200);
    const after = await asOwner(request(app).get("/api/v1/roles"));
    expect(after.body.data.find((r: { key: string }) => r.key === "cashier").permissions).toContain("reports.view");
  });

  it("يمنع تقليص صلاحيات المالك", async () => {
    const roles = await asOwner(request(app).get("/api/v1/roles"));
    const owner = roles.body.data.find((r: { key: string }) => r.key === "owner");
    const res = await asOwner(request(app).patch(`/api/v1/roles/${owner.id}`).send({ permissions: ["pos.use"] }));
    expect(res.status).toBe(422);
  });

  it("يمنع حذف أدوار النظام", async () => {
    const roles = await asOwner(request(app).get("/api/v1/roles"));
    const owner = roles.body.data.find((r: { key: string }) => r.key === "owner");
    const res = await asOwner(request(app).delete(`/api/v1/roles/${owner.id}`));
    expect(res.status).toBe(422);
  });

  it("يمنع إيقاف المالك الوحيد النشط", async () => {
    const users = await asOwner(request(app).get("/api/v1/users"));
    const ownerUser = users.body.data.find((u: { roles: Array<{ key: string }> }) => u.roles.some((r) => r.key === "owner"));
    const res = await asOwner(request(app).patch(`/api/v1/users/${ownerUser.id}`).send({ is_active: false }));
    expect(res.status).toBe(422);
  });

  it("يفرض الصلاحيات من الخلفية (كاشير يُمنع من users.manage)", async () => {
    await asOwner(request(app).post("/api/v1/users").send({ name: "كاشير اختبار", pin: "8888", role_keys: ["cashier"], branch_id: branchId }));
    const cashLogin = await request(app).post("/api/v1/auth/pin-login").send({ branch_id: branchId, pin: "8888" });
    const denied = await request(app).get("/api/v1/users").set("Authorization", `Bearer ${cashLogin.body.token}`);
    expect(denied.status).toBe(403);
  });

  it("تكرار دور مع صلاحياته", async () => {
    const roles = await asOwner(request(app).get("/api/v1/roles"));
    const manager = roles.body.data.find((r: { key: string }) => r.key === "manager");
    const dup = await asOwner(request(app).post(`/api/v1/roles/${manager.id}/duplicate`).send({ key: "manager_night", name_ar: "مدير وردية ليلية" }));
    expect(dup.status).toBe(201);
    const after = await asOwner(request(app).get("/api/v1/roles"));
    const copy = after.body.data.find((r: { key: string }) => r.key === "manager_night");
    expect(copy).toBeTruthy();
    expect(copy.permissions.length).toBe(manager.permissions.length);
  });
});
