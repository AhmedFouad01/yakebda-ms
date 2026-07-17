import { Knex } from "knex";
import { ApiError, err } from "../lib/errors";
import { newId } from "../lib/ids";
import { formatDecimal, parseDecimal } from "../lib/inventoryMath";
import { createStockMovement } from "./inventoryService";

interface OrderRow {
  id: string;
  account_id: string;
  branch_id: string;
  order_no: number;
}

interface OrderItemRow {
  id: string;
  order_id: string;
  product_id: string;
  variant_id: string | null;
  qty: number;
  created_at: Date;
}

interface RecipeRow {
  id: string;
  account_id: string;
  product_id: string;
  version: number;
  variant_id: string | null;
  status: string;
}

interface RecipeItemRow {
  recipe_id: string;
  inventory_item_id: string;
  quantity_base: string;
}

interface EventItemRow {
  id: string;
  event_id: string;
  inventory_item_id: string;
  quantity_base: string;
  reverses_movement_id: string | null;
}

export interface ConsumptionProcessResult {
  eventId: string;
  status: "posted" | "failed" | "dead" | "ignored";
  attempts: number;
  error?: string;
}

function safeFailure(error: unknown): string {
  if (error instanceof ApiError) return `${error.code}: ${error.message}`.slice(0, 500);
  if (error instanceof Error) return error.message.slice(0, 500);
  return "unknown inventory consumption failure";
}

export async function createConsumptionEventForOrder(
  trx: Knex.Transaction,
  order: OrderRow,
  userId: string | null
): Promise<string> {
  const existing = await trx("inventory_consumption_events")
    .where({ account_id: order.account_id, idempotency_key: `order:${order.id}:consume:v1` })
    .first();
  if (existing) return existing.id;

  const location = await trx("inventory_locations")
    .where({ account_id: order.account_id, branch_id: order.branch_id, is_default: true, is_active: true })
    .first();
  if (!location) throw err.validation({ inventory_location: "لا يوجد موقع مخزون افتراضي للفرع" });

  const orderItems = (await trx<OrderItemRow>("order_items")
    .where({ order_id: order.id })
    .orderBy("created_at")) as OrderItemRow[];
  const snapshotItems: Array<Record<string, unknown>> = [];
  const eventItems: Array<Record<string, unknown>> = [];

  for (const orderItem of orderItems) {
    const recipes = (await trx<RecipeRow>("inventory_recipes")
      .where({ account_id: order.account_id, product_id: orderItem.product_id, status: "active" })
      .where((query) => {
        if (orderItem.variant_id) query.whereIn("variant_id", [orderItem.variant_id]).orWhereNull("variant_id");
        else query.whereNull("variant_id");
      })) as RecipeRow[];
    const recipe = recipes.sort((left, right) => {
      const leftExact = left.variant_id === orderItem.variant_id ? 1 : 0;
      const rightExact = right.variant_id === orderItem.variant_id ? 1 : 0;
      return rightExact - leftExact || right.version - left.version;
    })[0];
    if (!recipe) {
      snapshotItems.push({ order_item_id: orderItem.id, product_id: orderItem.product_id, variant_id: orderItem.variant_id, qty: orderItem.qty, recipe: null });
      continue;
    }

    const ingredients = (await trx<RecipeItemRow>("inventory_recipe_items")
      .where({ recipe_id: recipe.id })
      .orderBy("inventory_item_id")) as RecipeItemRow[];
    const ingredientSnapshots: Array<Record<string, unknown>> = [];
    for (const ingredient of ingredients) {
      const required = parseDecimal(ingredient.quantity_base, 6) * BigInt(orderItem.qty);
      const quantityBase = formatDecimal(required, 6);
      const eventItemId = newId();
      eventItems.push({
        id: eventItemId,
        order_item_id: orderItem.id,
        product_id: orderItem.product_id,
        variant_id: orderItem.variant_id,
        recipe_id: recipe.id,
        recipe_version: recipe.version,
        inventory_item_id: ingredient.inventory_item_id,
        quantity_base: quantityBase,
      });
      ingredientSnapshots.push({ inventory_item_id: ingredient.inventory_item_id, quantity_base: quantityBase });
    }
    snapshotItems.push({
      order_item_id: orderItem.id,
      product_id: orderItem.product_id,
      variant_id: orderItem.variant_id,
      qty: orderItem.qty,
      recipe_id: recipe.id,
      recipe_version: recipe.version,
      ingredients: ingredientSnapshots,
    });
  }

  const eventId = newId();
  await trx("inventory_consumption_events").insert({
    id: eventId,
    account_id: order.account_id,
    branch_id: order.branch_id,
    location_id: location.id,
    order_id: order.id,
    event_type: "consume",
    idempotency_key: `order:${order.id}:consume:v1`,
    payload_version: 1,
    payload: JSON.stringify({ version: 1, order_id: order.id, order_no: order.order_no, items: snapshotItems }),
    status: "pending",
    created_by: userId,
  });
  if (eventItems.length) {
    await trx("inventory_consumption_event_items").insert(eventItems.map((item) => ({ ...item, event_id: eventId })));
  }
  return eventId;
}

export async function processConsumptionEvent(db: Knex, eventId: string): Promise<ConsumptionProcessResult> {
  const claimed = await db("inventory_consumption_events")
    .where({ id: eventId })
    .whereIn("status", ["pending", "failed"])
    .where((query) => query.whereNull("next_attempt_at").orWhere("next_attempt_at", "<=", db.fn.now()))
    .update({
      status: "processing",
      attempts: db.raw("attempts + 1"),
      last_error: null,
      updated_at: db.fn.now(),
    })
    .returning("*");
  const event = claimed[0];
  if (!event) {
    const current = await db("inventory_consumption_events").where({ id: eventId }).first();
    if (!current) throw err.notFound();
    return { eventId, status: "ignored", attempts: Number(current.attempts) };
  }

  try {
    const items = (await db<EventItemRow>("inventory_consumption_event_items")
      .where({ event_id: event.id })
      .orderBy("id")) as EventItemRow[];
    for (const item of items) {
      if (item.reverses_movement_id) {
        const original = await db("stock_movements")
          .where({ id: item.reverses_movement_id, account_id: event.account_id })
          .first();
        if (!original) throw err.notFound();
        const result = await createStockMovement(db, {
          accountId: event.account_id,
          locationId: event.location_id,
          itemId: item.inventory_item_id,
          movementType: "reversal",
          quantity: formatDecimal(-parseDecimal(original.quantity_base, 6), 6),
          unitCost: original.unit_cost,
          sourceType: "inventory_consumption_reversal",
          sourceId: event.id,
          idempotencyKey: `${event.id}:${item.id}:reverse`,
          reason: `Reversal of consumption event ${event.reverses_event_id}`,
          createdBy: event.created_by ?? undefined,
          reversalOfMovementId: original.id,
        });
        await db("inventory_consumption_event_items").where({ id: item.id }).whereNull("stock_movement_id").update({ stock_movement_id: result.id });
      } else {
        const result = await createStockMovement(db, {
          accountId: event.account_id,
          locationId: event.location_id,
          itemId: item.inventory_item_id,
          movementType: "consumption",
          quantity: item.quantity_base,
          sourceType: "order_consumption",
          sourceId: event.order_id,
          idempotencyKey: `${event.id}:${item.id}:consume`,
          createdBy: event.created_by ?? undefined,
        });
        await db("inventory_consumption_event_items").where({ id: item.id }).whereNull("stock_movement_id").update({ stock_movement_id: result.id });
      }
    }
    await db("inventory_consumption_events").where({ id: event.id }).update({
      status: "posted",
      processed_at: db.fn.now(),
      next_attempt_at: null,
      last_error: null,
      updated_at: db.fn.now(),
    });
    return { eventId, status: "posted", attempts: Number(event.attempts) };
  } catch (error) {
    const attempts = Number(event.attempts);
    const status = attempts >= 5 ? "dead" : "failed";
    const message = safeFailure(error);
    await db("inventory_consumption_events").where({ id: event.id }).update({
      status,
      last_error: message,
      next_attempt_at: status === "failed" ? db.fn.now() : null,
      updated_at: db.fn.now(),
    });
    return { eventId, status, attempts, error: message };
  }
}

export async function createReversalEvent(
  db: Knex,
  input: { accountId: string; orderId: string; reason: string; createdBy: string }
): Promise<string> {
  return db.transaction(async (trx) => {
    const original = await trx("inventory_consumption_events")
      .where({ account_id: input.accountId, order_id: input.orderId, event_type: "consume", status: "posted" })
      .first();
    if (!original) throw err.notFound();
    const key = `order:${input.orderId}:consume-reversal:v1`;
    const existing = await trx("inventory_consumption_events").where({ account_id: input.accountId, idempotency_key: key }).first();
    if (existing) return existing.id;

    const originalItems = await trx("inventory_consumption_event_items")
      .where({ event_id: original.id })
      .whereNotNull("stock_movement_id")
      .orderBy("id");
    const eventId = newId();
    await trx("inventory_consumption_events").insert({
      id: eventId,
      account_id: original.account_id,
      branch_id: original.branch_id,
      location_id: original.location_id,
      order_id: original.order_id,
      event_type: "reverse",
      idempotency_key: key,
      payload_version: 1,
      payload: JSON.stringify({ version: 1, reverses_event_id: original.id, reason: input.reason }),
      status: "pending",
      reverses_event_id: original.id,
      created_by: input.createdBy,
    });
    if (originalItems.length) {
      await trx("inventory_consumption_event_items").insert(
        originalItems.map((item) => ({
          id: newId(),
          event_id: eventId,
          order_item_id: item.order_item_id,
          product_id: item.product_id,
          variant_id: item.variant_id,
          recipe_id: item.recipe_id,
          recipe_version: item.recipe_version,
          inventory_item_id: item.inventory_item_id,
          quantity_base: item.quantity_base,
          reverses_movement_id: item.stock_movement_id,
        }))
      );
    }
    return eventId;
  });
}
