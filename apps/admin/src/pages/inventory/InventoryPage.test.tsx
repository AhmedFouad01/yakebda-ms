import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NAV_LINKS } from "../../components/ui/AppShell";
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

const LOC1 = { id: "11111111-1111-4111-8111-111111111111", account_id: "a", branch_id: "b1", name_ar: "المخزن الرئيسي", is_active: true };
const LOC2 = { id: "22222222-2222-4222-8222-222222222222", account_id: "a", branch_id: "b2", name_ar: "مخزن الفرع الثاني", is_active: true };
const UNIT = { id: "33333333-3333-4333-8333-333333333333", account_id: "a", name_ar: "كيلوجرام", symbol: "كجم", is_active: true };
const ITEM = { id: "44444444-4444-4444-8444-444444444444", account_id: "a", base_unit_id: UNIT.id, name_ar: "فراخ طازجة", sku: "CHK-1", reorder_level: "5.000000", is_active: true };

function level(overrides: Record<string, unknown> = {}) {
  return {
    item_id: ITEM.id,
    name_ar: ITEM.name_ar,
    base_unit_id: UNIT.id,
    reorder_level: "5.000000",
    location_id: LOC1.id,
    location_name_ar: LOC1.name_ar,
    branch_id: "b1",
    quantity_on_hand: "16.000000",
    stock_value: "2880.0000",
    ...overrides,
  };
}

function primeApi(overrides: { levels?: unknown[]; movements?: unknown[]; failLevels?: boolean } = {}) {
  apiMock.mockImplementation(async (path: string) => {
    if (path.startsWith("/inventory/locations")) return { data: [LOC1, LOC2] };
    if (path.startsWith("/inventory/units")) return { data: [UNIT] };
    if (path.startsWith("/inventory/items")) return { data: [ITEM] };
    if (path.startsWith("/inventory/suppliers")) return { data: [] };
    if (path.startsWith("/branches")) return { data: [{ id: "b1", name: "الرئيسي" }, { id: "b2", name: "الثاني" }] };
    if (path.startsWith("/inventory/levels")) {
      if (overrides.failLevels) throw new Error("انقطع الاتصال بالخادم");
      return { data: overrides.levels ?? [level()] };
    }
    if (path.startsWith("/inventory/movements")) return { data: overrides.movements ?? [] };
    throw new Error("unexpected path " + path);
  });
}

beforeEach(() => {
  apiMock.mockReset();
  canMock.mockReset();
  canMock.mockReturnValue(true);
});

describe("Sprint 1 — inventory navigation & route registration", () => {
  it("registers a permission-aware nav entry for /inventory requiring inventory.view", () => {
    const entry = NAV_LINKS.find((l) => l.to === "/inventory");
    expect(entry).toBeTruthy();
    expect(entry!.perms).toEqual(["inventory.view"]);
    expect(entry!.label()).toBe("المخزون");
  });

  it("nav filtering hides the entry without inventory.view and shows it with it", () => {
    const entry = NAV_LINKS.find((l) => l.to === "/inventory")!;
    // same predicate AppShell uses: !perms || perms.some(can)
    const visibleWithout = !entry.perms || entry.perms.some((p) => p === "something.else");
    expect(visibleWithout).toBe(false);
    const visibleWith = !entry.perms || entry.perms.some((p) => p === "inventory.view");
    expect(visibleWith).toBe(true);
  });
});

describe("Sprint 1 — inventory overview (read-only)", () => {
  it("renders authoritative levels and valuation from the API without recalculation", async () => {
    primeApi();
    render(<InventoryPage />);
    await waitFor(() => expect(screen.getByText("فراخ طازجة")).toBeTruthy());
    expect(screen.getByText("16")).toBeTruthy(); // quantity_on_hand as returned (formatted)
    expect(screen.getByText("2,880.00 ج.م")).toBeTruthy(); // stock_value as returned
    expect(screen.getByText("كيلوجرام (كجم)")).toBeTruthy();
    expect(screen.getByText("المخزن الرئيسي")).toBeTruthy();
    // low-stock badge NOT shown (16 >= 5)
    expect(screen.queryByText(/تحت حد الطلب/)).toBeNull();
  });

  it("shows the low-stock badge only from server-returned reorder data", async () => {
    primeApi({ levels: [level({ quantity_on_hand: "2.000000" })] });
    render(<InventoryPage />);
    await waitFor(() => expect(screen.getByText(/تحت حد الطلب/)).toBeTruthy());
  });

  it("never renders a fake zero for invalid values", async () => {
    primeApi({ levels: [level({ quantity_on_hand: "not-a-number", stock_value: null })] });
    render(<InventoryPage />);
    await waitFor(() => expect(screen.getByText("فراخ طازجة")).toBeTruthy());
    const row = screen.getByText("فراخ طازجة").closest("tr")!;
    expect(row.textContent).toContain("غير متاح");
    expect(row.textContent).not.toContain("0.00 ج.م");
  });

  it("filters by location client-side (presentation only) and by search", async () => {
    primeApi({ levels: [level(), level({ location_id: LOC2.id, location_name_ar: LOC2.name_ar, branch_id: "b2" })] });
    render(<InventoryPage />);
    await waitFor(() => expect(screen.getAllByText("فراخ طازجة").length).toBe(2));

    fireEvent.change(screen.getByLabelText("اختيار الموقع المخزني"), { target: { value: LOC2.id } });
    await waitFor(() => expect(screen.getAllByText("فراخ طازجة").length).toBe(1));
    expect(screen.getByText("مخزن الفرع الثاني")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("بحث في الأصناف"), { target: { value: "لا يوجد" } });
    await waitFor(() => expect(screen.getByText("لا نتائج مطابقة")).toBeTruthy());
  });

  it("shows a retryable error state when levels fail", async () => {
    primeApi({ failLevels: true });
    render(<InventoryPage />);
    await waitFor(() => expect(screen.getByText(/انقطع الاتصال بالخادم/)).toBeTruthy());
    // retry works after the API recovers
    primeApi();
    fireEvent.click(screen.getByRole("button", { name: /إعادة المحاولة|retry/i }));
    await waitFor(() => expect(screen.getByText("فراخ طازجة")).toBeTruthy());
  });

  it("shows the empty state when no items exist", async () => {
    primeApi({ levels: [] });
    render(<InventoryPage />);
    await waitFor(() => expect(screen.getByText("لا أصناف مخزنية بعد")).toBeTruthy());
  });
});

describe("Sprint 1 — movements tab", () => {
  it("requests movements with current-contract filters and renders rows verbatim", async () => {
    primeApi({
      movements: [{
        id: "m1", account_id: "a", branch_id: "b1", location_id: LOC1.id, item_id: ITEM.id,
        supplier_id: null, movement_type: "receipt", quantity_base: "20.000000", unit_cost: "180.0000",
        total_value: "3600.0000", source_type: "purchase_receipt", source_id: "PO-77", idempotency_key: "k",
        reversal_of_movement_id: null, transfer_group_id: null, reason: null, created_by: null,
        created_at: "2026-07-17T10:00:00.000Z",
      }],
    });
    render(<InventoryPage />);
    await waitFor(() => expect(screen.getByText("فراخ طازجة")).toBeTruthy());
    fireEvent.click(screen.getByRole("tab", { name: "الحركات" }));
    await waitFor(() => expect(screen.getByText("استلام")).toBeTruthy());
    expect(screen.getByText("3,600.00 ج.م")).toBeTruthy();
    expect(screen.getByText(/PO-77/)).toBeTruthy();
    const movementCalls = apiMock.mock.calls.filter((c) => String(c[0]).startsWith("/inventory/movements"));
    expect(movementCalls.length).toBeGreaterThan(0);
    // item filter drives a server-side request param
    fireEvent.change(screen.getByLabelText("تصفية حسب الصنف"), { target: { value: ITEM.id } });
    await waitFor(() => {
      const last = apiMock.mock.calls.filter((c) => String(c[0]).startsWith("/inventory/movements")).at(-1)!;
      expect(String(last[0])).toContain(`item_id=${ITEM.id}`);
    });
  });
});

describe("Sprint 1 — permission behavior", () => {
  it("shows the view-only notice without inventory.manage and exposes no management actions", async () => {
    canMock.mockImplementation((p: string) => p === "inventory.view");
    primeApi();
    render(<InventoryPage />);
    await waitFor(() => expect(screen.getByText("فراخ طازجة")).toBeTruthy());
    expect(document.querySelector(".uif-viewonly")).toBeTruthy();
    // Sprint 1 exposes no create/edit/delete anywhere
    expect(screen.queryByRole("button", { name: /إضافة|تعديل|حذف|أرشفة/ })).toBeNull();
  });

  it("exposes no write calls at all (read-only sprint)", async () => {
    primeApi();
    render(<InventoryPage />);
    await waitFor(() => expect(screen.getByText("فراخ طازجة")).toBeTruthy());
    const writes = apiMock.mock.calls.filter((c) => c[1] && (c[1] as { method?: string }).method && (c[1] as { method?: string }).method !== "GET");
    expect(writes.length).toBe(0);
  });
});
