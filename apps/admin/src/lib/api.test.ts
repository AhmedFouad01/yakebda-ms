import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("resolveAssetUrl", () => {
  it("resolves relative uploads against the configured API origin", async () => {
    vi.stubEnv("VITE_API_ORIGIN", "http://127.0.0.1:3001/");
    vi.resetModules();
    const { resolveAssetUrl } = await import("./api");

    expect(resolveAssetUrl("/uploads/products/kebda.png")).toBe(
      "http://127.0.0.1:3001/uploads/products/kebda.png"
    );
    expect(resolveAssetUrl("uploads/products/kebda.png")).toBe(
      "http://127.0.0.1:3001/uploads/products/kebda.png"
    );
  });

  it("passes absolute, data and blob URLs through unchanged", async () => {
    vi.stubEnv("VITE_API_ORIGIN", "http://127.0.0.1:3001");
    vi.resetModules();
    const { resolveAssetUrl } = await import("./api");

    expect(resolveAssetUrl("https://cdn.example.com/item.png")).toBe("https://cdn.example.com/item.png");
    expect(resolveAssetUrl("data:image/png;base64,abc")).toBe("data:image/png;base64,abc");
    expect(resolveAssetUrl("blob:https://app.example.com/id")).toBe("blob:https://app.example.com/id");
  });
});
