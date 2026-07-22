import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { makeKnex } from "../src/db/knex";
import { createApp } from "../src/app";
import { seedFoundation } from "../src/db/seedData";
import { config } from "../src/config";
import type { SccDiagnostics, SccIntegration } from "../src/scc/integration";

const db = makeKnex(config.testDatabaseUrl);
let ownerToken = "";
const state: SccDiagnostics = {
  enabled: true, enrolled: true, environment: "test", productCode: "YAKEBDA_MS", branchCode: "PILOT-01",
  lastHeartbeatAt: null, lastConnectionError: null, health: "healthy", updateChannel: "pilot", backupStatus: "unknown",
  deviceId: "device-1", installationId: "installation-1", licenseState: "ValidOffline", pendingEvents: 0,
  configVersion: 1, sdkVersion: "0.1.0-pilot.1", appVersion: "0.1.0",
};
const integration: SccIntegration = {
  start: vi.fn(), stop: vi.fn(),
  heartbeat: vi.fn(async () => { state.lastHeartbeatAt = new Date().toISOString(); }),
  reportError: vi.fn(),
  reportBackup: vi.fn(async (input) => { state.backupStatus = `${input.status}/${input.integrity}`; }),
  diagnostics: vi.fn(async () => ({ ...state })),
  setEnabled: vi.fn(async (enabled) => { state.enabled = enabled; }),
};
let app: ReturnType<typeof createApp>;

beforeAll(async () => {
  await db.migrate.rollback(undefined, true);
  await db.migrate.latest();
  const seed = await seedFoundation(db);
  app = createApp(db, { sccIntegration: integration });
  const login = await request(app).post("/api/v1/auth/login").send({ email: seed.ownerEmail, password: seed.ownerPassword });
  ownerToken = login.body.token;
});
afterAll(async () => db.destroy());
const owner = (call: request.Test) => call.set("Authorization", `Bearer ${ownerToken}`);

describe("SCC integration routes", () => {
  it("exposes safe diagnostics and manually triggers a heartbeat", async () => {
    expect((await owner(request(app).get("/api/v1/scc/diagnostics"))).body.data.enrolled).toBe(true);
    const response = await owner(request(app).post("/api/v1/scc/heartbeat").send({}));
    expect(response.status).toBe(202);
    expect(integration.heartbeat).toHaveBeenCalledOnce();
  });

  it("validates and forwards backup posture", async () => {
    expect((await owner(request(app).post("/api/v1/scc/backup-status").send({ status: "maybe" }))).status).toBe(422);
    const response = await owner(request(app).post("/api/v1/scc/backup-status").send({ status: "succeeded", integrity: "verified", restoreTestedAt: null, locationClass: "local" }));
    expect(response.status).toBe(202);
    expect(response.body.data.backupStatus).toBe("succeeded/verified");
  });

  it("requires a boolean runtime enable switch", async () => {
    expect((await owner(request(app).post("/api/v1/scc/enabled").send({ enabled: "yes" }))).status).toBe(422);
    const response = await owner(request(app).post("/api/v1/scc/enabled").send({ enabled: false }));
    expect(response.status).toBe(200);
    expect(response.body.data.enabled).toBe(false);
  });
});
