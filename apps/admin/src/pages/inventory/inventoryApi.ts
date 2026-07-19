import { api } from "../../lib/api";
import type {
  InventoryItem,
  InventoryLevelRow,
  InventoryLocation,
  InventoryMovementRow,
  InventorySupplier,
  InventoryUnit,
  InventoryUnitConversion,
  StockMovement,
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

/* ——— Sprint 3 — inventory operations (B1: purchase receipts only) ——— */

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

/** Actual movement_type values emitted by inventoryService/inventoryConsumption. */
export const MOVEMENT_TYPE_AR: Record<string, string> = {
  receipt: "استلام",
  issue: "صرف",
  adjustment: "تسوية",
  waste: "هدر",
  transfer_out: "تحويل صادر",
  transfer_in: "تحويل وارد",
  count_adjustment: "تسوية جرد",
  consumption: "استهلاك مبيعات",
  reversal: "حركة عكسية",
};
