import { AtomicFileStore, MemoryStore, SystronicClient, type UpdateAdapter } from "@scc/client-sdk";
import { resolve } from "node:path";

const base = (process.env.SCC_BASE_URL ?? "http://127.0.0.1:4000").replace(/\/$/, "");
const tenantId = process.env.SCC_TENANT_ID ?? "11111111-1111-4111-8111-111111111111";
const customerId = process.env.SCC_CUSTOMER_ID ?? "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const branchId = process.env.SCC_BRANCH_ID ?? "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const productId = process.env.SCC_PRODUCT_ID ?? "33333333-3333-4333-8333-333333333333";
const planId = process.env.SCC_PLAN_ID ?? "44444444-4444-4444-8444-444444444444";
const adminEmail = process.env.SCC_ADMIN_EMAIL ?? "admin@systronic.local";
const adminPassword = process.env.SCC_ADMIN_PASSWORD;

async function json(path: string, init: RequestInit = {}) {
  const response = await fetch(`${base}${path}`, init);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${path}:${response.status}:${JSON.stringify(body).slice(0, 300)}`);
  return body as any;
}

async function main() {
if (!adminPassword) throw new Error("SCC_ADMIN_PASSWORD is required");
const login = await json("/api/v1/auth/login", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ email: adminEmail, password: adminPassword, tenantId }),
});
const adminHeaders = { "content-type": "application/json", authorization: `Bearer ${login.token}` };
const post = (path: string, body: unknown) => json(path, { method: "POST", headers: adminHeaders, body: JSON.stringify(body) });

const enrollmentToken = await post("/api/v1/enrollment-tokens", { customerId, branchId, productId, expiresInMinutes: 60 });
const store = process.env.SCC_STATE_PATH ? new AtomicFileStore(resolve(process.env.SCC_STATE_PATH)) : new MemoryStore();
const client = new SystronicClient({
  baseUrl: base,
  productId,
  appVersion: "0.1.0",
  sdkVersion: "0.1.0-pilot.1",
  store,
  timeoutMs: 5_000,
});
const device = await client.enroll(enrollmentToken.token, enrollmentToken.challenge, "YAKEBDA SCC Pilot", { platform: process.platform, arch: process.arch });
const heartbeat = await client.heartbeat("healthy", { database: true, printer: true, storageFreeMb: 2048, syncBacklog: 0, failedJobs: 0 });

const expiry = new Date(Date.now() + 30 * 86400000).toISOString();
const subscription = await post("/api/v1/subscriptions", { customerId, planId, status: "active", expiresAt: expiry });
await post("/api/v1/licenses", {
  customerId,
  subscriptionId: subscription.id,
  productId,
  deviceId: device.deviceId,
  installationId: device.installationId,
  modules: ["monitoring", "backup", "updates"],
  validDays: 20,
  offlineDays: 14,
  idempotencyKey: `yakebda-pilot-${device.installationId}`,
});
await client.refreshLicense();
const license = await client.validateLicense();

await client.reportError({
  severity: "critical",
  code: "YAKEBDA_PILOT_PROBE",
  type: "PilotProbe",
  message: "Controlled SCC pilot diagnostic",
  metadata: { subsystem: "integration-test", password: "must-be-redacted", order: { id: "must-not-leak" } },
});
await client.reportBackup({ status: "succeeded", integrity: "verified", restoreTestedAt: new Date().toISOString(), locationClass: "local" });

const configVersion = Math.floor(Date.now() / 1000);
await post("/api/v1/configuration", {
  productId,
  config: { version: configVersion, values: { updateChannel: "pilot", heartbeatIntervalSeconds: 60, diagnosticsLevel: "safe", updatePreview: true, backupWarningHours: 24 } },
  reason: "YAKEBDA controlled pilot configuration",
});
const remoteConfig = await client.getConfig();

const suffix = Date.now();
const artifact = Buffer.from(`yakebda-pilot-${suffix}`);
const release = await post("/api/v1/releases", {
  productId,
  version: `0.1.1-pilot.${suffix}`,
  channel: "pilot",
  notes: "YAKEBDA controlled pilot artifact",
  minimumVersion: "0.1.0",
  artifactBase64: artifact.toString("base64"),
});
const rollout = await post("/api/v1/rollouts", { releaseId: release.id, targetPercent: 100, failureThreshold: 20, reason: "YAKEBDA controlled pilot rollout" });
const offer = await client.checkUpdate();
if (!offer || offer.rolloutId !== rollout.id) throw new Error("update_offer_missing");
let installedVersion = "0.1.0";
const adapter: UpdateAdapter = {
  currentVersion: async () => installedVersion,
  canInstall: async () => true,
  prepare: async () => undefined,
  install: async (_bytes, version) => { installedVersion = version; },
  healthCheck: async () => true,
  rollback: async (version) => { installedVersion = version; },
};
const update = await client.executeUpdate(offer, adapter);

const [fleet, backups, groups, tickets, audits] = await Promise.all([
  json("/api/v1/devices", { headers: adminHeaders }),
  json("/api/v1/backups", { headers: adminHeaders }),
  json("/api/v1/error-groups", { headers: adminHeaders }),
  json("/api/v1/tickets", { headers: adminHeaders }),
  json("/api/v1/audit-events", { headers: adminHeaders }),
]);
const checks = {
  enrolled: fleet.data.some((item: any) => item.id === device.deviceId),
  heartbeatSent: heartbeat.sent === 1,
  licenseValid: license.valid,
  configurationApplied: remoteConfig.version === configVersion,
  backupVisible: backups.data.some((item: any) => item.installationId === device.installationId && item.integrity === "verified"),
  errorGrouped: groups.data.some((item: any) => item.title === "PilotProbe: YAKEBDA_PILOT_PROBE"),
  ticketCreated: tickets.data.some((item: any) => item.priority === "P1"),
  updateSucceeded: update.succeeded,
  auditRecorded: audits.data.some((item: any) => item.action === "device.enrolled"),
};
if (Object.values(checks).some((value) => !value)) throw new Error(`pilot_checks_failed:${JSON.stringify(checks)}`);
process.stdout.write(JSON.stringify({ ok: true, deviceId: device.deviceId, installationId: device.installationId, subscriptionId: subscription.id, rolloutId: rollout.id, checks }, null, 2) + "\n");
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : "scc_pilot_failed"}\n`);
  process.exitCode = 1;
});
