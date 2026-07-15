import { Knex } from "knex";
import { err } from "../lib/errors";
import { newId } from "../lib/ids";
import {
  averageUnitCost,
  convertQuantity,
  formatDecimal,
  parseDecimal,
  valueFromQuantity,
} from "../lib/inventoryMath";

interface InventoryItemRow {
  id: string;
  account_id: string;
  base_unit_id: string;
  is_active: boolean;
}

interface InventoryLocationRow {
  id: string;
  account_id: string;
  branch_id: string;
  is_active: boolean;
}

interface ConversionRow {
  account_id: string;
  from_unit_id: string;
  to_unit_id: string;
  factor: string;
}

interface BalanceRow {
  quantity: string;
  value: string;
}

export interface CreateMovementInput {
  accountId: string;
  locationId: string;
  itemId: string;
  movementType: "receipt" | "issue" | "adjustment";
  quantity: string | number;
  unitId?: string;
  unitCost?: string | number;
  supplierId?: string;
  sourceType: string;
  sourceId?: string;
  idempotencyKey: string;
  reason?: string;
  createdBy?: string;
}

export interface MovementResult {
  id: string;
  branch_id: string;
  quantity_base: string;
  unit_cost: string;
  total_value: string;
  idempotent_replay: boolean;
}

export async function createStockMovement(db: Knex, input: CreateMovementInput): Promise<MovementResult> {
  return db.transaction(async (trx) => {
    const replay = await trx("stock_movements")
      .where({ account_id: input.accountId, idempotency_key: input.idempotencyKey })
      .first();
    if (replay) return { ...replay, idempotent_replay: true } as MovementResult;

    const location = await trx<InventoryLocationRow>("inventory_locations")
      .where({ id: input.locationId, account_id: input.accountId, is_active: true })
      .first();
    if (!location) throw err.notFound();

    const item = await trx<InventoryItemRow>("inventory_items")
      .where({ id: input.itemId, account_id: input.accountId, is_active: true })
      .forUpdate()
      .first();
    if (!item) throw err.notFound();

    let quantity = parseDecimal(input.quantity, 6);
    if (input.movementType !== "adjustment" && quantity <= 0n) {
      throw err.validation({ quantity: "يجب أن تكون الكمية أكبر من صفر" });
    }
    if (quantity === 0n) throw err.validation({ quantity: "الكمية لا يمكن أن تكون صفرًا" });

    if (input.unitId && input.unitId !== item.base_unit_id) {
      const conversion = await trx<ConversionRow>("inventory_unit_conversions")
        .where({
          account_id: input.accountId,
          from_unit_id: input.unitId,
          to_unit_id: item.base_unit_id,
        })
        .first();
      if (!conversion) throw err.validation({ unit_id: "لا يوجد تحويل معتمد إلى وحدة الصنف الأساسية" });
      quantity = convertQuantity(quantity, parseDecimal(conversion.factor, 8));
    }

    if (input.movementType === "issue") quantity = -quantity;
    const balance = await trx("stock_movements")
      .where({ account_id: input.accountId, location_id: input.locationId, item_id: input.itemId })
      .select(
        trx.raw("coalesce(sum(quantity_base), 0)::text as quantity"),
        trx.raw("coalesce(sum(total_value), 0)::text as value")
      )
      .first<BalanceRow>();
    const currentQuantity = parseDecimal(balance?.quantity ?? "0", 6);
    const currentValue = parseDecimal(balance?.value ?? "0", 4);
    const nextQuantity = currentQuantity + quantity;
    if (nextQuantity < 0n) {
      throw err.conflict();
    }

    let unitCost: bigint;
    if (quantity > 0n && input.unitCost !== undefined) {
      unitCost = parseDecimal(input.unitCost, 4);
      if (unitCost < 0n) throw err.validation({ unit_cost: "التكلفة لا يمكن أن تكون سالبة" });
    } else {
      unitCost = averageUnitCost(currentValue, currentQuantity);
      if (quantity > 0n && unitCost === 0n) {
        throw err.validation({ unit_cost: "التكلفة مطلوبة لأول رصيد وارد" });
      }
    }
    const totalValue = valueFromQuantity(quantity, unitCost);
    if (currentValue + totalValue < 0n) throw err.conflict();

    if (input.supplierId) {
      const supplier = await trx("inventory_suppliers")
        .where({ id: input.supplierId, account_id: input.accountId, is_active: true })
        .first();
      if (!supplier) throw err.notFound();
    }

    const id = newId();
    const row = {
      id,
      account_id: input.accountId,
      branch_id: location.branch_id,
      location_id: location.id,
      item_id: item.id,
      supplier_id: input.supplierId ?? null,
      movement_type: input.movementType,
      quantity_base: formatDecimal(quantity, 6),
      unit_cost: formatDecimal(unitCost, 4),
      total_value: formatDecimal(totalValue, 4),
      source_type: input.sourceType,
      source_id: input.sourceId ?? null,
      idempotency_key: input.idempotencyKey,
      reason: input.reason ?? null,
      created_by: input.createdBy ?? null,
    };
    await trx("stock_movements").insert(row);
    return { ...row, idempotent_replay: false };
  });
}

export async function ensureInventoryDefaults(db: Knex, accountId: string): Promise<void> {
  const units = [
    { name_ar: "قطعة", symbol: "pc" },
    { name_ar: "كيلوجرام", symbol: "kg" },
    { name_ar: "جرام", symbol: "g" },
    { name_ar: "لتر", symbol: "l" },
    { name_ar: "ملليلتر", symbol: "ml" },
  ];
  for (const unit of units) {
    await db("inventory_units")
      .insert({ id: newId(), account_id: accountId, ...unit })
      .onConflict(["account_id", "symbol"])
      .ignore();
  }

  const branches = await db("branches").where({ account_id: accountId }).select("id", "name");
  for (const branch of branches) {
    const existing = await db("inventory_locations")
      .where({ account_id: accountId, branch_id: branch.id, is_default: true })
      .first();
    if (!existing) {
      await db("inventory_locations").insert({
        id: newId(),
        account_id: accountId,
        branch_id: branch.id,
        name_ar: `مخزون ${branch.name}`,
        is_default: true,
      });
    }
  }
}
