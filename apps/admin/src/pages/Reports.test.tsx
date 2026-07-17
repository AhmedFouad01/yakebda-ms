import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Reports } from "./Reports";

const apiMock = vi.hoisted(() => vi.fn());
vi.mock("../lib/api", () => ({ api: apiMock }));

const branchId = "11111111-1111-4111-8111-111111111111";
const accountId = "22222222-2222-4222-8222-222222222222";

function reportMeta(reportId: string, filters: { days?: number; branch_id?: string | null } = {}) {
  return {
    request_id: `${reportId}-request`,
    report_id: reportId,
    query_version: "1.1.0",
    generated_at: "2026-07-17T15:00:00.000Z",
    generated_by_user_id: "33333333-3333-4333-8333-333333333333",
    timezone: "Africa/Cairo",
    timezone_policy: "account_default",
    currency: "EGP",
    effective_scope: { account_id: accountId, branch_ids: [branchId] },
    filters,
  };
}

function catalogResponse() {
  return {
    data: [
      {
        id: "sales.summary",
        category: "sales_orders",
        title_ar: "ملخص التشغيل اليومي",
        description_ar: "مؤشرات اليوم",
        required_permissions: ["reports.view"],
        filters: [{ key: "branch_id", kind: "branch", label_ar: "الفرع", required: false }],
        dimensions: [],
        measures: [{ key: "sales_today", label_ar: "مبيعات اليوم", format: "money", semantics: "settled" }],
        visualizations: ["kpis"],
        supported_outputs: ["screen"],
        default_template_key: "sales-summary-default",
        query_version: "1.1.0",
        status: "active",
      },
      {
        id: "sales.by_source",
        category: "sales_orders",
        title_ar: "المبيعات حسب المصدر",
        description_ar: "مقارنة القنوات",
        required_permissions: ["reports.view"],
        filters: [
          { key: "days", kind: "period_days", label_ar: "الفترة", required: true, allowed_values: [7, 30, 90] },
          { key: "branch_id", kind: "branch", label_ar: "الفرع", required: false },
        ],
        dimensions: [{ key: "source_id", label_ar: "المصدر" }],
        measures: [{ key: "total", label_ar: "الإجمالي", format: "money", semantics: "settled" }],
        visualizations: ["bar", "table"],
        supported_outputs: ["screen"],
        default_template_key: "sales-by-source-default",
        query_version: "1.1.0",
        status: "active",
      },
    ],
  };
}

function installSuccessApi(overrides: { invalidValues?: boolean } = {}) {
  apiMock.mockImplementation(async (path: string) => {
    if (path === "/reports/catalog") return catalogResponse();
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
        meta: reportMeta("sales.summary", { branch_id: null }),
      };
    }
    if (path.startsWith("/reports/sales/trend")) {
      return {
        data: { rows: [{ day: "2026-07-17", total: 1250 }] },
        meta: reportMeta("sales.trend", { days: 30, branch_id: null }),
      };
    }
    if (path.startsWith("/reports/sales/by-branch")) {
      return {
        data: { rows: [{ branch_id: branchId, branch: "الفرع الرئيسي", total: 1250 }] },
        meta: reportMeta("sales.by_branch", { days: 30, branch_id: null }),
      };
    }
    if (path.startsWith("/reports/sales/by-source")) {
      return {
        data: { rows: [{ source_id: null, source: "طلب مباشر", total: 1250 }] },
        meta: reportMeta("sales.by_source", { days: 30, branch_id: null }),
      };
    }
    if (path.startsWith("/reports/top-products")) {
      return {
        data: [{
          product_id: "44444444-4444-4444-8444-444444444444",
          name_ar: "ساندوتش كبدة",
          qty: 8,
          gross_item_sales: overrides.invalidValues ? Number.NaN : 640,
        }],
        meta: reportMeta("sales.top_products", { days: 30, branch_id: null }),
      };
    }
    if (path.startsWith("/reports/payment-methods")) {
      return {
        data: [{ method: "cash", total: 1250, count: 12 }],
        meta: reportMeta("sales.payment_methods", { days: 30, branch_id: null }),
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
  it("renders catalog, authoritative KPIs, accessible charts and response metadata", async () => {
    render(<Reports />);

    await waitFor(() => expect(screen.getByText("ملخص التشغيل اليومي")).toBeTruthy());
    expect(screen.getByRole("img", { name: "اتجاه المبيعات" })).toBeTruthy();
    expect(screen.getByRole("img", { name: "المبيعات حسب الفرع" })).toBeTruthy();
    expect(screen.getByRole("img", { name: "المبيعات حسب المصدر" })).toBeTruthy();
    expect(screen.getByText("ساندوتش كبدة")).toBeTruthy();
    expect(screen.getByText(/Africa\/Cairo/)).toBeTruthy();
    expect(screen.getByText(/sales\.trend-request/)).toBeTruthy();
    expect(screen.getAllByText("عرض جدول بيانات الرسم").length).toBe(3);
  });

  it("applies one period and branch filter to every distinct report endpoint", async () => {
    render(<Reports />);
    await waitFor(() => expect(screen.getByText("ساندوتش كبدة")).toBeTruthy());

    fireEvent.change(screen.getByLabelText("الفترة"), { target: { value: "7" } });
    fireEvent.change(screen.getByLabelText("الفرع"), { target: { value: branchId } });
    fireEvent.click(screen.getByRole("button", { name: "تطبيق" }));

    await waitFor(() => {
      const paths = apiMock.mock.calls.map(([path]) => String(path));
      expect(paths).toContain(`/reports/sales/trend?days=7&branch_id=${branchId}`);
      expect(paths).toContain(`/reports/sales/by-branch?days=7&branch_id=${branchId}`);
      expect(paths).toContain(`/reports/sales/by-source?days=7&branch_id=${branchId}`);
      expect(paths).toContain(`/reports/top-products?days=7&branch_id=${branchId}`);
      expect(paths).toContain(`/reports/payment-methods?days=7&branch_id=${branchId}`);
      expect(paths).toContain(`/reports/summary?branch_id=${branchId}`);
    });
  });

  it("keeps invalid client-side numeric values explicit instead of a fake zero", async () => {
    installSuccessApi({ invalidValues: true });
    render(<Reports />);
    await waitFor(() => expect(screen.getByText("ساندوتش كبدة")).toBeTruthy());
    expect(screen.getAllByText("غير متاح").length).toBeGreaterThanOrEqual(2);
  });

  it("clears old report data when a new filtered run fails", async () => {
    let failFilteredRun = false;
    installSuccessApi();
    const successImplementation = apiMock.getMockImplementation()!;
    apiMock.mockImplementation(async (path: string) => {
      if (failFilteredRun && path.includes("branch_id=")) throw new Error("تعذر تشغيل الفلتر الجديد");
      return successImplementation(path);
    });

    render(<Reports />);
    await waitFor(() => expect(screen.getByText("ساندوتش كبدة")).toBeTruthy());

    failFilteredRun = true;
    fireEvent.change(screen.getByLabelText("الفرع"), { target: { value: branchId } });
    fireEvent.click(screen.getByRole("button", { name: "تطبيق" }));

    await waitFor(() => {
      expect(screen.getAllByRole("alert").some((alert) =>
        alert.textContent?.includes("تعذر تشغيل الفلتر الجديد")
      )).toBe(true);
    });
    expect(screen.queryByText("ساندوتش كبدة")).toBeNull();
  });

  it("keeps successful sections visible when one report fails", async () => {
    installSuccessApi();
    const successImplementation = apiMock.getMockImplementation()!;
    apiMock.mockImplementation(async (path: string) => {
      if (path.startsWith("/reports/sales/trend")) throw new Error("تعذر تحميل اتجاه المبيعات");
      return successImplementation(path);
    });

    render(<Reports />);

    await waitFor(() => expect(screen.getByText("ساندوتش كبدة")).toBeTruthy());
    expect(screen.getAllByRole("alert").some((alert) =>
      alert.textContent?.includes("تعذر تحميل اتجاه المبيعات")
    )).toBe(true);
    expect(screen.queryByRole("img", { name: "اتجاه المبيعات" })).toBeNull();
    expect(screen.getByRole("img", { name: "المبيعات حسب الفرع" })).toBeTruthy();
    expect(screen.getByRole("img", { name: "المبيعات حسب المصدر" })).toBeTruthy();
  });

  it("retries catalog and branches bootstrap independently", async () => {
    let failBootstrap = true;
    installSuccessApi();
    const successImplementation = apiMock.getMockImplementation()!;
    apiMock.mockImplementation(async (path: string) => {
      if (failBootstrap && (path === "/reports/catalog" || path === "/branches")) {
        throw new Error("تعذر تحميل الدليل");
      }
      return successImplementation(path);
    });

    render(<Reports />);
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("تعذر تحميل الدليل"));
    expect(screen.queryByText("ملخص التشغيل اليومي")).toBeNull();

    failBootstrap = false;
    fireEvent.click(screen.getByRole("button", { name: "إعادة المحاولة" }));
    await waitFor(() => expect(screen.getByText("ملخص التشغيل اليومي")).toBeTruthy());
    expect(screen.getByRole("option", { name: "الفرع الرئيسي" })).toBeTruthy();
  });

  it("retries a failed report run without remounting", async () => {
    let failSummary = true;
    installSuccessApi();
    const successImplementation = apiMock.getMockImplementation()!;
    apiMock.mockImplementation(async (path: string) => {
      if (failSummary && path.startsWith("/reports/summary")) throw new Error("تعذر الاتصال");
      return successImplementation(path);
    });

    render(<Reports />);
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("تعذر الاتصال"));
    expect(screen.getByText("ساندوتش كبدة")).toBeTruthy();

    failSummary = false;
    fireEvent.click(screen.getByRole("button", { name: "إعادة المحاولة" }));
    await waitFor(() => expect(screen.getAllByText("ساندوتش كبدة").length).toBeGreaterThan(0));
  });
});
