import { Router } from "express";
import { Knex } from "knex";
import { z } from "zod";
import { writeAudit } from "../lib/audit";
import { err } from "../lib/errors";
import { newId } from "../lib/ids";
import { canAccessBranch, requirePermission, requireUser } from "../middleware/auth";
import { createStockMovement, recordStockCount, transferStock } from "./inventoryService";

const decimalInput = z.union([z.string().trim().regex(/^[+-]?\d+(?:\.\d+)?$/), z.number().finite()]);

const movementSchema = z.object({
  location_id: z.string().uuid(),
  item_id: z.string().uuid(),
  movement_type: z.enum(["receipt", "issue", "adjustment"]),
  quantity: decimalInput,
  unit_id: z.string().uuid().optional(),
  unit_cost: decimalInput.optional(),
  supplier_id: z.string().uuid().optional(),
  source_type: z.string().trim().min(1).max(60),
  source_id: z.string().trim().max(160).optional(),
  idempotency_key: z.string().trim().min(8).max(180),
  reason: z.string().trim().max(500).optional(),
});

async function accessibleLocation(db: Knex, accountId: string, locationId: string) {
  return db("inventory_locations").where({ id: locationId, account_id: accountId }).first();
}

export function inventoryRoutes(db: Knex): Router {
  const router = Router();
  router.use(requireUser(db));

  router.get("/locations", requirePermission("inventory.view"), async (req, res, next) => {
    try {
      const rows = await db("inventory_locations")
        .where({ account_id: req.user!.accountId, is_active: true })
        .modify((query) => {
          if (req.user!.branchId) query.where("branch_id", req.user!.branchId);
        })
        .orderBy([{ column: "branch_id", order: "asc" }, { column: "name_ar", order: "asc" }]);
      res.json({ data: rows });
    } catch (error) {
      next(error);
    }
  });

  router.post("/locations", requirePermission("inventory.manage"), async (req, res, next) => {
    try {
      const parsed = z.object({ branch_id: z.string().uuid(), name_ar: z.string().trim().min(1).max(120) }).safeParse(req.body);
      if (!parsed.success) throw err.validation(parsed.error.flatten());
      const branch = await db("branches").where({ id: parsed.data.branch_id, account_id: req.user!.accountId }).first();
      if (!branch) throw err.notFound();
      if (!canAccessBranch(req.user!, branch.id)) throw err.forbidden();
      const id = newId();
      await db("inventory_locations").insert({ id, account_id: req.user!.accountId, ...parsed.data });
      res.status(201).json({ data: await db("inventory_locations").where({ id }).first() });
    } catch (error) {
      next(error);
    }
  });

  router.get("/units", requirePermission("inventory.view"), async (req, res, next) => {
    try {
      res.json({ data: await db("inventory_units").where({ account_id: req.user!.accountId, is_active: true }).orderBy("name_ar") });
    } catch (error) {
      next(error);
    }
  });

  router.post("/units", requirePermission("inventory.manage"), async (req, res, next) => {
    try {
      const parsed = z.object({ name_ar: z.string().trim().min(1).max(80), symbol: z.string().trim().min(1).max(20) }).safeParse(req.body);
      if (!parsed.success) throw err.validation(parsed.error.flatten());
      const id = newId();
      await db("inventory_units").insert({ id, account_id: req.user!.accountId, ...parsed.data });
      res.status(201).json({ data: await db("inventory_units").where({ id }).first() });
    } catch (error) {
      next(error);
    }
  });

  router.post("/unit-conversions", requirePermission("inventory.manage"), async (req, res, next) => {
    try {
      const parsed = z.object({ from_unit_id: z.string().uuid(), to_unit_id: z.string().uuid(), factor: decimalInput }).safeParse(req.body);
      if (!parsed.success) throw err.validation(parsed.error.flatten());
      const unitCount = await db("inventory_units").where({ account_id: req.user!.accountId }).whereIn("id", [parsed.data.from_unit_id, parsed.data.to_unit_id]).count<{ count: string }>("id as count").first();
      if (Number(unitCount?.count ?? 0) !== 2) throw err.notFound();
      const id = newId();
      await db("inventory_unit_conversions").insert({ id, account_id: req.user!.accountId, ...parsed.data });
      res.status(201).json({ data: await db("inventory_unit_conversions").where({ id }).first() });
    } catch (error) {
      next(error);
    }
  });

  router.get("/items", requirePermission("inventory.view"), async (req, res, next) => {
    try {
      res.json({ data: await db("inventory_items").where({ account_id: req.user!.accountId, is_active: true }).orderBy("name_ar") });
    } catch (error) {
      next(error);
    }
  });

  router.post("/items", requirePermission("inventory.manage"), async (req, res, next) => {
    try {
      const parsed = z.object({ name_ar: z.string().trim().min(1).max(160), sku: z.string().trim().max(80).optional(), base_unit_id: z.string().uuid(), reorder_level: decimalInput.default("0") }).safeParse(req.body);
      if (!parsed.success) throw err.validation(parsed.error.flatten());
      const unit = await db("inventory_units").where({ id: parsed.data.base_unit_id, account_id: req.user!.accountId }).first();
      if (!unit) throw err.notFound();
      const id = newId();
      await db("inventory_items").insert({ id, account_id: req.user!.accountId, ...parsed.data, sku: parsed.data.sku || null });
      res.status(201).json({ data: await db("inventory_items").where({ id }).first() });
    } catch (error) {
      next(error);
    }
  });

  router.get("/suppliers", requirePermission("inventory.view"), async (req, res, next) => {
    try {
      res.json({ data: await db("inventory_suppliers").where({ account_id: req.user!.accountId, is_active: true }).orderBy("name_ar") });
    } catch (error) {
      next(error);
    }
  });

  router.post("/suppliers", requirePermission("inventory.manage"), async (req, res, next) => {
    try {
      const parsed = z.object({ name_ar: z.string().trim().min(1).max(160), phone: z.string().trim().max(40).optional() }).safeParse(req.body);
      if (!parsed.success) throw err.validation(parsed.error.flatten());
      const id = newId();
      await db("inventory_suppliers").insert({ id, account_id: req.user!.accountId, ...parsed.data, phone: parsed.data.phone || null });
      res.status(201).json({ data: await db("inventory_suppliers").where({ id }).first() });
    } catch (error) {
      next(error);
    }
  });

  router.get("/movements", requirePermission("inventory.view"), async (req, res, next) => {
    try {
      const parsed = z.object({ location_id: z.string().uuid().optional(), item_id: z.string().uuid().optional() }).safeParse(req.query);
      if (!parsed.success) throw err.validation(parsed.error.flatten());
      const rows = await db("stock_movements as movement")
        .join("inventory_locations as location", "location.id", "movement.location_id")
        .where("movement.account_id", req.user!.accountId)
        .modify((query) => {
          if (req.user!.branchId) query.where("movement.branch_id", req.user!.branchId);
          if (parsed.data.location_id) query.where("movement.location_id", parsed.data.location_id);
          if (parsed.data.item_id) query.where("movement.item_id", parsed.data.item_id);
        })
        .select("movement.*")
        .orderBy([{ column: "movement.created_at", order: "desc" }, { column: "movement.id", order: "desc" }]);
      res.json({ data: rows });
    } catch (error) {
      next(error);
    }
  });

  router.post("/movements", requirePermission("inventory.manage"), async (req, res, next) => {
    try {
      const parsed = movementSchema.safeParse(req.body);
      if (!parsed.success) throw err.validation(parsed.error.flatten());
      const location = await accessibleLocation(db, req.user!.accountId, parsed.data.location_id);
      if (!location) throw err.notFound();
      if (!canAccessBranch(req.user!, location.branch_id)) throw err.forbidden();
      const movement = await createStockMovement(db, {
        accountId: req.user!.accountId,
        locationId: parsed.data.location_id,
        itemId: parsed.data.item_id,
        movementType: parsed.data.movement_type,
        quantity: parsed.data.quantity,
        unitId: parsed.data.unit_id,
        unitCost: parsed.data.unit_cost,
        supplierId: parsed.data.supplier_id,
        sourceType: parsed.data.source_type,
        sourceId: parsed.data.source_id,
        idempotencyKey: parsed.data.idempotency_key,
        reason: parsed.data.reason,
        createdBy: req.user!.id,
      });
      if (!movement.idempotent_replay) {
        await writeAudit(db, {
          accountId: req.user!.accountId,
          branchId: movement.branch_id,
          userId: req.user!.id,
          action: "inventory.movement.create",
          entityType: "stock_movement",
          entityId: movement.id,
          meta: { movement_type: parsed.data.movement_type, item_id: parsed.data.item_id },
          ip: req.ip,
        });
      }
      res.status(movement.idempotent_replay ? 200 : 201).json({ data: movement });
    } catch (error) {
      next(error);
    }
  });

  router.get("/levels", requirePermission("inventory.view"), async (req, res, next) => {
    try {
      const rows = await db("inventory_items as item")
        .crossJoin(db.raw("inventory_locations as location"))
        .leftJoin("stock_movements as movement", function joinMovements() {
          this.on("movement.item_id", "=", "item.id").andOn("movement.location_id", "=", "location.id");
        })
        .where("item.account_id", req.user!.accountId)
        .andWhere("location.account_id", req.user!.accountId)
        .modify((query) => {
          if (req.user!.branchId) query.where("location.branch_id", req.user!.branchId);
        })
        .groupBy("item.id", "item.name_ar", "item.base_unit_id", "item.reorder_level", "location.id", "location.name_ar", "location.branch_id")
        .select(
          "item.id as item_id",
          "item.name_ar",
          "item.base_unit_id",
          "item.reorder_level",
          "location.id as location_id",
          "location.name_ar as location_name_ar",
          "location.branch_id",
          db.raw("coalesce(sum(movement.quantity_base), 0)::text as quantity_on_hand"),
          db.raw("coalesce(sum(movement.total_value), 0)::text as stock_value")
        )
        .orderBy([{ column: "location.name_ar", order: "asc" }, { column: "item.name_ar", order: "asc" }]);
      res.json({ data: rows });
    } catch (error) {
      next(error);
    }
  });

  router.post("/purchase-receipts", requirePermission("inventory.manage"), async (req, res, next) => {
    try {
      const parsed = z.object({
        location_id: z.string().uuid(),
        item_id: z.string().uuid(),
        supplier_id: z.string().uuid(),
        quantity: decimalInput,
        unit_id: z.string().uuid().optional(),
        unit_cost: decimalInput,
        receipt_reference: z.string().trim().min(1).max(160),
        idempotency_key: z.string().trim().min(8).max(180),
      }).safeParse(req.body);
      if (!parsed.success) throw err.validation(parsed.error.flatten());
      const location = await accessibleLocation(db, req.user!.accountId, parsed.data.location_id);
      if (!location) throw err.notFound();
      if (!canAccessBranch(req.user!, location.branch_id)) throw err.forbidden();
      const movement = await createStockMovement(db, {
        accountId: req.user!.accountId,
        locationId: parsed.data.location_id,
        itemId: parsed.data.item_id,
        movementType: "receipt",
        quantity: parsed.data.quantity,
        unitId: parsed.data.unit_id,
        unitCost: parsed.data.unit_cost,
        supplierId: parsed.data.supplier_id,
        sourceType: "purchase_receipt",
        sourceId: parsed.data.receipt_reference,
        idempotencyKey: parsed.data.idempotency_key,
        createdBy: req.user!.id,
      });
      res.status(movement.idempotent_replay ? 200 : 201).json({ data: movement });
    } catch (error) {
      next(error);
    }
  });

  router.post("/waste", requirePermission("inventory.manage"), async (req, res, next) => {
    try {
      const parsed = z.object({
        location_id: z.string().uuid(),
        item_id: z.string().uuid(),
        quantity: decimalInput,
        unit_id: z.string().uuid().optional(),
        reason: z.string().trim().min(1).max(500),
        idempotency_key: z.string().trim().min(8).max(180),
      }).safeParse(req.body);
      if (!parsed.success) throw err.validation(parsed.error.flatten());
      const location = await accessibleLocation(db, req.user!.accountId, parsed.data.location_id);
      if (!location) throw err.notFound();
      if (!canAccessBranch(req.user!, location.branch_id)) throw err.forbidden();
      const movement = await createStockMovement(db, {
        accountId: req.user!.accountId,
        locationId: parsed.data.location_id,
        itemId: parsed.data.item_id,
        movementType: "waste",
        quantity: parsed.data.quantity,
        unitId: parsed.data.unit_id,
        sourceType: "inventory_waste",
        idempotencyKey: parsed.data.idempotency_key,
        reason: parsed.data.reason,
        createdBy: req.user!.id,
      });
      res.status(movement.idempotent_replay ? 200 : 201).json({ data: movement });
    } catch (error) {
      next(error);
    }
  });

  router.post("/transfers", requirePermission("inventory.manage"), async (req, res, next) => {
    try {
      const parsed = z.object({
        source_location_id: z.string().uuid(),
        destination_location_id: z.string().uuid(),
        item_id: z.string().uuid(),
        quantity: decimalInput,
        unit_id: z.string().uuid().optional(),
        reason: z.string().trim().min(1).max(500),
        idempotency_key: z.string().trim().min(8).max(180),
      }).safeParse(req.body);
      if (!parsed.success) throw err.validation(parsed.error.flatten());
      const [source, destination] = await Promise.all([
        accessibleLocation(db, req.user!.accountId, parsed.data.source_location_id),
        accessibleLocation(db, req.user!.accountId, parsed.data.destination_location_id),
      ]);
      if (!source || !destination) throw err.notFound();
      if (!canAccessBranch(req.user!, source.branch_id) || !canAccessBranch(req.user!, destination.branch_id)) throw err.forbidden();
      const transfer = await transferStock(db, {
        accountId: req.user!.accountId,
        sourceLocationId: source.id,
        destinationLocationId: destination.id,
        itemId: parsed.data.item_id,
        quantity: parsed.data.quantity,
        unitId: parsed.data.unit_id,
        idempotencyKey: parsed.data.idempotency_key,
        reason: parsed.data.reason,
        createdBy: req.user!.id,
      });
      res.status(transfer.idempotent_replay ? 200 : 201).json({ data: transfer });
    } catch (error) {
      next(error);
    }
  });

  router.post("/stock-counts", requirePermission("inventory.manage"), async (req, res, next) => {
    try {
      const parsed = z.object({
        location_id: z.string().uuid(),
        item_id: z.string().uuid(),
        counted_quantity: decimalInput,
        reason: z.string().trim().min(1).max(500),
        idempotency_key: z.string().trim().min(8).max(180),
      }).safeParse(req.body);
      if (!parsed.success) throw err.validation(parsed.error.flatten());
      const location = await accessibleLocation(db, req.user!.accountId, parsed.data.location_id);
      if (!location) throw err.notFound();
      if (!canAccessBranch(req.user!, location.branch_id)) throw err.forbidden();
      const count = await recordStockCount(db, {
        accountId: req.user!.accountId,
        locationId: location.id,
        itemId: parsed.data.item_id,
        countedQuantity: parsed.data.counted_quantity,
        idempotencyKey: parsed.data.idempotency_key,
        reason: parsed.data.reason,
        createdBy: req.user!.id,
      });
      res.status(count.idempotent_replay ? 200 : 201).json({ data: count });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
