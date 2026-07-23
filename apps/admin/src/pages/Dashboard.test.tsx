import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Dashboard } from "./Dashboard";

const apiMock = vi.hoisted(() => vi.fn());

vi.mock("../lib/api", () => ({ api: apiMock }));
vi.mock("../lib/me", () => ({
  useMe: () => ({ ready: true, can: () => true }),
}));

beforeEach(() => {
  apiMock.mockReset();
  apiMock.mockImplementation(async (path: string) => {
    if (path === "/reports/summary") {
      return { data: { sales_today: 185, orders_today: 3, open_orders: 2 } };
    }
    if (path === "/branches") return { data: [{ id: "branch-1" }, { id: "branch-2" }] };
    if (path === "/devices") return { data: [{ id: "device-1" }] };
    if (path === "/print-jobs") {
      return { data: [{ id: "job-1", status: "pending" }, { id: "job-2", status: "printed" }] };
    }
    if (path === "/audit-logs") {
      return {
        data: [{
          id: "audit-1",
          action: "auth.login",
          user_name: "المالك",
          branch_name: null,
          created_at: "2026-07-23T12:00:00.000Z",
        }],
      };
    }
    throw new Error(`Unexpected API path: ${path}`);
  });
});

describe("Dashboard visual pilot", () => {
  it("keeps the existing data sources while rendering semantic reading metrics", async () => {
    const { container } = render(<Dashboard />);

    await waitFor(() => expect(screen.getByText("185.00 ج.م")).toBeTruthy());

    expect(screen.getByRole("heading", { level: 1, name: "يا كبدة — لوحة التحكم" })).toBeTruthy();
    expect(container.querySelector('dl[aria-label="ملخص لوحة التحكم"]')).toBeTruthy();
    expect(container.querySelectorAll(".dash-metric")).toHaveLength(7);
    expect(container.querySelectorAll(".dash-metric dd")).toHaveLength(7);
    expect(screen.getByRole("heading", { level: 2, name: "آخر العمليات المسجلة" })).toBeTruthy();
    expect(screen.getByRole("table")).toBeTruthy();

    await waitFor(() => {
      const paths = apiMock.mock.calls.map(([path]) => path);
      expect(paths).toEqual(expect.arrayContaining([
        "/reports/summary",
        "/branches",
        "/devices",
        "/print-jobs",
        "/audit-logs",
      ]));
    });
  });
});
