import { statfs } from "node:fs/promises";
import { Knex } from "knex";
import { AtomicFileStore, SystronicClient, type UpdateAdapter } from "@scc/client-sdk";
import { config } from "../config";

export type SccDiagnostics = {
  enabled: boolean;
  enrolled: boolean;
  environment: string;
  productCode: string;
  branchCode: string;
  lastHeartbeatAt: string | null;
  lastConnectionError: string | null;
  health: "healthy" | "degraded" | "unhealthy" | "unknown";
  updateChannel: string;
  backupStatus: string;
  deviceId: string | null;
  installationId: string | null;
  licenseState: string;
  pendingEvents: number;
  configVersion: number | null;
  sdkVersion: string;
  appVersion: string;
};

export interface SccIntegration {
  start(): Promise<void>;
  stop(): Promise<void>;
  heartbeat(): Promise<void>;
  reportBackup(input: { status: "succeeded" | "failed"; integrity: "verified" | "failed" | "unknown"; restoreTestedAt: string | null; locationClass: "local" | "customer_cloud" | "systronic_managed" }): Promise<void>;
  reportError(error: unknown, subsystem?: string): Promise<void>;
  diagnostics(): Promise<SccDiagnostics>;
  setEnabled(enabled: boolean): Promise<void>;
}

export class YakebdaUpdateAdapter implements UpdateAdapter {
  private version = config.sccAppVersion;
  private previous = this.version;
  constructor(private readonly db: Knex, private readonly maintenanceWindow: () => boolean = () => config.sccMaintenanceWindow) {}
  async currentVersion() { return this.version; }
  async canInstall() {
    if (!this.maintenanceWindow()) return false;
    const [activeOrders, openShifts, queuedPrints] = await Promise.all([
      this.db("orders").whereIn("status", ["submitted", "in_kitchen", "ready"]).count<{ count: string }>("id as count").first(),
      this.db("shifts").where({ status: "open" }).count<{ count: string }>("id as count").first(),
      this.db("print_jobs").whereIn("status", ["pending", "printing"]).count<{ count: string }>("id as count").first(),
    ]);
    return Number(activeOrders?.count ?? 0) === 0 && Number(openShifts?.count ?? 0) === 0 && Number(queuedPrints?.count ?? 0) === 0;
  }
  async prepare() { this.previous = this.version; }
  async install(_bytes: Uint8Array, version: string) { this.version = version; }
  async healthCheck() { try { await this.db.raw("select 1"); return true; } catch { return false; } }
  async rollback(version: string) { this.version = version || this.previous; }
}

export class YakebdaSccIntegration implements SccIntegration {
  private enabled = config.sccEnabled;
  private timer: NodeJS.Timeout | null = null;
  private lastHeartbeatAt: string | null = null;
  private lastConnectionError: string | null = null;
  private health: SccDiagnostics["health"] = "unknown";
  private updateChannel = config.sccUpdateChannel;
  private backupStatus = "unknown";
  readonly client: SystronicClient;

  constructor(private readonly db: Knex) {
    this.client = new SystronicClient({
      baseUrl: config.sccBaseUrl,
      productId: config.sccProductId,
      appVersion: config.sccAppVersion,
      sdkVersion: "0.1.0-pilot.1",
      store: new AtomicFileStore(config.sccStatePath),
      queueLimit: config.sccOfflineQueueLimit,
      timeoutMs: config.sccTimeoutMs,
    });
  }

  async start() {
    if (!this.enabled) return;
    try {
      try {
        await this.client.enrollment();
      } catch {
        if (config.sccEnrollmentToken && config.sccEnrollmentChallenge) {
          await this.client.enroll(config.sccEnrollmentToken, config.sccEnrollmentChallenge, "YAKEBDA SCC Pilot", { platform: process.platform, arch: process.arch });
        } else {
          this.lastConnectionError = "not_enrolled";
          return;
        }
      }
      void this.heartbeat();
      this.timer = setInterval(() => void this.heartbeat(), config.sccHeartbeatIntervalMs);
      this.timer.unref();
    } catch (error) {
      this.lastConnectionError = error instanceof Error ? error.message.slice(0, 160) : "scc_start_failed";
    }
  }

  async stop() { if (this.timer) clearInterval(this.timer); this.timer = null; }
  async setEnabled(enabled: boolean) { this.enabled = enabled; if (!enabled) await this.stop(); else if (!this.timer) await this.start(); }

  private async collectHealth() {
    let database = true;
    try { await this.db.raw("select 1"); } catch { database = false; }
    const [printers, failedPrints, activeKitchen, disk] = await Promise.all([
      this.db("hardware_endpoints").whereIn("kind", ["receipt_printer", "kitchen_printer"]).count<{ count: string }>("id as count").first().catch(() => ({ count: "0" })),
      this.db("print_jobs").where({ status: "failed" }).count<{ count: string }>("id as count").first().catch(() => ({ count: "0" })),
      this.db("orders").whereIn("status", ["submitted", "in_kitchen", "ready"]).count<{ count: string }>("id as count").first().catch(() => ({ count: "0" })),
      statfs(process.cwd()).catch(() => null),
    ]);
    const failedJobs = Number(failedPrints?.count ?? 0);
    const syncBacklog = Number(activeKitchen?.count ?? 0);
    const storageFreeMb = disk ? Math.floor((disk.bavail * disk.bsize) / 1024 / 1024) : 0;
    const nextHealth = !database ? "unhealthy" : failedJobs > 0 || storageFreeMb < 1024 ? "degraded" : "healthy";
    return { health: nextHealth as SccDiagnostics["health"], metrics: { database, printer: Number(printers?.count ?? 0) > 0 && failedJobs === 0, storageFreeMb, syncBacklog, failedJobs } };
  }

  async heartbeat() {
    if (!this.enabled) return;
    try {
      const result = await this.collectHealth();
      this.health = result.health;
      await this.client.heartbeat(result.health, result.metrics);
      this.lastHeartbeatAt = new Date().toISOString();
      this.lastConnectionError = null;
      try {
        const remote = await this.client.getConfig();
        this.applyRemoteConfig(remote.values);
      } catch { /* cached configuration remains authoritative */ }
      try { await this.client.refreshLicense(); } catch { /* cached signed grant remains authoritative offline */ }
    } catch (error) {
      this.lastConnectionError = error instanceof Error ? error.message.slice(0, 160) : "scc_unavailable";
    }
  }

  private applyRemoteConfig(values: Record<string, string | number | boolean>) {
    // Explicit YAKEBDA allowlist. Unknown keys and all code/path/delete semantics are ignored.
    const allowed = new Set(["updateChannel", "heartbeatIntervalSeconds", "diagnosticsLevel", "updatePreview", "backupWarningHours", "operatorBanner"]);
    if (Object.keys(values).some((key) => !allowed.has(key))) throw new Error("config_key_rejected");
    const channel = values.updateChannel;
    if (channel !== undefined && (typeof channel !== "string" || !["pilot", "stable"].includes(channel))) throw new Error("config_value_rejected");
    const interval = values.heartbeatIntervalSeconds;
    if (interval !== undefined && (typeof interval !== "number" || !Number.isInteger(interval) || interval < 30 || interval > 3600)) throw new Error("config_value_rejected");
    // Reserved, typed pilot keys accepted for diagnostics/reporting only.
    const level = values.diagnosticsLevel;
    if (level !== undefined && (typeof level !== "string" || !["minimal", "safe", "verbose"].includes(level))) throw new Error("config_value_rejected");
    const preview = values.updatePreview;
    if (preview !== undefined && typeof preview !== "boolean") throw new Error("config_value_rejected");
    const threshold = values.backupWarningHours;
    if (threshold !== undefined && (typeof threshold !== "number" || threshold < 1 || threshold > 168)) throw new Error("config_value_rejected");
    const banner = values.operatorBanner;
    if (banner !== undefined && (typeof banner !== "string" || banner.length > 240)) throw new Error("config_value_rejected");

    if (typeof channel === "string") this.updateChannel = channel;
    if (typeof interval === "number" && this.timer) {
      clearInterval(this.timer);
      this.timer = setInterval(() => void this.heartbeat(), interval * 1000);
      this.timer.unref();
    }
  }

  async reportBackup(input: { status: "succeeded" | "failed"; integrity: "verified" | "failed" | "unknown"; restoreTestedAt: string | null; locationClass: "local" | "customer_cloud" | "systronic_managed" }) {
    if (!this.enabled) return;
    this.backupStatus = `${input.status}/${input.integrity}`;
    try { await this.client.reportBackup(input); } catch { /* backup reporting never changes backup outcome */ }
  }

  async reportError(error: unknown, subsystem = "application") {
    if (!this.enabled) return;
    try {
      const source = error instanceof Error ? error : new Error("Unknown application error");
      await this.client.reportError({ severity: "error", code: "YAKEBDA_UNEXPECTED", type: source.name, message: source.message, stack: source.stack, metadata: { subsystem } });
    } catch { /* error reporting must never recurse or affect restaurant operations */ }
  }

  async diagnostics(): Promise<SccDiagnostics> {
    const sdk = await this.client.diagnostics();
    return { enabled: this.enabled, environment: config.sccEnvironment, productCode: config.sccProductCode, branchCode: config.sccBranchCode, lastHeartbeatAt: this.lastHeartbeatAt, lastConnectionError: this.lastConnectionError, health: this.health, updateChannel: this.updateChannel, backupStatus: this.backupStatus, ...sdk };
  }
}
