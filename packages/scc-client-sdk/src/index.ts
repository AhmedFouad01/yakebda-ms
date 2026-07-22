import {
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  randomUUID,
  sign,
  verify,
  type JsonWebKey,
} from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export interface SecureStore {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T): Promise<void>;
}

export class MemoryStore implements SecureStore {
  private readonly values = new Map<string, unknown>();
  async get<T>(key: string) { return this.values.get(key) as T | undefined; }
  async set<T>(key: string, value: T) { this.values.set(key, value); }
}

/** Pilot-only file store. Production Windows clients must replace this with DPAPI/OS custody. */
export class AtomicFileStore implements SecureStore {
  constructor(private readonly path: string) {}
  private async read(): Promise<Record<string, unknown>> {
    try { return JSON.parse(await readFile(this.path, "utf8")); } catch { return {}; }
  }
  async get<T>(key: string) { return (await this.read())[key] as T | undefined; }
  async set<T>(key: string, value: T) {
    const state = await this.read();
    state[key] = value;
    await mkdir(dirname(this.path), { recursive: true });
    const temporary = `${this.path}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify(state), { mode: 0o600 });
    await rename(temporary, this.path);
  }
}

export type Enrollment = {
  tenantId: string;
  deviceId: string;
  installationId: string;
  credential: string;
  productId: string;
};
type Identity = { publicJwk: JsonWebKey; privateJwk: JsonWebKey };
type EventKind = "heartbeat" | "error" | "backup";
type QueueItem = { id: string; kind: EventKind; payload: unknown; attempts: number; nextAt: number };
export type LicenseState = "Valid" | "ValidOffline" | "GracePeriod" | "Expired" | "Invalid";
export type RemoteConfig = { version: number; values: Record<string, string | number | boolean>; activateAt?: string };

export type ClientOptions = {
  baseUrl: string;
  productId: string;
  appVersion: string;
  sdkVersion: string;
  store: SecureStore;
  queueLimit?: number;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  now?: () => Date;
};

const forbiddenConfig = /(command|script|shell|sql|executable|powershell|path|delete)/i;
const sensitiveKey = /(password|token|secret|authorization|api[_-]?key|connection[_-]?string|customer|order|payment)/i;
const sensitiveText = /(Bearer\s+)[A-Za-z0-9._~-]+|((password|token|secret|api[_-]?key)\s*[:=]\s*)[^\s,;]+/gi;

export function sanitize<T>(input: T): T {
  const visit = (value: unknown, key = ""): unknown => {
    if (sensitiveKey.test(key)) return "[REDACTED]";
    if (typeof value === "string") return value.replace(sensitiveText, "$1$2[REDACTED]").slice(0, 16_000);
    if (Array.isArray(value)) return value.slice(0, 100).map((item) => visit(item));
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).slice(0, 100).map(([k, v]) => [k, visit(v, k)]));
    return value;
  };
  return visit(input) as T;
}

export function validateRemoteConfig(value: unknown): RemoteConfig {
  if (!value || typeof value !== "object") throw new Error("config_invalid");
  const input = value as Record<string, unknown>;
  if (!Number.isInteger(input.version) || Number(input.version) < 1 || !input.values || typeof input.values !== "object" || Array.isArray(input.values)) throw new Error("config_invalid");
  const values = input.values as Record<string, unknown>;
  if (Object.keys(values).length > 64) throw new Error("config_too_large");
  for (const [key, item] of Object.entries(values)) {
    if (!/^[a-z][A-Za-z0-9_.-]{1,63}$/.test(key) || forbiddenConfig.test(key)) throw new Error("config_key_rejected");
    if (!["string", "number", "boolean"].includes(typeof item) || (typeof item === "string" && item.length > 500)) throw new Error("config_value_rejected");
  }
  return input as RemoteConfig;
}

export class SystronicClient {
  private readonly queueLimit: number;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => Date;
  constructor(private readonly options: ClientOptions) {
    this.queueLimit = Math.min(5_000, Math.max(10, options.queueLimit ?? 1_000));
    this.timeoutMs = Math.min(30_000, Math.max(250, options.timeoutMs ?? 5_000));
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.now = options.now ?? (() => new Date());
  }

  async identity(): Promise<Identity> {
    const existing = await this.options.store.get<Identity>("identity");
    if (existing) return existing;
    const pair = generateKeyPairSync("ed25519");
    const identity = {
      publicJwk: pair.publicKey.export({ format: "jwk" }),
      privateJwk: pair.privateKey.export({ format: "jwk" }),
    };
    await this.options.store.set("identity", identity);
    return identity;
  }

  async enroll(token: string, challenge: string, label: string, fingerprintSignals: Record<string, string> = {}) {
    const identity = await this.identity();
    const proof = sign(null, Buffer.from(challenge), createPrivateKey({ key: identity.privateJwk, format: "jwk" })).toString("base64url");
    const enrollment = await this.request<Enrollment>("/device/v1/enrollments/exchange", {
      method: "POST",
      headers: { "Idempotency-Key": randomUUID() },
      body: JSON.stringify({ token, challenge, publicKey: identity.publicJwk, proof, productId: this.options.productId, sdkVersion: this.options.sdkVersion, appVersion: this.options.appVersion, label, fingerprintSignals: sanitize(fingerprintSignals) }),
    }, false);
    await this.options.store.set("enrollment", enrollment);
    return enrollment;
  }

  async enrollment() {
    const value = await this.options.store.get<Enrollment>("enrollment");
    if (!value) throw new Error("not_enrolled");
    return value;
  }

  async enqueue(kind: EventKind, payload: unknown) {
    const queue = (await this.options.store.get<QueueItem[]>("queue")) ?? [];
    queue.push({ id: randomUUID(), kind, payload: sanitize(payload), attempts: 0, nextAt: Date.now() });
    while (queue.length > this.queueLimit) queue.shift();
    await this.options.store.set("queue", queue);
  }

  async heartbeat(health: "healthy" | "degraded" | "unhealthy" | "unknown", metrics: Record<string, unknown>) {
    const enrollment = await this.enrollment();
    await this.enqueue("heartbeat", { eventId: randomUUID(), occurredAt: this.now().toISOString(), installationId: enrollment.installationId, appVersion: this.options.appVersion, sdkVersion: this.options.sdkVersion, health, metrics });
    return this.flush();
  }

  async reportError(input: { severity: "critical" | "error" | "warning" | "info"; code: string; type: string; message: string; stack?: string; metadata?: Record<string, unknown> }) {
    const enrollment = await this.enrollment();
    await this.enqueue("error", { eventId: randomUUID(), occurredAt: this.now().toISOString(), installationId: enrollment.installationId, ...sanitize(input) });
    return this.flush();
  }

  async reportBackup(input: { status: "succeeded" | "failed"; integrity: "verified" | "failed" | "unknown"; restoreTestedAt: string | null; locationClass: "local" | "customer_cloud" | "systronic_managed" }) {
    const enrollment = await this.enrollment();
    await this.options.store.set("lastBackup", input);
    await this.enqueue("backup", { eventId: randomUUID(), occurredAt: this.now().toISOString(), installationId: enrollment.installationId, ...input });
    return this.flush();
  }

  async flush() {
    const queue = (await this.options.store.get<QueueItem[]>("queue")) ?? [];
    const remaining: QueueItem[] = [];
    for (const item of queue) {
      if (item.nextAt > Date.now()) { remaining.push(item); continue; }
      try {
        const path = item.kind === "heartbeat" ? "/device/v1/heartbeats:batch" : item.kind === "error" ? "/device/v1/errors:batch" : "/device/v1/backups:batch";
        await this.request(path, { method: "POST", headers: { "Idempotency-Key": item.id }, body: JSON.stringify({ events: [item.payload] }) });
      } catch {
        item.attempts += 1;
        item.nextAt = Date.now() + Math.min(60_000, 500 * 2 ** item.attempts) + Math.floor(Math.random() * 250);
        remaining.push(item);
      }
    }
    await this.options.store.set("queue", remaining);
    return { sent: queue.length - remaining.length, pending: remaining.length };
  }

  async refreshLicense() {
    const license = await this.request<{ grant: string; publicKey: JsonWebKey }>("/device/v1/license", { method: "GET" });
    await this.options.store.set("license", license);
    await this.options.store.set("lastOnlineValidation", this.now().toISOString());
    return license;
  }

  async validateLicense(now = this.now()): Promise<{ valid: boolean; state: LicenseState; reason: string; grant?: Record<string, unknown> }> {
    const cached = await this.options.store.get<{ grant: string; publicKey: JsonWebKey }>("license");
    if (!cached) return { valid: false, state: "Invalid", reason: "no_cached_grant" };
    try {
      const [header, payload, signature] = cached.grant.split(".");
      if (!header || !payload || !signature) throw new Error("malformed");
      const valid = verify(null, Buffer.from(`${header}.${payload}`), createPublicKey({ key: cached.publicKey, format: "jwk" }), Buffer.from(signature, "base64url"));
      if (!valid) throw new Error("signature");
      const grant = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Record<string, unknown>;
      const enrollment = await this.enrollment();
      if (grant.deviceId !== enrollment.deviceId) return { valid: false, state: "Invalid", reason: "wrong_device" };
      if (grant.productId !== this.options.productId) return { valid: false, state: "Invalid", reason: "wrong_product" };
      const time = now.getTime(), expires = Date.parse(String(grant.expiresAt)), grace = Date.parse(String(grant.graceUntil)), offline = Date.parse(String(grant.offlineUntil));
      if (time <= expires && time <= offline) return { valid: true, state: "ValidOffline", reason: "signed_grant_valid", grant };
      if (time <= grace && time <= offline) return { valid: true, state: "GracePeriod", reason: "within_grace", grant };
      return { valid: false, state: "Expired", reason: "expired", grant };
    } catch { return { valid: false, state: "Invalid", reason: "invalid_signature" }; }
  }

  async getConfig() {
    try {
      const next = validateRemoteConfig(await this.request("/device/v1/configuration", { method: "GET" }));
      const current = await this.options.store.get<RemoteConfig>("config");
      if (current && next.version < current.version) return current;
      await this.options.store.set("config", next);
      return next;
    } catch (error) {
      const cached = await this.options.store.get<RemoteConfig>("config");
      if (cached) return cached;
      throw error;
    }
  }

  async checkUpdate() { return this.request<UpdateOffer | null>("/device/v1/updates/check", { method: "GET" }); }
  async executeUpdate(offer: UpdateOffer, adapter: UpdateAdapter) {
    if (offer.productId !== this.options.productId) throw new Error("update_wrong_product");
    const bytes = Buffer.from(offer.artifactBase64, "base64");
    const checksum = createHash("sha256").update(bytes).digest("hex");
    if (checksum !== offer.checksum) throw new Error("artifact_checksum_invalid");
    if (!verify(null, Buffer.from(offer.checksum), createPublicKey({ key: offer.publicKey, format: "jwk" }), Buffer.from(offer.signature, "base64url"))) throw new Error("artifact_signature_invalid");
    if (!(await adapter.canInstall())) throw new Error("update_unsafe_state");
    const previous = await adapter.currentVersion();
    try {
      await adapter.prepare();
      await adapter.install(bytes, offer.version);
      if (!(await adapter.healthCheck())) throw new Error("post_install_health_failed");
      await this.updateStatus(offer.rolloutId, "succeeded");
      return { succeeded: true, version: offer.version };
    } catch (error) {
      await adapter.rollback(previous);
      await this.updateStatus(offer.rolloutId, "rolled_back", error instanceof Error ? error.message : "update_failed");
      return { succeeded: false, version: previous };
    }
  }

  async diagnostics() {
    const queue = (await this.options.store.get<QueueItem[]>("queue")) ?? [];
    const enrollment = await this.options.store.get<Enrollment>("enrollment");
    const license = await this.validateLicense();
    const config = await this.options.store.get<RemoteConfig>("config");
    const lastBackup = await this.options.store.get<{ status: string; integrity: string }>("lastBackup");
    return { enrolled: !!enrollment, deviceId: enrollment?.deviceId ?? null, installationId: enrollment?.installationId ?? null, licenseState: license.state, pendingEvents: queue.length, configVersion: config?.version ?? null, backupStatus: lastBackup ? `${lastBackup.status}/${lastBackup.integrity}` : "unknown", sdkVersion: this.options.sdkVersion, appVersion: this.options.appVersion };
  }

  private async updateStatus(rolloutId: string, status: string, failureReason?: string) {
    await this.request("/device/v1/updates/status", { method: "POST", headers: { "Idempotency-Key": randomUUID() }, body: JSON.stringify({ rolloutId, status, failureReason }) });
  }
  private async request<T = unknown>(path: string, init: RequestInit, auth = true): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set("content-type", "application/json");
    headers.set("x-correlation-id", randomUUID());
    if (auth) headers.set("authorization", `Bearer ${(await this.enrollment()).credential}`);
    const response = await this.fetchImpl(`${this.options.baseUrl}${path}`, { ...init, headers, signal: AbortSignal.timeout(this.timeoutMs) });
    if (!response.ok) throw new Error(`scc_http_${response.status}`);
    return (response.status === 204 ? null : await response.json()) as T;
  }
}

export type UpdateOffer = { rolloutId: string; version: string; productId: string; artifactBase64: string; checksum: string; signature: string; publicKey: JsonWebKey };
export interface UpdateAdapter {
  currentVersion(): Promise<string>;
  canInstall(): Promise<boolean>;
  prepare(): Promise<void>;
  install(bytes: Uint8Array, version: string): Promise<void>;
  healthCheck(): Promise<boolean>;
  rollback(version: string): Promise<void>;
}
