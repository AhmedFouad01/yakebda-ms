import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SccDiagnostics } from "./SccDiagnostics";

const apiMock = vi.hoisted(() => vi.fn());
vi.mock("../lib/api", () => ({ api: apiMock }));

const diagnostics = {
  enabled: true, enrolled: true, environment: "pilot", productCode: "YAKEBDA_MS", branchCode: "CAIRO-01",
  health: "healthy", lastHeartbeatAt: "2026-07-22T10:00:00.000Z", lastConnectionError: null,
  licenseState: "ValidOffline", pendingEvents: 0, configVersion: 2, updateChannel: "pilot", backupStatus: "verified",
  deviceId: "device-1", installationId: "installation-1", appVersion: "0.1.0", sdkVersion: "0.1.0-pilot.1",
};

beforeEach(() => {
  apiMock.mockReset();
  apiMock.mockResolvedValue({ data: diagnostics });
});

describe("SCC diagnostics", () => {
  it("shows operational state and sends a manual heartbeat", async () => {
    render(<SccDiagnostics />);
    expect(await screen.findByText("ValidOffline")).toBeTruthy();
    expect(screen.getByText("healthy")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "إرسال نبضة الآن" }));
    await waitFor(() => expect(apiMock).toHaveBeenCalledWith("/scc/heartbeat", { method: "POST", body: {} }));
  });

  it("keeps failures visible and recoverable", async () => {
    apiMock.mockRejectedValueOnce(new Error("SCC غير متاح"));
    render(<SccDiagnostics />);
    expect((await screen.findByRole("alert")).textContent).toContain("SCC غير متاح");
    fireEvent.click(screen.getByRole("button", { name: "تحديث الحالة" }));
    expect(await screen.findByText("ValidOffline")).toBeTruthy();
  });
});
