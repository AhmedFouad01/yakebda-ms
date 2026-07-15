import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
import { config } from "../src/config";
import { makeKnex } from "../src/db/knex";
import { seedFoundation } from "../src/db/seedData";
import { newId } from "../src/lib/ids";

const db = makeKnex(config.testDatabaseUrl);
let app: ReturnType<typeof createApp>;
let token = "";
let accountId = "";
let branchId = "";
let locationId = "";
let unitId = "";
let inventoryItemId = "";
let recipeProductId = "";
let recipeVariantId: string | null = null;
let consumedOrderId = "";
let originalRecipeId = "";

const auth = () => ({ Authorization: `Bearer ${token}` });

async function createOrder(productId: string, variantId?: string | null) {
  const groups = await db("product_modifier_groups as link")
    .join("modifier_groups as group", "group.id", "link.modifier_group_id")
    .where({ "link.product_id": productId, "group.is_required": true })
    .select("group.id", "group.min_select");
  const modifierIds: string[] = [];
  for (const group of groups) {
    const ids = await db("modifiers")
      .where({ modifier_group_id: group.id, is_active: true })
      .orderBy("id")
      .limit(Number(group.min_select))
      .pluck("id");
    modifierIds.push(...ids);
  }
  const response = await request(app)
    .post("/api/v1/orders")
    .set(auth())
    .send({
      branch_id: branchId,
      order_type: "takeaway",
      submit: true,
      items: [{ product_id: productId, variant_id: variantId ?? null, qty: 1, modifier_ids: modifierIds }],
    });
  expect(response.status).toBe(201);
  return response.body.data.id as string;
}

async function completeOrder(orderId: string) {
  for (const status of ["in_kitchen", "ready", "completed"] as const) {
    const response = await request(app).patch(`/api/v1/orders/${orderId}/status`).set(auth()).send({ status });
    expect(response.status).toBe(200);
  }
}

async function createRecipe(productId: string, quantity: string, variantId?: string | null) {
  const response = await request(app)
    .post("/api/v1/inventory/recipes")
    .set(auth())
    .send({
      product_id: productId,
      variant_id: variantId ?? null,
      items: [{ inventory_item_id: inventoryItemId, quantity_base: quantity }],
    });
  expect(response.status).toBe(201);
  const activate = await request(app)
    .post(`/api/v1/inventory/recipes/${response.body.data.id}/activate`)
    .set(auth());
  expect(activate.status).toBe(200);
  expect(activate.body.data.status).toBe("active");
  return response.body.data.id as string;
}

async function receive(quantity: string, key: string) {
  const response = await request(app)
    .post("/api/v1/inventory/movements")
    .set(auth())
    .send({
      location_id: locationId,
      item_id: inventoryItemId,
      movement_type: "receipt",
      quantity,
      unit_cost: "20.0000",
      source_type: "recipe_test_receipt",
      idempotency_key: key,
    });
  expect(response.status).toBe(201);
}

beforeAll(async () => {
  await db.migrate.rollback(undefined, true);
  await db.migrate.latest();
  const seed = await seedFoundation(db);
  accountId = seed.accountId;
  branchId = seed.branchId;
  app = createApp(db);
  const login = await request(app)
    .post("/api/v1/auth/login")
    .send({ email: seed.ownerEmail, password: seed.ownerPassword });
  token = login.body.token;

  locationId = (await db("inventory_locations").where({ account_id: accountId, branch_id: branchId, is_default: true }).first()).id;
  unitId = (await db("inventory_units").where({ account_id: accountId, symbol: "kg" }).first()).id;
  const item = await request(app)
    .post("/api/v1/inventory/items")
    .set(auth())
    .send({ name_ar: "مكون وصفة اختبار", sku: "RECIPE-TEST", base_unit_id: unitId, reorder_level: "2" });
  inventoryItemId = item.body.data.id;

  const variantOrderItem = await db("order_items as item")
    .join("orders as order", "order.id", "item.order_id")
    .where({ "order.account_id": accountId })
    .whereNotNull("item.variant_id")
    .select("item.product_id", "item.variant_id")
    .first();
  recipeProductId = variantOrderItem.product_id;
  recipeVariantId = variantOrderItem.variant_id;
  await receive("10", "recipe-test-opening-stock");
  originalRecipeId = await createRecipe(recipeProductId, "0.500000", recipeVariantId);
});

afterAll(async () => {
  await db.destroy();
});

describe("Durable recipe consumption", () => {
  it("snapshots the active variant recipe and consumes exactly once", async () => {
    consumedOrderId = await createOrder(recipeProductId, recipeVariantId);
    await completeOrder(consumedOrderId);

    const event = await db("inventory_consumption_events").where({ order_id: consumedOrderId, event_type: "consume" }).first();
    expect(event.status).toBe("posted");
    const eventItem = await db("inventory_consumption_event_items").where({ event_id: event.id }).first();
    expect(eventItem.recipe_id).toBe(originalRecipeId);
    expect(eventItem.recipe_version).toBe(1);
    expect(Number(eventItem.quantity_base)).toBe(0.5);
    const movement = await db("stock_movements").where({ id: eventItem.stock_movement_id }).first();
    expect(movement.movement_type).toBe("consumption");
    expect(Number(movement.quantity_base)).toBe(-0.5);

    const duplicate = await request(app)
      .patch(`/api/v1/orders/${consumedOrderId}/status`)
      .set(auth())
      .send({ status: "completed" });
    expect(duplicate.status).toBe(422);
    expect(await db("inventory_consumption_events").where({ order_id: consumedOrderId, event_type: "consume" }).count<{ count: string }>("id as count").first()).toMatchObject({ count: "1" });
  });

  it("keeps the original snapshot after a later recipe activation", async () => {
    const replacementId = await createRecipe(recipeProductId, "0.750000", recipeVariantId);
    const original = await db("inventory_recipes").where({ id: originalRecipeId }).first();
    const replacement = await db("inventory_recipes").where({ id: replacementId }).first();
    const eventItem = await db("inventory_consumption_event_items as item")
      .join("inventory_consumption_events as event", "event.id", "item.event_id")
      .where("event.order_id", consumedOrderId)
      .select("item.recipe_id", "item.recipe_version", "item.quantity_base")
      .first();
    expect(original.status).toBe("retired");
    expect(replacement.version).toBe(2);
    expect(eventItem).toMatchObject({ recipe_id: originalRecipeId, recipe_version: 1 });
    expect(Number(eventItem.quantity_base)).toBe(0.5);
  });

  it("serializes concurrent completion and creates one consumption event", async () => {
    const orderId = await createOrder(recipeProductId, recipeVariantId);
    for (const status of ["in_kitchen", "ready"] as const) {
      const response = await request(app).patch(`/api/v1/orders/${orderId}/status`).set(auth()).send({ status });
      expect(response.status).toBe(200);
    }
    const results = await Promise.all([
      request(app).patch(`/api/v1/orders/${orderId}/status`).set(auth()).send({ status: "completed" }),
      request(app).patch(`/api/v1/orders/${orderId}/status`).set(auth()).send({ status: "completed" }),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual([200, 422]);
    const count = await db("inventory_consumption_events")
      .where({ order_id: orderId, event_type: "consume" })
      .count<{ count: string }>("id as count")
      .first();
    expect(count?.count).toBe("1");
  });

  it("records no-recipe completion explicitly without stock mutation", async () => {
    const product = await db("products")
      .where({ account_id: accountId, is_active: true })
      .whereNot("id", recipeProductId)
      .first();
    const orderId = await createOrder(product.id);
    const movementCountBefore = Number((await db("stock_movements").count<{ count: string }>("id as count").first())?.count ?? 0);
    await completeOrder(orderId);
    const event = await db("inventory_consumption_events").where({ order_id: orderId, event_type: "consume" }).first();
    expect(event.status).toBe("posted");
    expect((await db("inventory_consumption_event_items").where({ event_id: event.id })).length).toBe(0);
    const payload = typeof event.payload === "string" ? JSON.parse(event.payload) : event.payload;
    expect(payload.items[0].recipe).toBeNull();
    const movementCountAfter = Number((await db("stock_movements").count<{ count: string }>("id as count").first())?.count ?? 0);
    expect(movementCountAfter).toBe(movementCountBefore);
  });

  it("keeps failed consumption durable and retries after stock arrives", async () => {
    const product = await db("products")
      .where({ account_id: accountId, is_active: true })
      .whereNot("id", recipeProductId)
      .orderBy("id")
      .first();
    await createRecipe(product.id, "100.000000");
    const orderId = await createOrder(product.id);
    await completeOrder(orderId);
    const failed = await db("inventory_consumption_events").where({ order_id: orderId, event_type: "consume" }).first();
    expect(failed.status).toBe("failed");
    expect(failed.last_error).toContain("conflict");

    await receive("200", "recipe-test-retry-stock");
    const retry = await request(app)
      .post(`/api/v1/inventory/consumption-events/${failed.id}/retry`)
      .set(auth());
    expect(retry.status).toBe(200);
    expect(retry.body.data.status).toBe("posted");
    const posted = await db("inventory_consumption_events").where({ id: failed.id }).first();
    expect(posted.attempts).toBe(2);
  });

  it("restores stock only through an explicit linked reversal", async () => {
    const before = await db("stock_movements")
      .where({ account_id: accountId, location_id: locationId, item_id: inventoryItemId })
      .sum("quantity_base as quantity")
      .first();
    const order = await db("orders").where({ id: consumedOrderId }).first();
    const payment = await request(app)
      .post(`/api/v1/orders/${consumedOrderId}/payments`)
      .set(auth())
      .send({ method: "card", amount: Number(order.total) });
    expect(payment.status).toBe(201);
    const refund = await request(app)
      .post(`/api/v1/orders/${consumedOrderId}/refund`)
      .set(auth())
      .send({ amount: Number(order.total), reason: "استرداد مالي لا يعني مرتجع مخزون" });
    expect(refund.status).toBe(201);
    const afterRefund = await db("stock_movements")
      .where({ account_id: accountId, location_id: locationId, item_id: inventoryItemId })
      .sum("quantity_base as quantity")
      .first();
    expect(Number(afterRefund?.quantity)).toBeCloseTo(Number(before?.quantity), 6);

    const response = await request(app)
      .post(`/api/v1/inventory/orders/${consumedOrderId}/reverse-consumption`)
      .set(auth())
      .send({ reason: "مرتجع مخزون معتمد" });
    expect(response.status).toBe(201);
    expect(response.body.data.status).toBe("posted");
    const reversal = await db("inventory_consumption_events").where({ order_id: consumedOrderId, event_type: "reverse" }).first();
    const reversalMovement = await db("stock_movements").where({ source_id: reversal.id, movement_type: "reversal" }).first();
    expect(reversalMovement.reversal_of_movement_id).toBeTruthy();
    const after = await db("stock_movements")
      .where({ account_id: accountId, location_id: locationId, item_id: inventoryItemId })
      .sum("quantity_base as quantity")
      .first();
    expect(Number(after?.quantity) - Number(before?.quantity)).toBeCloseTo(0.5, 6);
  });

  it("does not accept a foreign-account product in a recipe", async () => {
    const foreignAccountId = newId();
    const foreignCategoryId = newId();
    const foreignProductId = newId();
    await db("accounts").insert({ id: foreignAccountId, name: "حساب وصفة أجنبي" });
    await db("categories").insert({ id: foreignCategoryId, account_id: foreignAccountId, name_ar: "تصنيف أجنبي", sort_order: 0, is_active: true });
    await db("products").insert({ id: foreignProductId, account_id: foreignAccountId, category_id: foreignCategoryId, name_ar: "منتج أجنبي", base_price: 1, sort_order: 0, is_active: true });
    const response = await request(app)
      .post("/api/v1/inventory/recipes")
      .set(auth())
      .send({ product_id: foreignProductId, items: [{ inventory_item_id: inventoryItemId, quantity_base: "1" }] });
    expect(response.status).toBe(404);
  });
});
