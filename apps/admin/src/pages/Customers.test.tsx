import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CustomerListRow } from "@ykms/contracts";
import { Customers } from "./Customers";

const apiMock = vi.hoisted(() => vi.fn());
vi.mock("../lib/api", () => ({
  api: apiMock,
  apiAllPages: vi.fn(async () => ({ data: [] })),
  downloadFile: vi.fn(),
}));
vi.mock("../lib/me", () => ({
  useMe: () => ({ can: () => true, me: { branchId: null } }),
}));

function row(overrides: Partial<CustomerListRow>): CustomerListRow {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    account_id: crypto.randomUUID(),
    name: "عميل",
    phone: null,
    alt_phone: null,
    email: null,
    address: null,
    addresses: null,
    birthday: null,
    gender: null,
    preferred_language: null,
    preferred_order_type: null,
    preferred_payment_method: null,
    loyalty_points: 0,
    loyalty_tier: null,
    marketing_opt_in: false,
    sms_opt_in: false,
    whatsapp_opt_in: false,
    is_blocked: false,
    block_reason: null,
    is_vip: false,
    tags: null,
    allergy_note: null,
    delivery_instructions: null,
    notes: null,
    created_at: "2026-07-01T10:00:00.000Z",
    updated_at: "2026-07-01T10:00:00.000Z",
    orders_count: 0,
    last_order_at: null,
    total_spent: 0,
    avg_order: null,
    branch_name: null,
    ...overrides,
  };
}

const HEADERS = ["الاسم", "الهاتف", "عدد الطلبات", "آخر طلب", "إجمالي الإنفاق", "متوسط الطلب", "الفرع", "الحالة", "تاريخ الإنشاء"];

function lastRequestUrl(): URL {
  const call = apiMock.mock.calls.at(-1)!;
  return new URL(String(call[0]), "http://local.invalid");
}

beforeEach(() => {
  apiMock.mockReset();
  apiMock.mockResolvedValue({ data: [], next_cursor: null, has_more: false });
});

describe("W4f rich sortable customers table", () => {
  it("renders all 9 sortable headers with default aria-sort on created_at", async () => {
    apiMock.mockResolvedValue({ data: [row({ name: "أحمد" })], next_cursor: null, has_more: false });
    render(<Customers />);
    await waitFor(() => expect(screen.getByText("أحمد")).toBeTruthy());
    for (const label of HEADERS) expect(screen.getByRole("button", { name: `ترتيب حسب ${label}` })).toBeTruthy();
    const created = screen.getByRole("button", { name: "ترتيب حسب تاريخ الإنشاء" }).closest("th")!;
    expect(created.getAttribute("aria-sort")).toBe("descending");
    const url = lastRequestUrl();
    expect(url.searchParams.get("sort")).toBe("created_at");
    expect(url.searchParams.get("direction")).toBe("desc");
    expect(url.searchParams.get("cursor")).toBeNull();
  });

  it("changes sort server-side, resets the cursor, and toggles direction on repeat click", async () => {
    apiMock.mockResolvedValue({ data: [row({ name: "سارة" })], next_cursor: "CUR1", has_more: true });
    render(<Customers />);
    await waitFor(() => expect(screen.getByText("سارة")).toBeTruthy());

    const spendBtn = screen.getByRole("button", { name: "ترتيب حسب إجمالي الإنفاق" });
    fireEvent.click(spendBtn);
    await waitFor(() => expect(lastRequestUrl().searchParams.get("sort")).toBe("total_spent"));
    let url = lastRequestUrl();
    expect(url.searchParams.get("direction")).toBe("desc");
    expect(url.searchParams.get("cursor")).toBeNull(); // cursor reset on sort change
    expect(spendBtn.closest("th")!.getAttribute("aria-sort")).toBe("descending");

    fireEvent.click(spendBtn);
    await waitFor(() => expect(lastRequestUrl().searchParams.get("direction")).toBe("asc"));
    url = lastRequestUrl();
    expect(url.searchParams.get("cursor")).toBeNull();
    await waitFor(() => expect(spendBtn.closest("th")!.getAttribute("aria-sort")).toBe("ascending"));
  });

  it("supports keyboard activation (native button in th)", async () => {
    apiMock.mockResolvedValue({ data: [row({ name: "كريم" })], next_cursor: null, has_more: false });
    render(<Customers />);
    await waitFor(() => expect(screen.getByText("كريم")).toBeTruthy());
    const nameBtn = screen.getByRole("button", { name: "ترتيب حسب الاسم" });
    expect(nameBtn.tagName).toBe("BUTTON"); // Enter/Space activation for free
    nameBtn.focus();
    fireEvent.click(nameBtn);
    await waitFor(() => expect(lastRequestUrl().searchParams.get("sort")).toBe("name"));
    expect(lastRequestUrl().searchParams.get("direction")).toBe("asc"); // text columns start ascending
  });

  it("loads the next page via next_cursor without re-sorting client-side", async () => {
    const first = [row({ id: "11111111-1111-4111-8111-111111111111", name: "ب أول", total_spent: 10 })];
    const second = [row({ id: "22222222-2222-4222-8222-222222222222", name: "أ ثاني", total_spent: 5 })];
    apiMock.mockResolvedValueOnce({ data: first, next_cursor: "CUR-A", has_more: true });
    render(<Customers />);
    await waitFor(() => expect(screen.getByText("ب أول")).toBeTruthy());

    apiMock.mockResolvedValueOnce({ data: second, next_cursor: null, has_more: false });
    fireEvent.click(screen.getByRole("button", { name: "تحميل المزيد" }));
    await waitFor(() => expect(screen.getByText("أ ثاني")).toBeTruthy());

    const url = lastRequestUrl();
    expect(url.searchParams.get("cursor")).toBe("CUR-A");
    // server order preserved: appended, not re-sorted alphabetically
    const cells = screen.getAllByRole("button", { name: /أول|ثاني/ }).map((b) => b.textContent);
    expect(cells).toEqual(["ب أول", "أ ثاني"]);
    expect(screen.queryByRole("button", { name: "تحميل المزيد" })).toBeNull();
  });

  it("formats numbers, currency, dates, and null aggregates", async () => {
    apiMock.mockResolvedValue({
      data: [row({ name: "منى", orders_count: 3, total_spent: 120, avg_order: 40, last_order_at: "2026-07-10T09:00:00.000Z", branch_name: "الفرع الرئيسي" }),
             row({ name: "صفر", orders_count: 0, total_spent: 0, avg_order: null, last_order_at: null, branch_name: null })],
      next_cursor: null,
      has_more: false,
    });
    render(<Customers />);
    await waitFor(() => expect(screen.getByText("منى")).toBeTruthy());
    expect(screen.getByText("120.00 ج.م")).toBeTruthy();
    expect(screen.getByText("40.00 ج.م")).toBeTruthy();
    expect(screen.getByText("الفرع الرئيسي")).toBeTruthy();
    const zeroRow = screen.getByText("صفر").closest("tr")!;
    expect(zeroRow.textContent).toContain("—"); // null avg/last order render as dash, not 0
  });

  it("shows empty and error states", async () => {
    render(<Customers />);
    await waitFor(() => expect(screen.getByText("لا عملاء بعد")).toBeTruthy());

    apiMock.mockRejectedValue(new Error("تعذر الاتصال"));
    fireEvent.change(screen.getByPlaceholderText("ابحث بالاسم أو الهاتف…"), { target: { value: "x" } });
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("تعذر الاتصال"));
  });
});
