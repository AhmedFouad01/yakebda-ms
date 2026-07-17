import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Reports } from "./Reports";

const apiMock = vi.hoisted(() => vi.fn());
vi.mock("../lib/api", () => ({ api: apiMock }));

const branchId = "11111111-1111-4111-8111-111111111111";
const meta = {
  report_id: "sales.trend",
  generated_at: "2026-07-17T15:00:00.000Z",
  timezone: "Africa/Cairo",
  currency: "EGP",
  filters: { days: 30, branch_id: null },
};

function installSuccessApi(overrides: { invalidValues?: boolean } = {}) {
  apiMock.mockImplementation(async (path: string) => {
    if (path === "/reports/catalog") {
      return {
        data: [
          {
            id: "sales.summary",
            category: "sales_orders",
            title_ar: "ملخص التشغيل اليومي",
            description_ar: "مؤشرات اليوم",
            permission: "reports.view",
            filters: ["branch_id"],
            visualizations: ["kpis"],
            status: "active",
          },
          {
            id: "sales.by_source",
            category: "sales_orders",
            title_ar: "المبيعات حسب المصدر",
            description_ar: "مقارنة القنوات",
            permission: "reports.view",
            filters: ["days", "branch_id"],
            visualizations: ["bar", "table"],
            status: "active",
          },
        ],
      };
    }
    if (path === "/branches") {
      return { data: [{ id: branchId, name: "الفرع الرئيسي", timezone: "Africa/Cairo" }] };
    }
    if (path.startsWith("/reports/summary")) {
      return {
        data: {
          sales_today: overrides.invalidValues ? Number.NaN : 1250,
          orders_today: 12,
          open_orders: 2,
          kitchen_pending: 1,
          cancelled_today: 0,
          open_shifts: 1,
          open_shift_cash_sales: 700,
        },
        meta: { ...meta, report_id: "sales.summary" },
      };
    }
    if (path.startsWith("/reports/sales")) {
      return {
        data: {
          by_day: [{ day: "2026-07-17", total: 1250 }],
          by_branch: [{ branch_id: branchId, branch: "الفرع الرئيسي", total: 1250 }],
          by_source: [{ source_id: null, source: "طلب مباشر", total: 1250 }],
        },
        meta,
      };
    }
    if (path.startsWith("/reports/top-products")) {
      return {
        data: [{ name_ar: "ساندوتش كبدة", qty: 8, total: overrides.invalidValues ? Number.NaN : 640 }],
        meta: { ...meta, report_id: "sales.top_products" },
      };
    }
    if (path.startsWith("/reports/payment-methods")) {
      return {
        data: [{ method: "cash", total: 1250, count: 12 }],
        meta: { ...meta, report_id: "sales.payment_methods" },
      };
    }
    throw new Error(`Unexpected API path: ${path}`);
  });
}

beforeEach(() => {
  apiMock.mockReset();
  installSuccessApi();
});

describe("Reporting foundation Admin", () => {
  it("renders the catalog, authoritative KPIs, accessible charts, and report metadata", async () => {
    render(<Reports />);

    await waitFor(() => expect(screen.getByText("ملخص التشغيل اليومي")).toBeTruthy());
    expect(screen.getByRole("img", { name: "اتجاه المبيعات" })).toBeTruthy();
    expect(screen.getByRole("img", { name: "المبيعات حسب الفرع" })).toBeTruthy();
    expect(screen.getByRole("img", { name: "المبيعات حسب المصدر" })).toBeTruthy();
    expect(screen.getByText("ساندوتش كبدة")).toBeTruthy();
    expect(screen.getByText(/Africa\/Cairo/)).toBeTruthy();
    expect(screen.getAllByText("عرض جدول بيانات الرسم").length).toBe(3);
  });

  it("applies one period and branch filter to every report run", async () => {
    render(<Reports />);
    await waitFor(() => expect(screen.getByText("ساندوتش كبدة")).toBeTruthy());

    fireEvent.change(screen.getByLabelText("الفترة"), { target: { value: "7" } });
    fireEvent.change(screen.getByLabelText("الفرع"), { target: { value: branchId } });
    fireEvent.click(screen.getByRole("button", { name: "تطبيق" }));

    await waitFor(() => {
      const paths = apiMock.mock.calls.map(([path]) => String(path));
      expect(paths).toContain(`/reports/sales?days=7&branch_id=${branchId}`);
      expect(paths).toContain(`/reports/top-products?days=7&branch_id=${branchId}`);
      expect(paths).toContain(`/reports/payment-methods?days=7&branch_id=${branchId}`);
      expect(paths).toContain(`/reports/summary?branch_id=${branchId}`);
    });
  });

  it("keeps invalid numeric values explicit instead of displaying a fake zero", async () => {
    installSuccessApi({ invalidValues: true });
    render(<Reports />);
    await waitFor(() => expect(screen.getByText("ساندوتش كبدة")).toBeTruthy());
    expect(screen.getAllByText("غير متاح").length).toBeGreaterThanOrEqual(2);
  });

  it("shows a retryable server error and recovers without remounting", async () => {
    let failSummary = true;
    installSuccessApi();
    const successImplementation = apiMock.getMockImplementation()!;
    apiMock.mockImplementation(async (path: string) => {
      if (failSummary && path.startsWith("/reports/summary")) throw new Error("تعذر الاتصال");
      return successImplementation(path);
    });

    render(<Reports />);
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("تعذر الاتصال"));

    failSummary = false;
    fireEvent.click(screen.getByRole("button", { name: "إعادة المحاولة" }));
    await waitFor(() => expect(screen.getByText("ساندوتش كبدة")).toBeTruthy());
  });
});
