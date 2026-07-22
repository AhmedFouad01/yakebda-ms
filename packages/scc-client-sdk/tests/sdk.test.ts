import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { MemoryStore, SystronicClient, sanitize, validateRemoteConfig, type UpdateOffer } from "../src";

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
function client(fetchImpl: typeof fetch = vi.fn(async () => response({})) as typeof fetch, store = new MemoryStore()) {
  return new SystronicClient({ baseUrl: "http://scc.local", productId: "33333333-3333-4333-8333-333333333333", appVersion: "0.1.0", sdkVersion: "0.1.0-pilot.1", store, fetchImpl, queueLimit: 10, timeoutMs: 500 });
}

describe("SCC client SDK pilot", () => {
  it("enrolls with an Ed25519 proof and persists no token", async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body.token).toBe("tenant.secret");
      expect(body.proof).toBeTruthy();
      return response({ tenantId: "t", deviceId: "d", installationId: "i", credential: "credential", productId: "33333333-3333-4333-8333-333333333333" });
    }) as typeof fetch;
    const store = new MemoryStore();
    await client(fetchImpl, store).enroll("tenant.secret", "challenge", "YAKEBDA Pilot");
    expect(await store.get("enrollmentToken")).toBeUndefined();
    expect((await store.get("identity")) as object).toBeTruthy();
  });

  it("bounds the offline queue and retries without throwing", async () => {
    const store = new MemoryStore();
    const sdk = client(vi.fn(async () => { throw new Error("offline"); }) as typeof fetch, store);
    await store.set("enrollment", { tenantId: "t", deviceId: "d", installationId: "i", credential: "c", productId: "33333333-3333-4333-8333-333333333333" });
    for (let index = 0; index < 15; index += 1) await sdk.heartbeat("healthy", { database: true });
    const diagnostics = await sdk.diagnostics();
    expect(diagnostics.pendingEvents).toBe(10);
  });

  it("flushes queued events after connectivity returns without duplicates", async () => {
    const store = new MemoryStore();
    let online = false;
    const fetchImpl = vi.fn(async () => online ? response({ accepted: 1 }) : Promise.reject(new Error("offline"))) as typeof fetch;
    const sdk = client(fetchImpl, store);
    await store.set("enrollment", { tenantId: "t", deviceId: "d", installationId: "i", credential: "c", productId: "33333333-3333-4333-8333-333333333333" });
    expect((await sdk.heartbeat("healthy", { database: true })).pending).toBe(1);
    const queue = await store.get<Array<{ nextAt: number }>>("queue");
    queue![0]!.nextAt = 0;
    await store.set("queue", queue);
    online = true;
    expect((await sdk.flush()).sent).toBe(1);
    expect((await sdk.flush()).sent).toBe(0);
  });

  it("redacts prohibited business and credential fields", () => {
    const value = sanitize({ password: "secret", order: { id: 12 }, note: "Bearer abc.def" });
    expect(JSON.stringify(value)).not.toContain("secret");
    expect(JSON.stringify(value)).not.toContain("abc.def");
    expect(JSON.stringify(value)).not.toContain("12");
  });

  it("accepts typed configuration and rejects executable-shaped keys", () => {
    expect(validateRemoteConfig({ version: 1, values: { heartbeatInterval: 60, diagnosticsLevel: "safe" } }).version).toBe(1);
    expect(() => validateRemoteConfig({ version: 2, values: { shellCommand: "whoami" } })).toThrow("config_key_rejected");
  });

  it("uses last-known-good configuration when SCC is unavailable", async () => {
    const store = new MemoryStore();
    await store.set("enrollment", { tenantId: "t", deviceId: "d", installationId: "i", credential: "c", productId: "33333333-3333-4333-8333-333333333333" });
    await store.set("config", { version: 7, values: { updateChannel: "pilot" } });
    const sdk = client(vi.fn(async () => { throw new Error("offline"); }) as typeof fetch, store);
    expect((await sdk.getConfig()).version).toBe(7);
  });

  it("rejects a tampered update before the host adapter runs", async () => {
    const pair = generateKeyPairSync("ed25519");
    const bytes = Buffer.from("pilot");
    const offer: UpdateOffer = { rolloutId: "r", version: "0.1.1", productId: "33333333-3333-4333-8333-333333333333", artifactBase64: bytes.toString("base64"), checksum: "bad", signature: sign(null, Buffer.from("bad"), pair.privateKey).toString("base64url"), publicKey: pair.publicKey.export({ format: "jwk" }) };
    const adapter = { currentVersion: vi.fn(), canInstall: vi.fn(), prepare: vi.fn(), install: vi.fn(), healthCheck: vi.fn(), rollback: vi.fn() };
    await expect(client().executeUpdate(offer, adapter)).rejects.toThrow("artifact_checksum_invalid");
    expect(adapter.prepare).not.toHaveBeenCalled();
  });

  it("blocks updates while restaurant operations are active", async () => {
    const pair = generateKeyPairSync("ed25519");
    const bytes = Buffer.from("pilot");
    const checksum = createHash("sha256").update(bytes).digest("hex");
    const offer: UpdateOffer = { rolloutId: "r", version: "0.1.1", productId: "33333333-3333-4333-8333-333333333333", artifactBase64: bytes.toString("base64"), checksum, signature: sign(null, Buffer.from(checksum), pair.privateKey).toString("base64url"), publicKey: pair.publicKey.export({ format: "jwk" }) };
    const adapter = { currentVersion: vi.fn(), canInstall: vi.fn(async () => false), prepare: vi.fn(), install: vi.fn(), healthCheck: vi.fn(), rollback: vi.fn() };
    await expect(client().executeUpdate(offer, adapter)).rejects.toThrow("update_unsafe_state");
    expect(adapter.prepare).not.toHaveBeenCalled();
  });

  it("rolls back after a failed post-install health check", async () => {
    const pair = generateKeyPairSync("ed25519");
    const bytes = Buffer.from("pilot");
    const checksum = createHash("sha256").update(bytes).digest("hex");
    const offer: UpdateOffer = { rolloutId: "r", version: "0.1.1", productId: "33333333-3333-4333-8333-333333333333", artifactBase64: bytes.toString("base64"), checksum, signature: sign(null, Buffer.from(checksum), pair.privateKey).toString("base64url"), publicKey: pair.publicKey.export({ format: "jwk" }) };
    const store = new MemoryStore();
    await store.set("enrollment", { tenantId: "t", deviceId: "d", installationId: "i", credential: "c", productId: "33333333-3333-4333-8333-333333333333" });
    const sdk = client(vi.fn(async () => response({ status: "recorded" })) as typeof fetch, store);
    const adapter = { currentVersion: vi.fn(async () => "0.1.0"), canInstall: vi.fn(async () => true), prepare: vi.fn(), install: vi.fn(), healthCheck: vi.fn(async () => false), rollback: vi.fn() };
    expect((await sdk.executeUpdate(offer, adapter)).succeeded).toBe(false);
    expect(adapter.rollback).toHaveBeenCalledWith("0.1.0");
  });

  it("verifies signed offline licenses and binding", async () => {
    const pair = generateKeyPairSync("ed25519");
    const header = Buffer.from(JSON.stringify({ alg: "EdDSA", typ: "JWT" })).toString("base64url");
    const payload = Buffer.from(JSON.stringify({ deviceId: "d", productId: "33333333-3333-4333-8333-333333333333", expiresAt: "2099-01-01T00:00:00.000Z", graceUntil: "2099-02-01T00:00:00.000Z", offlineUntil: "2099-01-15T00:00:00.000Z" })).toString("base64url");
    const signature = sign(null, Buffer.from(`${header}.${payload}`), pair.privateKey).toString("base64url");
    const store = new MemoryStore();
    await store.set("enrollment", { tenantId: "t", deviceId: "d", installationId: "i", credential: "c", productId: "33333333-3333-4333-8333-333333333333" });
    await store.set("license", { grant: `${header}.${payload}.${signature}`, publicKey: pair.publicKey.export({ format: "jwk" }) });
    expect((await client(undefined, store).validateLicense(new Date("2098-12-01"))).state).toBe("ValidOffline");
    expect((await client(undefined, store).validateLicense(new Date("2099-01-10"))).state).toBe("GracePeriod");
  });

  it("rejects tampered and expired cached license grants", async () => {
    const pair = generateKeyPairSync("ed25519");
    const header = Buffer.from(JSON.stringify({ alg: "EdDSA", typ: "JWT" })).toString("base64url");
    const payload = Buffer.from(JSON.stringify({ deviceId: "d", productId: "33333333-3333-4333-8333-333333333333", expiresAt: "2025-01-01T00:00:00.000Z", graceUntil: "2025-02-01T00:00:00.000Z", offlineUntil: "2025-02-01T00:00:00.000Z" })).toString("base64url");
    const signature = sign(null, Buffer.from(`${header}.${payload}`), pair.privateKey).toString("base64url");
    const store = new MemoryStore();
    await store.set("enrollment", { tenantId: "t", deviceId: "d", installationId: "i", credential: "c", productId: "33333333-3333-4333-8333-333333333333" });
    await store.set("license", { grant: `${header}.${payload}.${signature}`, publicKey: pair.publicKey.export({ format: "jwk" }) });
    expect((await client(undefined, store).validateLicense(new Date("2026-01-01"))).state).toBe("Expired");
    await store.set("license", { grant: `${header}.${payload}.${signature.slice(0, -2)}xx`, publicKey: pair.publicKey.export({ format: "jwk" }) });
    expect((await client(undefined, store).validateLicense()).state).toBe("Invalid");
  });
});
