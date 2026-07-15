import { Router } from "express";
import { Knex } from "knex";
import { z } from "zod";
import { writeAudit } from "../lib/audit";
import { err } from "../lib/errors";
import { newId } from "../lib/ids";
import { formatDecimal, parseDecimal } from "../lib/inventoryMath";
import { canAccessBranch, requirePermission, requireUser } from "../middleware/auth";
import { createReversalEvent, processConsumptionEvent } from "./inventoryConsumption";

const recipeSchema = z.object({
  product_id: z.string().uuid(),
  variant_id: z.string().uuid().nullable().optional(),
  items: z.array(z.object({ inventory_item_id: z.string().uuid(), quantity_base: z.union([z.string(), z.number()]) })).min(1),
});

export function inventoryRecipeRoutes(db: Knex): Router {
  const router = Router();
  router.use(requireUser(db));

  router.get("/recipes", requirePermission("inventory.view"), async (req, res, next) => {
    try {
      const parsed = z.object({ product_id: z.string().uuid().optional() }).safeParse(req.query);
      if (!parsed.success) throw err.validation(parsed.error.flatten());
      const rows = await db("inventory_recipes as recipe")
        .where("recipe.account_id", req.user!.accountId)
        .modify((query) => {
          if (parsed.data.product_id) query.where("recipe.product_id", parsed.data.product_id);
        })
        .select(
          "recipe.*",
          db.raw(`(
            select coalesce(json_agg(json_build_object(
              'id', item.id,
              'inventory_item_id', item.inventory_item_id,
              'quantity_base', item.quantity_base
            ) order by item.id), '[]'::json)
            from inventory_recipe_items item where item.recipe_id = recipe.id
          ) as items`)
        )
        .orderBy([{ column: "recipe.product_id", order: "asc" }, { column: "recipe.version", order: "desc" }]);
      res.json({ data: rows });
    } catch (error) {
      next(error);
    }
  });

  router.post("/recipes", requirePermission("inventory.manage"), async (req, res, next) => {
    try {
      const parsed = recipeSchema.safeParse(req.body);
      if (!parsed.success) throw err.validation(parsed.error.flatten());
      const accountId = req.user!.accountId;
      const product = await db("products").where({ id: parsed.data.product_id, account_id: accountId }).first();
      if (!product) throw err.notFound();
      if (parsed.data.variant_id) {
        const variant = await db("product_variants").where({ id: parsed.data.variant_id, product_id: product.id }).first();
        if (!variant) throw err.notFound();
      }
      const inventoryItems = await db("inventory_items")
        .where({ account_id: accountId, is_active: true })
        .whereIn("id", parsed.data.items.map((item) => item.inventory_item_id));
      if (new Set(inventoryItems.map((item) => item.id)).size !== new Set(parsed.data.items.map((item) => item.inventory_item_id)).size) {
        throw err.notFound();
      }
      const normalizedItems = parsed.data.items.map((item) => {
        const quantity = parseDecimal(item.quantity_base, 6);
        if (quantity <= 0n) throw err.validation({ quantity_base: "كمية مكون الوصفة يجب أن تكون موجبة" });
        return { inventory_item_id: item.inventory_item_id, quantity_base: formatDecimal(quantity, 6) };
      });

      const id = newId();
      await db.transaction(async (trx) => {
        const versionRow = await trx("inventory_recipes")
          .where({ account_id: accountId, product_id: product.id })
          .modify((query) => {
            if (parsed.data.variant_id) query.where("variant_id", parsed.data.variant_id);
            else query.whereNull("variant_id");
          })
          .max("version as version")
          .first();
        const version = Number(versionRow?.version ?? 0) + 1;
        await trx("inventory_recipes").insert({
          id,
          account_id: accountId,
          product_id: product.id,
          variant_id: parsed.data.variant_id ?? null,
          version,
          status: "draft",
          created_by: req.user!.id,
        });
        await trx("inventory_recipe_items").insert(normalizedItems.map((item) => ({ id: newId(), recipe_id: id, ...item })));
      });
      res.status(201).json({ data: await db("inventory_recipes").where({ id }).first() });
    } catch (error) {
      next(error);
    }
  });

  router.post("/recipes/:id/activate", requirePermission("inventory.manage"), async (req, res, next) => {
    try {
      const recipe = await db("inventory_recipes").where({ id: req.params.id, account_id: req.user!.accountId }).first();
      if (!recipe) throw err.notFound();
      await db.transaction(async (trx) => {
        await trx("inventory_recipes")
          .where({ account_id: recipe.account_id, product_id: recipe.product_id, status: "active" })
          .modify((query) => {
            if (recipe.variant_id) query.where("variant_id", recipe.variant_id);
            else query.whereNull("variant_id");
          })
          .update({ status: "retired", updated_at: trx.fn.now() });
        await trx("inventory_recipes").where({ id: recipe.id, status: "draft" }).update({ status: "active", activated_at: trx.fn.now(), updated_at: trx.fn.now() });
      });
      res.json({ data: await db("inventory_recipes").where({ id: recipe.id }).first() });
    } catch (error) {
      next(error);
    }
  });

  router.get("/consumption-events", requirePermission("inventory.view"), async (req, res, next) => {
    try {
      const rows = await db("inventory_consumption_events")
        .where({ account_id: req.user!.accountId })
        .modify((query) => {
          if (req.user!.branchId) query.where("branch_id", req.user!.branchId);
        })
        .orderBy([{ column: "created_at", order: "desc" }, { column: "id", order: "desc" }]);
      res.json({ data: rows });
    } catch (error) {
      next(error);
    }
  });

  router.post("/consumption-events/:id/retry", requirePermission("inventory.manage"), async (req, res, next) => {
    try {
      const event = await db("inventory_consumption_events").where({ id: req.params.id, account_id: req.user!.accountId }).first();
      if (!event) throw err.notFound();
      if (!canAccessBranch(req.user!, event.branch_id)) throw err.forbidden();
      if (!new Set(["failed", "pending"]).has(event.status)) throw err.conflict();
      const result = await processConsumptionEvent(db, event.id);
      res.json({ data: result });
    } catch (error) {
      next(error);
    }
  });

  router.post("/orders/:orderId/reverse-consumption", requirePermission("inventory.manage"), async (req, res, next) => {
    try {
      const parsed = z.object({ reason: z.string().trim().min(1).max(500) }).safeParse(req.body);
      if (!parsed.success) throw err.validation(parsed.error.flatten());
      const order = await db("orders").where({ id: req.params.orderId, account_id: req.user!.accountId }).first();
      if (!order) throw err.notFound();
      if (!canAccessBranch(req.user!, order.branch_id)) throw err.forbidden();
      const eventId = await createReversalEvent(db, { accountId: req.user!.accountId, orderId: order.id, reason: parsed.data.reason, createdBy: req.user!.id });
      const result = await processConsumptionEvent(db, eventId);
      await writeAudit(db, {
        accountId: req.user!.accountId,
        branchId: order.branch_id,
        userId: req.user!.id,
        action: "inventory.consumption.reverse",
        entityType: "order",
        entityId: order.id,
        meta: { event_id: eventId, reason: parsed.data.reason, status: result.status },
        ip: req.ip,
      });
      res.status(201).json({ data: result });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
