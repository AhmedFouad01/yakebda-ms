import { api } from "../../lib/api";
import type {
  InventoryItem,
  InventoryLevelRow,
  InventoryLocation,
  InventoryMovementRow,
  InventorySupplier,
  InventoryUnit,
  InventoryUnitConversion,
  StockCountRecord,
  StockMovement,
  StockTransferResult,
} from "./inventoryTypes";

/**
 * Inventory Admin — thin typed wrappers over the CURRENT endpoints only.
 * No invented endpoints; anything the API does not support is documented
 * as a gap in the PR, not simulated here.
 */

export function fetchInventoryLocations() {
  return api<{ data: InventoryLocation[] }>("/inventory/locations");
}

export function fetchInventoryUnits() {
  return api<{ data: InventoryUnit[] }>("/inventory/units");
}

export function fetchInventoryItems() {
  return api<{ data: InventoryItem[] }>("/inventory/items");
}

export function fetchInventorySuppliers() {
  return api<{ data: InventorySupplier[] }>("/inventory/suppliers");
}

export function fetchInventoryLevels() {
  return api<{ data: InventoryLevelRow[] }>("/inventory/levels");
}

export function fetchInventoryMovements(filters: { location_id?: string; item_id?: string } = {}) {
  const params = new URLSearchParams();
  if (filters.location_id) params.set("location_id", filters.location_id);
  if (filters.item_id) params.set("item_id", filters.item_id);
  const qs = params.toString();
  return api<{ data: InventoryMovementRow[] }>(`/inventory/movements${qs ? `?${qs}` : ""}`);
}

/* ——— Sprint 2 — master-data creates (the ONLY writes the current API supports) ——— */

export function createInventoryUnit(body: { name_ar: string; symbol: string }) {
  return api<{ data: InventoryUnit }>("/inventory/units", { method: "POST", body });
}

export function createInventoryConversion(body: { from_unit_id: string; to_unit_id: string; factor: string }) {
  return api<{ data: InventoryUnitConversion }>("/inventory/unit-conversions", { method: "POST", body });
}

export function createInventoryItem(body: { name_ar: string; sku?: string; base_unit_id: string; reorder_level?: string }) {
  return api<{ data: InventoryItem }>("/inventory/items", { method: "POST", body });
}

export function createInventorySupplier(body: { name_ar: string; phone?: string }) {
  return api<{ data: InventorySupplier }>("/inventory/suppliers", { method: "POST", body });
}

/* ——— Sprint 3 — inventory operations (B1: purchase receipts, B2: issue, B3: waste, B4: adjustment, B5: transfer, B6: stock count) ——— */

export function createInventoryPurchaseReceipt(body: {
  location_id: string;
  item_id: string;
  supplier_id: string;
  quantity: string;
  unit_id?: string;
  unit_cost: string;
  receipt_reference: string;
  idempotency_key: string;
}) {
  return api<{ data: StockMovement }>("/inventory/purchase-receipts", { method: "POST", body });
}

export function createInventoryIssue(body: {
  location_id: string;
  item_id: string;
  quantity: string;
  unit_id?: string;
  reason: string;
  idempotency_key: string;
}) {
  return api<{ data: StockMovement }>("/inventory/movements", {
    method: "POST",
    body: { ...body, movement_type: "issue", source_type: "inventory_issue" },
  });
}

export function createInventoryWaste(body: {
  location_id: string;
  item_id: string;
  quantity: string;
  unit_id?: string;
  reason: string;
  idempotency_key: string;
}) {
  return api<{ data: StockMovement }>("/inventory/waste", { method: "POST", body });
}

export function createInventoryAdjustment(body: {
  location_id: string;
  item_id: string;
  quantity: string; // إشارة موقّعة (+/-) — العميل يحدد الاتجاه، الخادم لا يحسب فرقًا
  unit_id?: string;
  unit_cost?: string;
  reason: string;
  idempotency_key: string;
}) {
  return api<{ data: StockMovement }>("/inventory/movements", {
    method: "POST",
    body: { ...body, movement_type: "adjustment", source_type: "inventory_adjustment" },
  });
}

export function createInventoryTransfer(body: {
  source_location_id: string;
  destination_location_id: string;
  item_id: string;
  quantity: string; // بالوحدة الأساسية للصنف دائمًا — لا unit_id يُرسل (B5: لا محدد وحدة في الواجهة، والعقد لا يقبل unit_cost أصلًا)
  reason: string;
  idempotency_key: string;
}) {
  return api<{ data: StockTransferResult }>("/inventory/transfers", { method: "POST", body });
}

export function recordInventoryStockCount(body: {
  location_id: string;
  item_id: string;
  counted_quantity: string; // بالوحدة الأساسية للصنف دائمًا — عقد الجرد لا يقبل unit_id أصلًا (B6)
  reason: string;
  idempotency_key: string;
}) {
  // صنف واحد لكل طلب — لا يوجد endpoint جلسة/قائمة؛ ورقة العد في الواجهة
  // هي N نداءات مستقلة، كلٌّ بمعاملته الخاصة على الخادم (لا ذرّية عبر الأصناف).
  return api<{ data: StockCountRecord }>("/inventory/stock-counts", { method: "POST", body });
}

/** 409 = الخادم منع الرصيد من أن يصبح سالبًا؛ الرسالة العامة من الخادم غير سياقية، فنستبدلها بالطلب. */
export function isInsufficientStockError(err: unknown): boolean {
  return (err as { status?: number })?.status === 409;
}

/** يستخرج أخطاء الحقول من ApiFail.details (zod flatten أو خرائط الحقول من الخادم). */
export function fieldErrorsOf(err: unknown): Record<string, string> {
  const details = (err as { details?: unknown })?.details;
  if (!details || typeof details !== "object") return {};
  const out: Record<string, string> = {};
  const record = details as Record<string, unknown>;
  const fieldErrors = record.fieldErrors;
  if (fieldErrors && typeof fieldErrors === "object") {
    for (const [k, v] of Object.entries(fieldErrors as Record<string, unknown>)) {
      if (Array.isArray(v) && v.length) out[k] = String(v[0]);
    }
    return out;
  }
  for (const [k, v] of Object.entries(record)) {
    if (typeof v === "string") out[k] = v;
    else if (Array.isArray(v) && v.length) out[k] = String(v[0]);
  }
  return out;
}

/** «غير متاح» بدل الصفر الزائف: لا fallback صفري لقيم مفقودة أو غير صالحة. */
export const NA = "غير متاح";

export function fmtQuantity(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return NA;
  const n = Number(value);
  if (!Number.isFinite(n)) return NA;
  // الكمية الأساسية تصل حتى 6 منازل — نعرض حتى 3 ونشيل الأصفار الزائدة.
  return n.toLocaleString("en", { minimumFractionDigits: 0, maximumFractionDigits: 3 });
}

export function fmtMoney(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return NA;
  const n = Number(value);
  if (!Number.isFinite(n)) return NA;
  return `${n.toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م`;
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return NA;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return NA;
  return d.toLocaleString("ar-EG", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

// UX-LANG-01: movement_type labels now live in lib/labels.ts (movementTypeLabel)
// so every module renders the same Arabic wording and unknown values never
// fall through to a raw code.
