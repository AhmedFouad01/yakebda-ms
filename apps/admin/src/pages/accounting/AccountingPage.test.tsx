import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NAV_LINKS } from "../../components/ui/AppShell";
import { AccountingPage } from "./AccountingPage";

const apiMock = vi.hoisted(() => vi.fn());
const canMock = vi.hoisted(() => vi.fn());
vi.mock("../../lib/api", () => ({
  api: apiMock,
  getToken: () => "token",
  setToken: vi.fn(),
}));
vi.mock("../../lib/me", () => ({
  useMe: () => ({ me: { branchId: null }, ready: true, can: canMock }),
}));

const EVENT_FAILED = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  branch_id: "b1",
  source_type: "stock_movement",
  source_id: "mmmmmmmm-mmmm-4mmm-8mmm-mmmmmmmmmmmm",
  event_type: "inventory.receipt",
  status: "failed",
  attempts: 2,
  last_error: "قاعدة الترحيل غير موجودة",
  created_at: "2026-07-20T10:00:00.000Z",
  posted_at: null,
};

const EVENT_POSTED = {
  ...EVENT_FAILED,
  id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  status: "posted",
  last_error: null,
  posted_at: "2026-07-20T11:00:00.000Z",
};

const JOURNAL = {
  id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  branch_id: "b1",
  event_type: "inventory.receipt",
  source_type: "stock_movement",
  source_id: EVENT_POSTED.source_id,
  entry_date: "2026-07-20",
  description: "استلام مخزون",
  reversal_of_entry_id: null,
  lines: [
    { id: "l1", accounting_account_id: "acc1", account_code: "1310", account_name_ar: "المخزون", component: "debit", debit: "12.50", credit: "0.00" },
    { id: "l2", accounting_account_id: "acc2", account_code: "2100", account_name_ar: "الموردون", component: "credit", debit: "0.00", credit: "12.50" },
  ],
};

const JOURNAL_DETAIL = {
  ...JOURNAL,
  totals: { debit: "12.50", credit: "12.50" },
  reversed_by: null,
  financial_event: {
    id: EVENT_POSTED.id,
    status: "posted",
    event_type: "inventory.receipt",
    source_type: "stock_movement",
    source_id: EVENT_POSTED.source_id,
    last_error: null,
  },
};

function primeApi(overrides: {
  summary?: unknown[];
  totalOpen?: string;
  threshold?: string;
  events?: unknown[];
  journalDetail?: unknown;
  markDead?: boolean;
} = {}) {
  apiMock.mockImplementation(async (path: string, opts?: { method?: string; body?: unknown }) => {
    if (path.startsWith("/branches")) return { data: [{ id: "b1", name: "الرئيسي" }] };
    if (path.startsWith("/accounting/financial-events/summary")) {
      return { data: overrides.summary ?? [{ status: "failed", count: "2" }, { status: "posted", count: "7" }] };
    }
    if (path.startsWith("/accounting/reconciliation/residuals")) {
      return {
        data: {
          items: [],
          summary: [{ branch_id: "b1", open_count: "3", open_total: overrides.totalOpen ?? "0.0120" }],
          total_open: overrides.totalOpen ?? "0.0120",
        },
      };
    }
    if (path.startsWith("/accounting/settings")) {
      return {
        data: {
          vat_registered: false,
          vat_rate: 14,
          revenue_recognition: "on_payment",
          timezone: "Africa/Cairo",
          day_close_hour: 4,
          materiality_threshold: overrides.threshold ?? "0.00",
        },
      };
    }
    if (path.startsWith("/accounting/periods")) {
      return { data: [{ id: "p1", starts_on: "2026-07-01", ends_on: "2026-07-31", status: "open", locked_at: null }] };
    }
    if (path.startsWith(`/accounting/financial-events/${EVENT_FAILED.id}/retry`)) {
      return { data: { ...EVENT_FAILED, status: "pending" } };
    }
    if (path.startsWith(`/accounting/financial-events/${EVENT_FAILED.id}/mark-dead`)) {
      return { data: { ...EVENT_FAILED, status: "dead", last_error: (opts?.body as { reason: string }).reason } };
    }
    if (path.startsWith(`/accounting/financial-events/${EVENT_FAILED.id}`)) {
      return { data: { ...EVENT_FAILED, payload: { total_value: "12.5000" }, journal_entry: null, reconciliation: null, source: null } };
    }
    if (path.startsWith("/accounting/financial-events")) {
      return { data: overrides.events ?? [EVENT_FAILED, EVENT_POSTED], next_cursor: null, has_more: false };
    }
    if (path.startsWith(`/accounting/journals/${JOURNAL.id}`)) {
      return { data: overrides.journalDetail ?? JOURNAL_DETAIL };
    }
    if (path.startsWith("/accounting/journals")) {
      return { data: [JOURNAL], next_cursor: null, has_more: false };
    }
    throw new Error("unexpected path " + path);
  });
}

beforeEach(() => {
  apiMock.mockReset();
  canMock.mockReset();
  canMock.mockReturnValue(true);
});

describe("CP5 — accounting navigation & route registration", () => {
  it("registers a permission-aware nav entry for /accounting requiring accounting.view", () => {
    const link = NAV_LINKS.find((l) => l.to === "/accounting");
    expect(link).toBeTruthy();
    expect(link!.perms).toEqual(["accounting.view"]);
    expect(link!.label()).toBe("الحسابات");
  });
});

describe("CP5 — dashboard", () => {
  it("renders server counters, residual total, and period state without client math", async () => {
    primeApi();
    render(<AccountingPage />);
    await waitFor(() => expect(screen.getAllByText("0.0120").length).toBeGreaterThan(0));
    expect(screen.getByText("7")).toBeTruthy(); // posted counter from summary
    expect(screen.getByText(/آخر فترة: 2026-07-01/)).toBeTruthy();
    expect(screen.getByText("مفتوحة")).toBeTruthy();
    // العتبة 0.00 → لا تنبيه
    expect(screen.queryByText(/تجاوز حد الأهمية/)).toBeNull();
  });

  it("shows the materiality alert only when the open residual exceeds the threshold", async () => {
    primeApi({ threshold: "0.01", totalOpen: "25.5000" });
    render(<AccountingPage />);
    await waitFor(() => expect(screen.getByText(/تجاوز حد الأهمية/)).toBeTruthy());
  });
});

describe("CP5 — financial events screen", () => {
  async function openEventsTab() {
    render(<AccountingPage />);
    await waitFor(() => expect(screen.getByText("الأحداث المالية")).toBeTruthy());
    fireEvent.click(screen.getByText("الأحداث المالية"));
    await waitFor(() => expect(screen.getAllByText("inventory.receipt").length).toBeGreaterThan(0));
  }

  it("lists events with semantic status badges and opens the detail drawer", async () => {
    primeApi();
    await openEventsTab();
    expect(screen.getAllByText("فاشل").length).toBeGreaterThan(0);
    expect(screen.getAllByText("مُرحّل").length).toBeGreaterThan(0);

    fireEvent.click(screen.getAllByText("عرض")[0]);
    await waitFor(() => expect(screen.getByText("تفاصيل الحدث المالي")).toBeTruthy());
    expect(screen.getAllByText("قاعدة الترحيل غير موجودة").length).toBeGreaterThan(0);
    expect(screen.getByText("الحمولة الكاملة (payload)")).toBeTruthy();
  });

  it("retries a failed event only after confirm, then refreshes from the server", async () => {
    primeApi();
    await openEventsTab();
    fireEvent.click(screen.getAllByText("عرض")[0]);
    await waitFor(() => expect(screen.getByText("إعادة المحاولة")).toBeTruthy());

    fireEvent.click(screen.getByText("إعادة المحاولة"));
    await waitFor(() => expect(screen.getByText(/سيُعاد الحدث إلى قائمة الانتظار/)).toBeTruthy());
    const retryCallsBefore = apiMock.mock.calls.filter(([p]) => String(p).endsWith("/retry")).length;
    expect(retryCallsBefore).toBe(0);

    fireEvent.click(screen.getAllByText("إعادة المحاولة").at(-1)!);
    await waitFor(() => {
      const retryCalls = apiMock.mock.calls.filter(([p]) => String(p).endsWith("/retry"));
      expect(retryCalls).toHaveLength(1);
    });
  });

  it("hides write actions from view-only users", async () => {
    canMock.mockImplementation((p: string) => p === "accounting.view");
    primeApi();
    await openEventsTab();
    fireEvent.click(screen.getAllByText("عرض")[0]);
    await waitFor(() => expect(screen.getByText("تفاصيل الحدث المالي")).toBeTruthy());
    expect(screen.queryByText("إعادة المحاولة")).toBeNull();
    expect(screen.queryByText("إيقاف نهائي")).toBeNull();
  });
});

describe("CP5 — journals screen", () => {
  async function openJournalsTab() {
    render(<AccountingPage />);
    await waitFor(() => expect(screen.getByText("القيود")).toBeTruthy());
    fireEvent.click(screen.getByText("القيود"));
    await waitFor(() => expect(screen.getByText("استلام مخزون")).toBeTruthy());
  }

  it("shows entry lines with server totals and a balance chip", async () => {
    primeApi();
    await openJournalsTab();
    fireEvent.click(screen.getByText("عرض"));
    await waitFor(() => expect(screen.getByText("تفاصيل القيد")).toBeTruthy());
    expect(screen.getByText(/متوازن — 12.50 = 12.50/)).toBeTruthy();
    expect(screen.getByText("الإجمالي (من الخادم)")).toBeTruthy();
    expect(screen.getByText("1310")).toBeTruthy();
    expect(screen.getByText("عكس القيد")).toBeTruthy();
  });

  it("hides the reverse button when the entry is already reversed", async () => {
    primeApi({
      journalDetail: {
        ...JOURNAL_DETAIL,
        reversed_by: { id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", entry_date: "2026-07-21", description: "عكس" },
      },
    });
    await openJournalsTab();
    fireEvent.click(screen.getByText("عرض"));
    await waitFor(() => expect(screen.getByText("تفاصيل القيد")).toBeTruthy());
    expect(screen.queryByText("عكس القيد")).toBeNull();
    expect(screen.getByText("تم عكس هذا القيد")).toBeTruthy();
  });
});
