import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
import { config } from "../src/config";
import { makeKnex } from "../src/db/knex";
import { seedFoundation } from "../src/db/seedData";

const db = makeKnex(config.testDatabaseUrl);
let app: ReturnType<typeof createApp>;
let token = "";
let cashOrderId = "";
let cashShiftId = "";
let cashOriginalAmount = 0;
let cancelOrderId = "";

const auth = () => ({ Authorization: `Bearer ${token}` });

beforeAll(async () => {
  await db.migrate.rollback(undefined, true);
  await db.migrate.latest();
  const seed = await seedFoundation(db);
  app = createApp(db);

  const login = await request(app)
    .post("/api/v1/auth/login")
    .send({ email: seed.ownerEmail, password: seed.ownerPassword });
  expect(login.status).toBe(200);
  token = login.body.token;

  const cashPayment = await db("payments as p")
    .join("orders as o", "o.id", "p.order_id")
    .where("p.method", "cash")
    .where("p.amount", ">", 0)
    .whereNotNull("p.shift_id")
    .select("p.order_id", "p.shift_id", "p.amount")
    .first();
  cashOrderId = cashPayment.order_id;
  cashShiftId = cashPayment.shift_id;
  cashOriginalAmount = Number(cashPayment.amount);

  const cancelOrder = await db("orders as o")
    .join("payments as p", "p.order_id", "o.id")
    .where("o.status", "submitted")
    .where("p.amount", ">", 0)
    .whereNot("p.method", "unpaid")
    .select("o.id")
    .first();
  cancelOrderId = cancelOrder.id;
});

afterAll(async () => {
  await db.destroy();
});

describe("R6 financial reversals and shift close reliability", () => {
  it("creates an offsetting refund row and corrects shift cash", async () => {
    const before = await request(app).get(`/api/v1/shifts/${cashShiftId}/summary`).set(auth());
    expect(before.status).toBe(200);

    const response = await request(app)
      .post(`/api/v1/orders/${cashOrderId}/refund`)
      .set(auth())
      .send({ amount: 10, reason: "اختبار استرداد جزئي" });

    expect(response.status).toBe(201);
    expect(response.body.data.refund_amount).toBe(10);

    const payments = await db("payments").where({ order_id: cashOrderId }).orderBy("created_at", "asc");
    const refund = payments.find((payment) => payment.kind === "refund");
    expect(Number(refund.amount)).toBe(-10);
    expect(refund.reason).toBe("اختبار استرداد جزئي");
    expect(refund.reversal_of_payment_id).toBeTruthy();

    const net = payments.reduce((sum, payment) => sum + Number(payment.amount), 0);
    expect(net).toBe(cashOriginalAmount - 10);

    const after = await request(app).get(`/api/v1/shifts/${cashShiftId}/summary`).set(auth());
    expect(after.status).toBe(200);
    expect(after.body.data.totals.cash_sales).toBe(before.body.data.totals.cash_sales - 10);
  });

  it("rejects a refund above the net paid amount", async () => {
    const payments = await db("payments").where({ order_id: cashOrderId });
    const net = payments.reduce((sum, payment) => sum + Number(payment.amount), 0);

    const response = await request(app)
      .post(`/api/v1/orders/${cashOrderId}/refund`)
      .set(auth())
      .send({ amount: net + 1, reason: "قيمة أكبر من المدفوع" });

    expect(response.status).toBe(422);
    expect(response.body.details.amount).toBeTruthy();
  });

  it("cancels a paid order by preserving payment history and recording a full reversal", async () => {
    const before = await db("payments").where({ order_id: cancelOrderId });
    const originalPaid = before.reduce((sum, payment) => sum + Number(payment.amount), 0);
    expect(originalPaid).toBeGreaterThan(0);

    const response = await request(app)
      .patch(`/api/v1/orders/${cancelOrderId}/status`)
      .set(auth())
      .send({ status: "cancelled", cancel_reason: "إلغاء واختبار العكس المالي" });

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe("cancelled");

    const after = await db("payments").where({ order_id: cancelOrderId }).orderBy("created_at", "asc");
    expect(after.some((payment) => Number(payment.amount) > 0)).toBe(true);
    expect(after.some((payment) => payment.kind === "refund" && Number(payment.amount) < 0)).toBe(true);
    expect(after.reduce((sum, payment) => sum + Number(payment.amount), 0)).toBe(0);
  });

  it("persists variance and returns unsettled-order warnings on shift close", async () => {
    const current = await request(app).get(`/api/v1/shifts/${cashShiftId}/summary`).set(auth());
    expect(current.status).toBe(200);
    expect(current.body.data.unsettled_orders.length).toBeGreaterThan(0);

    const actualCash = current.body.data.totals.expected_cash + 5;
    const closed = await request(app)
      .post(`/api/v1/shifts/${cashShiftId}/close`)
      .set(auth())
      .send({ actual_cash: actualCash, notes: "إغلاق اختبار الاعتمادية" });

    expect(closed.status).toBe(200);
    expect(closed.body.data.variance).toBe(5);
    expect(closed.body.data.over_short).toBe("over");
    expect(closed.body.data.warnings[0].code).toBe("unsettled_orders");
    expect(closed.body.data.unsettled_orders.length).toBeGreaterThan(0);

    const stored = await db("shifts").where({ id: cashShiftId }).first();
    expect(Number(stored.variance)).toBe(5);
    expect(stored.over_short).toBe("over");
  });
});
