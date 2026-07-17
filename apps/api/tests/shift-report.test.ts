import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
import { config } from "../src/config";
import { makeKnex } from "../src/db/knex";
import { seedFoundation } from "../src/db/seedData";
import { newId } from "../src/lib/ids";
import { renderShiftReportPayload } from "../src/lib/receipt";

const db = makeKnex(config.testDatabaseUrl);
let app: ReturnType<typeof createApp>;
let ownerToken = "";
let bridgeToken = "";
let branchId = "";
let deviceId = "";
let endpointId = "";
let shiftId = "";

const ownerAuth = () => ({ Authorization: `Bearer ${ownerToken}` });
const bridgeAuth = () => ({ Authorization: `Bearer ${bridgeToken}` });

beforeAll(async () => {
  await db.migrate.rollback(undefined, true);
  await db.migrate.latest();
  const seed = await seedFoundation(db);
  branchId = seed.branchId;
  app = createApp(db);
  const login = await request(app).post("/api/v1/auth/login").send({ email: seed.ownerEmail, password: seed.ownerPassword });
  ownerToken = login.body.token;
  const endpoint = await db("hardware_endpoints").where({ branch_id: branchId, kind: "receipt_printer" }).whereNotNull("device_id").first();
  endpointId = endpoint.id;
  deviceId = endpoint.device_id;
  const client = await request(app).post("/api/v1/api-clients").set(ownerAuth()).send({ name: "Shift report bridge", kind: "bridge" });
  const bridge = await request(app).post(`/api/v1/api-clients/${client.body.data.id}/tokens`).set(ownerAuth()).send({ name: "Shift report token", scopes: ["bridge"] });
  bridgeToken = bridge.body.data.token;
  const opened = await request(app).post("/api/v1/shifts/open").set(ownerAuth()).send({ branch_id: branchId, opening_cash: 0 });
  shiftId = opened.body.data.id;
  const closed = await request(app).post(`/api/v1/shifts/${shiftId}/close`).set(ownerAuth()).send({ actual_cash: 0 });
  expect(closed.status).toBe(200);
});

afterAll(async () => {
  await db.destroy();
});

describe("Shift close-out report bridge contract", () => {
  it("renders an RTL report with totals and variance", () => {
    const payload = renderShiftReportPayload({
      branch_name: "Main branch",
      cashier_name: "Owner",
      opened_at: "2026-07-16T08:00:00.000Z",
      closed_at: "2026-07-16T20:00:00.000Z",
      status: "closed",
      opening_cash: 100,
      totals: { cash_sales: 500, card_sales: 200, wallet_sales: 0, cash_in: 0, cash_out: 50, expected_cash: 550, orders_count: 12 },
      actual_cash: 540,
      variance: -10,
      over_short: "short",
      unsettled_count: 2,
    });
    expect(payload).toMatchObject({ template: "shift_report_v1", dir: "rtl", paper_width_mm: 80 });
    expect(payload.lines.join("\n")).toContain("عدد الطلبات: 12");
    expect(payload.lines.join("\n")).toContain("عجز");
  });

  it("queues, claims, retries, and prints the report through the generic bridge", async () => {
    const queued = await request(app).post(`/api/v1/shifts/${shiftId}/print`).set(ownerAuth());
    expect(queued.status).toBe(201);
    expect(queued.body.data.type).toBe("shift_report");
    const firstPoll = await request(app).get(`/api/v1/bridge/print-jobs?device_id=${deviceId}`).set(bridgeAuth());
    const claimed = firstPoll.body.data.find((job: { id: string }) => job.id === queued.body.data.id);
    expect(claimed).toBeTruthy();
    const payload = typeof claimed.payload === "string" ? JSON.parse(claimed.payload) : claimed.payload;
    expect(payload.template).toBe("shift_report_v1");
    expect(Array.isArray(payload.lines)).toBe(true);

    const failed = await request(app).post(`/api/v1/bridge/print-jobs/${claimed.id}/result`).set(bridgeAuth()).send({ status: "failed", error: "temporary printer failure" });
    expect(failed.body).toMatchObject({ status: "pending", retry_scheduled: true });
    const secondPoll = await request(app).get(`/api/v1/bridge/print-jobs?device_id=${deviceId}`).set(bridgeAuth());
    expect(secondPoll.body.data.some((job: { id: string }) => job.id === claimed.id)).toBe(true);
    const printed = await request(app).post(`/api/v1/bridge/print-jobs/${claimed.id}/result`).set(bridgeAuth()).send({ status: "printed" });
    expect(printed.body).toMatchObject({ status: "printed", retry_scheduled: false });
  });

  it("uses the existing terminal dead state for exhausted report jobs", async () => {
    const queued = await request(app).post(`/api/v1/shifts/${shiftId}/print`).set(ownerAuth());
    await db("print_jobs").where({ id: queued.body.data.id }).update({ attempts: config.maxPrintAttempts - 1 });
    await request(app).get(`/api/v1/bridge/print-jobs?device_id=${deviceId}`).set(bridgeAuth());
    const failed = await request(app).post(`/api/v1/bridge/print-jobs/${queued.body.data.id}/result`).set(bridgeAuth()).send({ status: "failed", error: "terminal printer failure" });
    expect(failed.body).toMatchObject({ status: "dead", retry_scheduled: false });
  });

  it("rejects missing printers and unknown shifts without bypassing scope", async () => {
    await db("hardware_endpoints").where({ id: endpointId }).update({ is_active: false });
    expect((await request(app).post(`/api/v1/shifts/${shiftId}/print`).set(ownerAuth())).status).toBe(422);
    expect((await request(app).post(`/api/v1/shifts/${newId()}/print`).set(ownerAuth())).status).toBe(404);
  });
});
