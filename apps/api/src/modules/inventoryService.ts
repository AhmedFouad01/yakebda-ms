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
import { enqueueFinancialEvent } from "./financialOutbox";

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

type MovementFinancialStatus = "pending" | "pending_policy" | "non_posting";

interface MovementFinancialDisposition {
  eventType: string;
  status: MovementFinancialStatus;
  classification: string;
}

export interface CreateMovementInput {
  accountId: string;
  locationId: string;
  itemId: string;
  movementType:
    | "receipt"
    | "issue"
    | "adjustment"
    | "transfer_in"
    | "transfer_out"
    | "waste"
    | "count_adjustment"
    | "consumption"
    | "reversal";
  quantity: string | number;
  unitId?: string;
  unitCost?: string | number;
  supplierId?: string;
  sourceType: string;
  sourceId?: string;
  idempotencyKey: string;
  reason?: string;
  createdBy?: string;
  reversalOfMovementId?: string;
  transferGroupId?: string;
}

export interface MovementResult {
  id: string;
  branch_id: string;
  quantity_base: string;
  unit_cost: string;
  total_value: string;
  idempotent_replay: boolean;
}

async function financialDispositionForMovement(
  trx: Knex.Transaction,
  input: CreateMovementInput,
  totalValue: string
): Promise<MovementFinancialDisposition> {
  const eventTypes: Record<CreateMovementInput["movementType"], string> = {
    receipt: "inventory.receipt",
    issue: "inventory.issue",
    adjustment: "inventory.adjustment",
    transfer_in: "inventory.transfer",
    transfer_out: "inventory.transfer",
    waste: "inventory.waste",
    count_adjustment: "inventory.adjustment",
    consumption: "inventory.consumption",
    reversal: "inventory.reversal",
  };
  const eventType = eventTypes[input.movementType];
  if (parseDecimal(totalValue, 4) === 0n) {
    return { eventType, status: "non_posting", classification: "zero_value" };
  }
  if (input.movementType === "issue") {
    return { eventType, status: "pending_policy", classification: "generic_issue_policy_required" };
  }
  if (input.movementType === "transfer_in" || input.movementType === "transfer_out") {
    return { eventType, status: "non_posting", classification: "internal_value_transfer" };
  }
  if (input.movementType === "reversal") {
    const originalEvent = await trx("financial_events")
      .where({
        account_id: input.accountId,
        source_type: "stock_movement",
        source_id: input.reversalOfMovementId,
      })
      .first();
    if (!originalEvent) {
      return { eventType, status: "pending_policy", classification: "original_financial_event_missing" };
    }
    if (originalEvent.status === "non_posting") {
      return { eventType, status: "non_posting", classification: "reversal_of_non_posting" };
    }
    if (originalEvent.status === "pending_policy") {
      return { eventType, status: "pending_policy", classification: "reversal_policy_required" };
    }
  }
  return { eventType, status: "pending", classification: "journal_required" };
}

async function createStockMovementInTransaction(
  trx: Knex.Transaction,
  input: CreateMovementInput
): Promise<MovementResult> {
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
    if (!new Set(["adjustment", "count_adjustment", "reversal"]).has(input.movementType) && quantity <= 0n) {
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

    if (new Set(["issue", "transfer_out", "waste", "consumption"]).has(input.movementType)) quantity = -quantity;
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

    if (input.movementType === "reversal") {
      if (!input.reversalOfMovementId) {
        throw err.validation({ reversal_of_movement_id: "A reversal must reference its original movement" });
      }
      const original = await trx("stock_movements")
        .where({ id: input.reversalOfMovementId, account_id: input.accountId })
        .forUpdate()
        .first();
      if (!original) throw err.notFound();
      if (original.location_id !== location.id || original.item_id !== item.id) throw err.conflict();
    } else if (input.reversalOfMovementId) {
      throw err.validation({ reversal_of_movement_id: "Only reversal movements may reference an original movement" });
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
      reversal_of_movement_id: input.reversalOfMovementId ?? null,
      transfer_group_id: input.transferGroupId ?? null,
    };
    await trx("stock_movements").insert(row);
    const disposition = await financialDispositionForMovement(trx, input, row.total_value);
    await enqueueFinancialEvent(trx, {
      accountId: input.accountId,
      branchId: location.branch_id,
      sourceType: "stock_movement",
      sourceId: id,
      eventType: disposition.eventType,
      idempotencyKey: `stock-movement:${id}:${disposition.eventType}:v2`,
      payloadVersion: 2,
      initialStatus: disposition.status,
      payload: {
        version: 2,
        valuation_policy: "moving_weighted_average",
        valuation_policy_version: 1,
        accounting_classification: disposition.classification,
        extended_value: row.total_value,
        source_reference: { type: row.source_type, id: row.source_id },
        ...row,
      },
    });
    return { ...row, idempotent_replay: false };
}

export async function createStockMovement(db: Knex, input: CreateMovementInput): Promise<MovementResult> {
  return db.transaction((trx) => createStockMovementInTransaction(trx, input));
}

export interface TransferStockInput {
  accountId: string;
  sourceLocationId: string;
  destinationLocationId: string;
  itemId: string;
  quantity: string | number;
  unitId?: string;
  idempotencyKey: string;
  reason: string;
  createdBy: string;
}

export async function transferStock(db: Knex, input: TransferStockInput) {
  if (input.sourceLocationId === input.destinationLocationId) {
    throw err.validation({ destination_location_id: "يجب اختيار موقع مخزون مختلف" });
  }
  return db.transaction(async (trx) => {
    const existingOut = await trx("stock_movements")
      .where({ account_id: input.accountId, idempotency_key: `${input.idempotencyKey}:out` })
      .first();
    if (existingOut) {
      const existingIn = await trx("stock_movements")
        .where({ account_id: input.accountId, idempotency_key: `${input.idempotencyKey}:in` })
        .first();
      if (!existingIn) throw err.conflict();
      return { transfer_group_id: existingOut.transfer_group_id, out: existingOut, in: existingIn, idempotent_replay: true };
    }

    const transferGroupId = newId();
    const outbound = await createStockMovementInTransaction(trx, {
      accountId: input.accountId,
      locationId: input.sourceLocationId,
      itemId: input.itemId,
      movementType: "transfer_out",
      quantity: input.quantity,
      unitId: input.unitId,
      sourceType: "inventory_transfer",
      sourceId: transferGroupId,
      idempotencyKey: `${input.idempotencyKey}:out`,
      reason: input.reason,
      createdBy: input.createdBy,
      transferGroupId,
    });
    const inbound = await createStockMovementInTransaction(trx, {
      accountId: input.accountId,
      locationId: input.destinationLocationId,
      itemId: input.itemId,
      movementType: "transfer_in",
      quantity: input.quantity,
      unitId: input.unitId,
      unitCost: outbound.unit_cost,
      sourceType: "inventory_transfer",
      sourceId: transferGroupId,
      idempotencyKey: `${input.idempotencyKey}:in`,
      reason: input.reason,
      createdBy: input.createdBy,
      transferGroupId,
    });
    return { transfer_group_id: transferGroupId, out: outbound, in: inbound, idempotent_replay: false };
  });
}

export interface StockCountInput {
  accountId: string;
  locationId: string;
  itemId: string;
  countedQuantity: string | number;
  idempotencyKey: string;
  reason: string;
  createdBy: string;
}

export async function recordStockCount(db: Knex, input: StockCountInput) {
  return db.transaction(async (trx) => {
    const replay = await trx("inventory_stock_counts")
      .where({ account_id: input.accountId, idempotency_key: input.idempotencyKey })
      .first();
    if (replay) return { ...replay, idempotent_replay: true };

    const item = await trx<InventoryItemRow>("inventory_items")
      .where({ id: input.itemId, account_id: input.accountId, is_active: true })
      .forUpdate()
      .first();
    if (!item) throw err.notFound();
    const location = await trx<InventoryLocationRow>("inventory_locations")
      .where({ id: input.locationId, account_id: input.accountId, is_active: true })
      .first();
    if (!location) throw err.notFound();

    const balance = await trx("stock_movements")
      .where({ account_id: input.accountId, location_id: input.locationId, item_id: input.itemId })
      .select(trx.raw("coalesce(sum(quantity_base), 0)::text as quantity"))
      .first<{ quantity: string }>();
    const expected = parseDecimal(balance?.quantity ?? "0", 6);
    const counted = parseDecimal(input.countedQuantity, 6);
    if (counted < 0n) throw err.validation({ counted_quantity: "الكمية الفعلية لا يمكن أن تكون سالبة" });
    const difference = counted - expected;
    const countId = newId();
    let movementId: string | null = null;
    if (difference !== 0n) {
      const movement = await createStockMovementInTransaction(trx, {
        accountId: input.accountId,
        locationId: input.locationId,
        itemId: input.itemId,
        movementType: "count_adjustment",
        quantity: formatDecimal(difference, 6),
        sourceType: "inventory_stock_count",
        sourceId: countId,
        idempotencyKey: `${input.idempotencyKey}:movement`,
        reason: input.reason,
        createdBy: input.createdBy,
      });
      movementId = movement.id;
    }
    const row = {
      id: countId,
      account_id: input.accountId,
      branch_id: location.branch_id,
      location_id: location.id,
      item_id: item.id,
      expected_quantity: formatDecimal(expected, 6),
      counted_quantity: formatDecimal(counted, 6),
      difference_quantity: formatDecimal(difference, 6),
      idempotency_key: input.idempotencyKey,
      reason: input.reason,
      movement_id: movementId,
      created_by: input.createdBy,
    };
    await trx("inventory_stock_counts").insert(row);
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
