import { Request, Response } from "express";
import { Knex } from "knex";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApiErrorHandler, createApp } from "../src/app";
import { ar } from "../src/i18n/ar";
import {
  createStructuredLogger,
  redactSensitive,
  StructuredLogEntry,
} from "../src/lib/observability";

function fakeDb(): Knex {
  return { raw: vi.fn().mockResolvedValue({ rows: [{ ok: 1 }] }) } as unknown as Knex;
}

function captureLogs() {
  const entries: StructuredLogEntry[] = [];
  return {
    entries,
    sink: { write: (entry: StructuredLogEntry) => entries.push(entry) },
  };
}

describe("R11 request correlation and structured logging", () => {
  it("accepts a bounded request id and returns it in the response", async () => {
    const logs = captureLogs();
    const response = await request(createApp(fakeDb(), { logSink: logs.sink }))
      .get("/api/v1/health")
      .set("x-request-id", "operator-check.123");

    expect(response.status).toBe(200);
    expect(response.headers["x-request-id"]).toBe("operator-check.123");
    expect(logs.entries.at(-1)).toMatchObject({
      event: "http.request.completed",
      request_id: "operator-check.123",
      method: "GET",
      route: "/api/v1/health",
      status_code: 200,
    });
  });

  it("replaces malformed or oversized request ids", async () => {
    const app = createApp(fakeDb(), { logSink: captureLogs().sink });
    for (const incoming of ["unsafe request id", "x".repeat(129)]) {
      const response = await request(app).get("/api/v1/health").set("x-request-id", incoming);
      expect(response.headers["x-request-id"]).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
      );
      expect(response.headers["x-request-id"]).not.toBe(incoming);
    }
  });

  it("does not trust identity metadata supplied through headers", async () => {
    const logs = captureLogs();
    await request(createApp(fakeDb(), { logSink: logs.sink }))
      .get("/api/v1/health")
      .set("x-account-id", "forged-account")
      .set("x-branch-id", "forged-branch")
      .set("x-user-id", "forged-user");

    const serialized = JSON.stringify(logs.entries);
    expect(serialized).not.toContain("forged-account");
    expect(serialized).not.toContain("forged-branch");
    expect(serialized).not.toContain("forged-user");
  });

  it("never logs request bodies or secret header values", async () => {
    const logs = captureLogs();
    await request(createApp(fakeDb(), { logSink: logs.sink }))
      .post("/api/v1/not-a-route")
      .set("authorization", "Bearer never-log-this-token")
      .set("cookie", "session=never-log-this-cookie")
      .send({ password: "never-log-this-password", pin: "9876" });

    const serialized = JSON.stringify(logs.entries);
    expect(serialized).not.toContain("never-log-this-token");
    expect(serialized).not.toContain("never-log-this-cookie");
    expect(serialized).not.toContain("never-log-this-password");
    expect(serialized).not.toContain("9876");
  });

  it("redacts nested and embedded secret-like values", () => {
    const redacted = redactSensitive({
      authorization: "Bearer top-secret",
      nested: { password: "secret-password", note: "token=secret-token" },
      payment: { card_number: "4111111111111111", cvv: "123" },
      bank: { iban: "EG000000000000000000000000000", account_number: "123456789" },
    });
    const serialized = JSON.stringify(redacted);
    expect(serialized).not.toContain("top-secret");
    expect(serialized).not.toContain("secret-password");
    expect(serialized).not.toContain("secret-token");
    expect(serialized).not.toContain("4111111111111111");
    expect(serialized).not.toContain("EG000000000000000000000000000");
    expect(serialized).not.toContain("123456789");
    expect(serialized).not.toContain('"123"');
  });

  it("returns unexpected errors safely with the request id", () => {
    const logs = captureLogs();
    const logger = createStructuredLogger(logs.sink);
    const json = vi.fn();
    const status = vi.fn(() => ({ json }));
    const req = {
      requestId: "failed-request-123",
      method: "GET",
      originalUrl: "/api/v1/failure?secret=hidden",
    } as Request;
    const res = { status } as unknown as Response;

    createApiErrorHandler(logger)(new Error("password=must-not-leak"), req, res, vi.fn());

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({
      code: "server",
      message: ar.errors.server,
      request_id: "failed-request-123",
    });
    expect(logs.entries).toContainEqual(
      expect.objectContaining({
        event: "http.request.failed",
        request_id: "failed-request-123",
        error_name: "Error",
      })
    );
    expect(JSON.stringify(logs.entries)).not.toContain("must-not-leak");
  });

  it("keeps expected Arabic API errors unchanged", async () => {
    const logs = captureLogs();
    const response = await request(createApp(fakeDb(), { logSink: logs.sink })).get("/api/v1/branches");
    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      code: "unauthorized",
      message: ar.errors.unauthorized,
    });
    expect(logs.entries.some((entry) => entry.event === "http.request.failed")).toBe(false);
  });
});

describe("R11 liveness and readiness", () => {
  it("keeps liveness independent from the database", async () => {
    const db = fakeDb();
    const response = await request(createApp(db, { logSink: captureLogs().sink })).get(
      "/api/v1/health/live"
    );

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ ok: true, status: "live", locale: "ar", dir: "rtl" });
    expect(db.raw).not.toHaveBeenCalled();
  });

  it("reports ready only after the database check succeeds", async () => {
    const db = fakeDb();
    const response = await request(createApp(db, { logSink: captureLogs().sink })).get(
      "/api/v1/health/ready"
    );

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ ok: true, status: "ready" });
    expect(db.raw).toHaveBeenCalledWith("select 1 as ready");
  });

  it("returns a safe 503 when the database check fails", async () => {
    const db = fakeDb();
    vi.mocked(db.raw).mockRejectedValueOnce(new Error("password=database-secret"));
    const logs = captureLogs();
    const response = await request(createApp(db, { logSink: logs.sink }))
      .get("/api/v1/health/ready")
      .set("x-request-id", "readiness-failure-123");

    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      ok: false,
      status: "not_ready",
      request_id: "readiness-failure-123",
    });
    expect(logs.entries).toContainEqual(
      expect.objectContaining({
        event: "health.readiness.failed",
        request_id: "readiness-failure-123",
        reason: "database_unavailable",
      })
    );
    expect(JSON.stringify(response.body)).not.toContain("database-secret");
    expect(JSON.stringify(logs.entries)).not.toContain("database-secret");
  });

  it("bounds the database readiness check with a timeout", async () => {
    const db = fakeDb();
    vi.mocked(db.raw).mockReturnValueOnce(new Promise(() => {}) as ReturnType<Knex["raw"]>);
    const logs = captureLogs();
    const response = await request(
      createApp(db, { logSink: logs.sink, readinessTimeoutMs: 5 })
    ).get("/api/v1/health/ready");

    expect(response.status).toBe(503);
    expect(logs.entries).toContainEqual(
      expect.objectContaining({ event: "health.readiness.failed", reason: "timeout" })
    );
  });
});
