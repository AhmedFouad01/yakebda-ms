/**
 * Inventory Admin — wire DTOs matching the CURRENT API responses exactly
 * (apps/api/src/modules/inventory.ts). Quantities and values arrive as
 * strings from the backend (authoritative, 4–6 dp); the UI never computes
 * balances or valuation — it only formats what the server returned.
 */

export interface InventoryLocation {
  id: string;
  account_id: string;
  branch_id: string;
  name_ar: string;
  is_default?: boolean;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface InventoryUnit {
  id: string;
  account_id: string;
  name_ar: string;
  symbol: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface InventoryUnitConversion {
  id: string;
  account_id: string;
  from_unit_id: string;
  to_unit_id: string;
  factor: string;
  created_at?: string;
  updated_at?: string;
}

export interface InventoryItem {
  id: string;
  account_id: string;
  base_unit_id: string;
  name_ar: string;
  sku: string | null;
  reorder_level: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface InventorySupplier {
  id: string;
  account_id: string;
  name_ar: string;
  phone: string | null;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

/** Row of GET /inventory/levels — item × location with authoritative aggregates. */
export interface InventoryLevelRow {
  item_id: string;
  name_ar: string;
  base_unit_id: string;
  reorder_level: string;
  location_id: string;
  location_name_ar: string;
  branch_id: string;
  quantity_on_hand: string;
  stock_value: string;
}

/** Row of GET /inventory/movements (stock_movements.*). */
export interface InventoryMovementRow {
  id: string;
  account_id: string;
  branch_id: string;
  location_id: string;
  item_id: string;
  supplier_id: string | null;
  movement_type: string;
  quantity_base: string;
  unit_cost: string;
  total_value: string;
  source_type: string;
  source_id: string | null;
  idempotency_key: string;
  reversal_of_movement_id: string | null;
  transfer_group_id: string | null;
  reason: string | null;
  created_by: string | null;
  created_at: string;
}

/** Response shape of write endpoints backed by createStockMovement (e.g. POST /inventory/purchase-receipts). */
export interface StockMovement {
  id: string;
  account_id: string;
  branch_id: string;
  location_id: string;
  item_id: string;
  supplier_id: string | null;
  movement_type: string;
  quantity_base: string;
  unit_cost: string;
  total_value: string;
  source_type: string;
  source_id: string | null;
  idempotency_key: string;
  reason: string | null;
  created_by: string | null;
  reversal_of_movement_id: string | null;
  transfer_group_id: string | null;
  idempotent_replay: boolean;
}

/** Response shape of POST /inventory/transfers (transferStock) — two linked movements, not one row. */
export interface StockTransferResult {
  transfer_group_id: string;
  out: StockMovement;
  in: StockMovement;
  idempotent_replay: boolean;
}
