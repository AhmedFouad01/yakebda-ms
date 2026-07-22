import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { InventoryPage } from "./InventoryPage";

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

class ApiFailLike extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message);
  }
}

const UNIT_A = { id: "33333333-3333-4333-8333-333333333333", account_id: "a", name_ar: "كيلوجرام", symbol: "كجم", is_active: true };
const UNIT_B = { id: "55555555-5555-4555-8555-555555555555", account_id: "a", name_ar: "جرام", symbol: "جم", is_active: true };
const SUPPLIER = { id: "66666666-6666-4666-8666-666666666666", account_id: "a", name_ar: "مورد الدواجن", phone: "0100000001", is_active: true };
const ITEM = { id: "44444444-4444-4444-8444-444444444444", account_id: "a", base_unit_id: UNIT_A.id, name_ar: "فراخ طازجة", sku: "CHK-1", reorder_level: "5.000000", is_active: true };

function primeApi(mutations: { failCreate?: ApiFailLike } = {}) {
  apiMock.mockImplementation(async (path: string, opts?: { method?: string }) => {
    if (opts?.method === "POST") {
      if (mutations.failCreate) throw mutations.failCreate;
      return { data: { id: "new-id" } };
    }
    if (path.startsWith("/inventory/locations")) return { data: [] };
    if (path.startsWith("/inventory/units")) return { data: [UNIT_A, UNIT_B] };
    if (path.startsWith("/inventory/items")) return { data: [ITEM] };
    if (path.startsWith("/inventory/suppliers")) return { data: [SUPPLIER] };
    if (path.startsWith("/branches")) return { data: [] };
    if (path.startsWith("/inventory/levels")) return { data: [] };
    if (path.startsWith("/inventory/movements")) return { data: [] };
    throw new Error("unexpected path " + path);
  });
}

async function openTab(name: string) {
  fireEvent.click(screen.getByRole("tab", { name }));
}

beforeEach(() => {
  apiMock.mockReset();
  canMock.mockReset();
  canMock.mockReturnValue(true); // manager by default
});

describe("Sprint 2 — master data tabs and permission gating", () => {
  it("shows units/items/suppliers lists with add actions for managers", async () => {
    primeApi();
    render(<InventoryPage />);
    await waitFor(() => expect(screen.getByRole("tab", { name: "الوحدات" })).toBeTruthy());

    await openTab("الوحدات");
    expect(screen.getByText("كيلوجرام")).toBeTruthy();
    expect(screen.getByRole("button", { name: "+ وحدة جديدة" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "+ معامل تحويل" })).toBeTruthy();

    await openTab("الأصناف");
    expect(screen.getByText("فراخ طازجة")).toBeTruthy();
    expect(screen.getByRole("button", { name: "+ صنف جديد" })).toBeTruthy();

    await openTab("الموردون");
    expect(screen.getByText("مورد الدواجن")).toBeTruthy();
    expect(screen.getByRole("button", { name: "+ مورد جديد" })).toBeTruthy();
  });

  it("hides every management action for view-only users while keeping lists readable", async () => {
    canMock.mockImplementation((p: string) => p === "inventory.view");
    primeApi();
    render(<InventoryPage />);
    await waitFor(() => expect(screen.getByRole("tab", { name: "الوحدات" })).toBeTruthy());

    await openTab("الوحدات");
    expect(screen.getByText("كيلوجرام")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /\+ (وحدة|معامل)/ })).toBeNull();

    await openTab("الأصناف");
    expect(screen.getByText("فراخ طازجة")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /\+ صنف/ })).toBeNull();

    await openTab("الموردون");
    expect(screen.getByText("مورد الدواجن")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /\+ مورد/ })).toBeNull();
    expect(document.querySelector(".uif-viewonly")).toBeTruthy();
  });

  it("creates a unit only after server confirmation and refetches lists", async () => {
    primeApi();
    render(<InventoryPage />);
    await waitFor(() => expect(screen.getByRole("tab", { name: "الوحدات" })).toBeTruthy());
    await openTab("الوحدات");

    fireEvent.click(screen.getByRole("button", { name: "+ وحدة جديدة" }));
    const dialog = await screen.findByRole("dialog");
    const submit = screen.getByRole("button", { name: "إضافة" });
    expect((submit as HTMLButtonElement).disabled).toBe(true); // invalid until both fields present

    fireEvent.change(screen.getByLabelText(/اسم الوحدة/), { target: { value: "لتر" } });
    fireEvent.change(screen.getByLabelText(/الرمز/), { target: { value: "ل" } });
    expect((submit as HTMLButtonElement).disabled).toBe(false);

    const refetchesBefore = apiMock.mock.calls.filter((c) => String(c[0]).startsWith("/inventory/units") && !c[1]).length;
    fireEvent.click(submit);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    const post = apiMock.mock.calls.find((c) => String(c[0]) === "/inventory/units" && (c[1] as { method?: string })?.method === "POST");
    expect(post).toBeTruthy();
    expect((post![1] as { body: { name_ar: string; symbol: string } }).body).toEqual({ name_ar: "لتر", symbol: "ل" });
    const refetchesAfter = apiMock.mock.calls.filter((c) => String(c[0]).startsWith("/inventory/units") && !c[1]).length;
    expect(refetchesAfter).toBeGreaterThan(refetchesBefore); // invalidate/refetch after success
    expect(dialog).toBeTruthy();
  });

  it("shows server field errors inline and preserves input after rejection", async () => {
    primeApi({ failCreate: new ApiFailLike(409, "رمز الوحدة مستخدم بالفعل في هذا الحساب.", { symbol: "رمز الوحدة مستخدم بالفعل في هذا الحساب." }) });
    render(<InventoryPage />);
    await waitFor(() => expect(screen.getByRole("tab", { name: "الوحدات" })).toBeTruthy());
    await openTab("الوحدات");

    fireEvent.click(screen.getByRole("button", { name: "+ وحدة جديدة" }));
    await screen.findByRole("dialog");
    fireEvent.change(screen.getByLabelText(/اسم الوحدة/), { target: { value: "كيلو" } });
    fireEvent.change(screen.getByLabelText(/الرمز/), { target: { value: "كجم" } });
    fireEvent.click(screen.getByRole("button", { name: "إضافة" }));

    await waitFor(() => expect(screen.getByText("رمز الوحدة مستخدم بالفعل في هذا الحساب.")).toBeTruthy());
    // dialog stays open; the user's input survives the recoverable failure
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect((screen.getByLabelText(/الرمز/) as HTMLInputElement).value).toBe("كجم");
  });

  it("blocks self-conversion client-side and posts the factor as entered", async () => {
    primeApi();
    render(<InventoryPage />);
    await waitFor(() => expect(screen.getByRole("tab", { name: "الوحدات" })).toBeTruthy());
    await openTab("الوحدات");

    fireEvent.click(screen.getByRole("button", { name: "+ معامل تحويل" }));
    await screen.findByRole("dialog");
    fireEvent.change(screen.getByLabelText(/من وحدة/), { target: { value: UNIT_A.id } });
    fireEvent.change(screen.getByLabelText(/إلى وحدة/), { target: { value: UNIT_A.id } });
    fireEvent.change(screen.getByLabelText(/المعامل/), { target: { value: "1000" } });
    const submit = screen.getByRole("button", { name: "إضافة" });
    expect((submit as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("لا يمكن التحويل من وحدة إلى نفسها.")).toBeTruthy();

    fireEvent.change(screen.getByLabelText(/إلى وحدة/), { target: { value: UNIT_B.id } });
    expect((submit as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(submit);
    await waitFor(() => {
      const post = apiMock.mock.calls.find((c) => String(c[0]) === "/inventory/unit-conversions");
      expect(post).toBeTruthy();
      expect((post![1] as { body: { factor: string } }).body.factor).toBe("1000"); // precision passed through untouched
    });
  });

  it("keeps the newly delivered stock operations separate from master-data dialogs", async () => {
    primeApi();
    render(<InventoryPage />);
    await waitFor(() => expect(screen.getByRole("tab", { name: "الوحدات" })).toBeTruthy());
    expect(screen.getByRole("tab", { name: "استلام مشتريات" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "صرف" })).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
