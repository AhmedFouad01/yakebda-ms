import { api } from "../../lib/api";
import type {
  InventoryItem,
  InventoryLevelRow,
  InventoryLocation,
  InventoryMovementRow,
  InventorySupplier,
  InventoryUnit,
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
