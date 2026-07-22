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

const ACCOUNTS = [
  { id: "acc-cash", code: "1010", system_key: "cash", name_ar: "النقدية/الخزينة", account_type: "asset", is_active: true },
  { id: "acc-round", code: "4090", system_key: "rounding", name_ar: "فروق التقريب (Rounding)", account_type: "revenue", is_active: true },
  { id: "acc-inv", code: "1310", system_key: "inventory", name_ar: "المخزون", account_type: "asset", is_active: true },
];

const MAPPINGS = [
  {
    id: "map-settle",
    event_type: "residual.settlement",
    dimension_key: "default",
    debit_account_id: "acc-inv",
    credit_account_id: "acc-round",
    vat_account_id: null,
    debit_account_code: "1310",
    debit_account_name_ar: "المخزون",
    credit_account_code: "4090",
    credit_account_name_ar: "فروق التقريب (Rounding)",
    vat_account_code: null,
    vat_account_name_ar: null,
  },
];

const RESIDUAL_ITEM = {
  id: "res-1",
  branch_id: "b1",
  event_type: "inventory.receipt",
  entry_date: "2026-07-10",
  source_amount: "0.0040",
  journal_amount: "0.00",
  residual_amount: "0.0040",
  status: "open",
  financial_event_id: EVENT_FAILED.id,
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
    if (path.startsWith("/accounting/accounts")) return { data: ACCOUNTS };
    if (path.startsWith("/accounting/mappings")) return { data: MAPPINGS };
    if (path.startsWith("/accounting/trial-balance")) {
      return {
        data: [
          { id: "acc-round", code: "4090", name_ar: "فروق التقريب (Rounding)", account_type: "revenue", debit: "0.00", credit: "0.01" },
        ],
        totals: { debit: "0.01", credit: "0.01" },
        balanced: true,
        residual_balance: "0.0000",
        period: null,
      };
    }
    if (path.startsWith("/accounting/reconciliation/settle")) {
      return {
        data: {
          settled_count: 3,
          total_residual: "0.0120",
          journal_entries: [{ id: JOURNAL.id, branch_id: "b1", amount: "0.01" }],
          absorbed_branches: [],
        },
      };
    }
    if (/\/accounting\/periods\/.+\/open$/.test(path)) {
      return { data: { id: "p1", starts_on: "2026-07-01", ends_on: "2026-07-31", status: "open", locked_at: null } };
    }
    if (path.startsWith("/accounting/periods/lock")) {
      return {
        data: { id: "p2", starts_on: "2026-06-01", ends_on: "2026-06-30", status: "locked", locked_at: "2026-07-21T10:00:00Z" },
        settlement: { settled_count: 3, total_residual: "0.0120", journal_entries: [], absorbed_branches: [] },
      };
    }
    if (path.startsWith("/accounting/financial-events/summary")) {
      return { data: overrides.summary ?? [{ status: "failed", count: "2" }, { status: "posted", count: "7" }] };
    }
    if (path.startsWith("/accounting/reconciliation/residuals")) {
      return {
        data: {
          items: [RESIDUAL_ITEM],
          summary: [{ branch_id: "b1", open_count: "3", open_total: overrides.totalOpen ?? "0.0120" }],
          total_open: overrides.totalOpen ?? "0.0120",
        },
      };
    }
    if (path.startsWith("/accounting/settings")) {
      if (opts?.method === "PUT") {
        return { data: { ...(opts.body as Record<string, unknown>), revenue_recognition: "on_payment", timezone: "Africa/Cairo", day_close_hour: 4 }, message: "تم الحفظ بنجاح." };
      }
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
    // UX-LANG-01: نوع الحركة يظهر معرَّبًا — المفتاح الخام `inventory.receipt` لم يعد على الشاشة.
    await waitFor(() => expect(screen.getAllByText("استلام مخزون").length).toBeGreaterThan(0));
  }

  it("lists events with semantic status badges and opens the detail drawer", async () => {
    primeApi();
    await openEventsTab();
    expect(screen.getAllByText("لم تُسجّل").length).toBeGreaterThan(0);
    expect(screen.getAllByText("مُسجّلة").length).toBeGreaterThan(0);

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

describe("CP6 — chart & mappings screen", () => {
  it("renders the chart with the rounding account highlighted and gates write buttons", async () => {
    primeApi();
    render(<AccountingPage />);
    fireEvent.click(await screen.findByText("الشجرة والربط"));
    await waitFor(() => expect(screen.getByText("حساب التقريب المعتمد")).toBeTruthy());
    expect(screen.getAllByText("4090").length).toBeGreaterThan(0);
    expect(screen.getByText("+ حساب جديد")).toBeTruthy();
    expect(screen.getByText("+ قاعدة ترحيل جديدة")).toBeTruthy();
    expect(screen.getByText("تسوية التقريب")).toBeTruthy(); // residual.settlement mapping badge
  });

  it("hides chart write buttons from view-only users", async () => {
    canMock.mockImplementation((p: string) => p === "accounting.view");
    primeApi();
    render(<AccountingPage />);
    fireEvent.click(await screen.findByText("الشجرة والربط"));
    await waitFor(() => expect(screen.getByText("حساب التقريب المعتمد")).toBeTruthy());
    expect(screen.queryByText("+ حساب جديد")).toBeNull();
    expect(screen.queryByText("+ قاعدة ترحيل جديدة")).toBeNull();
  });
});

describe("CP6 — periods screen", () => {
  it("locks a period only after the residual preview confirm, then reloads from the server", async () => {
    primeApi();
    render(<AccountingPage />);
    fireEvent.click(await screen.findByText("الفترات"));
    await waitFor(() => expect(screen.getByText("قفل فترة…")).toBeTruthy());

    fireEvent.change(screen.getByLabelText("بداية الفترة"), { target: { value: "2026-06-01" } });
    fireEvent.change(screen.getByLabelText("نهاية الفترة"), { target: { value: "2026-06-30" } });
    fireEvent.click(screen.getByText("قفل فترة…"));
    await waitFor(() => expect(screen.getByText("تأكيد القفل مع التسوية")).toBeTruthy());
    expect(apiMock.mock.calls.filter(([p]) => String(p).includes("/periods/lock"))).toHaveLength(0);

    fireEvent.click(screen.getByText("تأكيد القفل مع التسوية"));
    await waitFor(() => {
      expect(apiMock.mock.calls.filter(([p]) => String(p).includes("/periods/lock"))).toHaveLength(1);
    });
  });

  it("reopens a locked period after confirm", async () => {
    primeApi();
    apiMock.mockImplementation(((original) => async (path: string, opts?: unknown) => {
      if (path.startsWith("/accounting/periods") && !path.includes("/open") && !path.includes("/lock")) {
        return { data: [{ id: "p1", starts_on: "2026-07-01", ends_on: "2026-07-31", status: "locked", locked_at: "2026-07-20T00:00:00Z" }] };
      }
      return original(path, opts);
    })(apiMock.getMockImplementation()!));
    render(<AccountingPage />);
    fireEvent.click(await screen.findByText("الفترات"));
    await waitFor(() => expect(screen.getByText("فتح الفترة")).toBeTruthy());
    fireEvent.click(screen.getByText("فتح الفترة"));
    await waitFor(() => expect(screen.getAllByText("فتح الفترة").length).toBeGreaterThan(1));
    fireEvent.click(screen.getAllByText("فتح الفترة").at(-1)!);
    await waitFor(() => {
      expect(apiMock.mock.calls.filter(([p]) => /\/periods\/.+\/open$/.test(String(p)))).toHaveLength(1);
    });
  });
});

describe("CP6 — settlement screen", () => {
  it("shows the equation ledger with aggregates and executes settlement behind confirm", async () => {
    primeApi();
    render(<AccountingPage />);
    fireEvent.click(await screen.findByText("تسوية الفروق"));
    await waitFor(() => expect(screen.getAllByText("0.0040").length).toBeGreaterThan(0));
    expect(screen.getAllByText("0.0120").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByText("تنفيذ التسوية…"));
    await waitFor(() => expect(screen.getByText("تأكيد التنفيذ")).toBeTruthy());
    expect(apiMock.mock.calls.filter(([p]) => String(p).includes("/reconciliation/settle"))).toHaveLength(0);

    fireEvent.click(screen.getByText("تأكيد التنفيذ"));
    await waitFor(() => {
      const calls = apiMock.mock.calls.filter(([p]) => String(p).includes("/reconciliation/settle"));
      expect(calls).toHaveLength(1);
      expect((calls[0][1] as { body: { idempotency_key: string } }).body.idempotency_key).toBeTruthy();
    });
  });

  it("hides the execute button from view-only users", async () => {
    canMock.mockImplementation((p: string) => p === "accounting.view");
    primeApi();
    render(<AccountingPage />);
    fireEvent.click(await screen.findByText("تسوية الفروق"));
    await waitFor(() => expect(screen.getAllByText("0.0040").length).toBeGreaterThan(0));
    expect(screen.queryByText("تنفيذ التسوية…")).toBeNull();
  });
});

describe("CP6 — trial balance screen", () => {
  it("renders server totals with the balance chip and exports CSV from the same strings", async () => {
    primeApi();
    const createObjectURL = vi.fn(() => "blob:trial");
    const revokeObjectURL = vi.fn();
    Object.assign(URL, { createObjectURL, revokeObjectURL });
    render(<AccountingPage />);
    fireEvent.click(await screen.findByText("ميزان المراجعة"));
    await waitFor(() => expect(screen.getByText(/متوازن — مدين 0.01 = دائن 0.01/)).toBeTruthy());
    expect(screen.getByText("الإجمالي (من الخادم)")).toBeTruthy();
    expect(screen.getByText(/residual مفتوح: 0.0000/)).toBeTruthy();

    fireEvent.click(screen.getByText("تصدير CSV"));
    await waitFor(() => expect(createObjectURL).toHaveBeenCalledTimes(1));
  });
});

describe("CP6 — exceptions queue", () => {
  it("groups unresolved statuses with a resolution path per type", async () => {
    primeApi();
    render(<AccountingPage />);
    fireEvent.click(await screen.findByText("الاستثناءات"));
    await waitFor(() => expect(screen.getAllByText("فتح قواعد الترحيل").length).toBe(2));
    expect(screen.getByText("فتح تسوية الفروق")).toBeTruthy();
    expect(screen.getAllByText("عرض").length).toBeGreaterThan(0);
  });
});

describe("CP7 — accounting settings screen", () => {
  it("shows editable type-B values, read-only type-A constants, and saves via PUT", async () => {
    primeApi();
    render(<AccountingPage />);
    fireEvent.click(await screen.findByText("الإعدادات", { selector: "[role=tab]" }));
    await waitFor(() => expect(screen.getByText(/القيم القابلة للتعديل/)).toBeTruthy());
    expect(screen.getByText(/ثوابت المحرك/)).toBeTruthy();
    expect(screen.getByText("حفظ الإعدادات")).toBeTruthy();

    fireEvent.click(screen.getByText("حفظ الإعدادات"));
    await waitFor(() => {
      const puts = apiMock.mock.calls.filter(([p, o]) => String(p).includes("/accounting/settings") && (o as { method?: string })?.method === "PUT");
      expect(puts.length).toBe(1);
    });
  });

  it("hides the save button and disables fields for view-only users", async () => {
    canMock.mockImplementation((p: string) => p === "accounting.view");
    primeApi();
    render(<AccountingPage />);
    fireEvent.click(await screen.findByText("الإعدادات", { selector: "[role=tab]" }));
    await waitFor(() => expect(screen.getByText(/القيم القابلة للتعديل/)).toBeTruthy());
    expect(screen.queryByText("حفظ الإعدادات")).toBeNull();
  });
});

describe("CP6 — accountant review pack", () => {
  it("assembles policy values, unresolved counters, and a print action", async () => {
    primeApi();
    const printMock = vi.fn();
    window.print = printMock;
    render(<AccountingPage />);
    fireEvent.click(await screen.findByText("حزمة المراجعة"));
    await waitFor(() => expect(screen.getByText(/السياسة المحاسبية المعتمدة/)).toBeTruthy());
    expect(screen.getByText("إجمالي غير المحلول")).toBeTruthy();
    expect(screen.getByText(/تاريخ إقفال الفترة/)).toBeTruthy();
    fireEvent.click(screen.getByText("طباعة الحزمة"));
    expect(printMock).toHaveBeenCalledTimes(1);
  });
});

describe("CP5 — journals screen", () => {
  async function openJournalsTab() {
    render(<AccountingPage />);
    await waitFor(() => expect(screen.getByText("القيود")).toBeTruthy());
    fireEvent.click(screen.getByText("القيود"));
    // UX-LANG-01: النص يظهر مرتين الآن — وصف القيد وعمود نوع الحركة المعرَّب.
    await waitFor(() => expect(screen.getAllByText("استلام مخزون").length).toBeGreaterThan(0));
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
