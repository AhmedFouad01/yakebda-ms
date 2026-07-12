import { Router } from "express";
import { Knex } from "knex";
import { ApiError, err } from "../lib/errors";
import { writeAudit } from "../lib/audit";
import { requirePermission, requireUser } from "../middleware/auth";
import { ar } from "../i18n/ar";

/**
 * Product deletion is intentionally isolated from the main menu router.
 * Historical orders keep immutable product snapshots, so a product that is
 * already referenced by an order cannot be physically deleted.
 */
export function productDeleteRoutes(db: Knex): Router {
  const r = Router();
  r.use(requireUser(db));

  r.delete("/:id", requirePermission("menu.manage"), async (req, res, next) => {
    try {
      const accountId = req.user!.accountId;
      const product = await db("products")
        .where({ id: req.params.id, account_id: accountId })
        .first();

      if (!product) throw err.notFound();

      const usedByOrder = await db("order_items")
        .where({ product_id: product.id })
        .first("id");

      if (usedByOrder) {
        throw new ApiError(409, "conflict", {
          reason: "product_has_order_history",
          message: "لا يمكن حذف صنف مستخدم في طلبات سابقة. يمكن إيقافه بدلًا من حذفه.",
        });
      }

      await db("products")
        .where({ id: product.id, account_id: accountId })
        .del();

      await writeAudit(db, {
        accountId,
        userId: req.user!.id,
        action: "product.delete",
        entityType: "product",
        entityId: product.id,
        meta: { name_ar: product.name_ar, sku: product.sku ?? null },
        ip: req.ip,
      });

      res.json({ data: { id: product.id }, message: ar.messages.deleted });
    } catch (e) {
      next(e);
    }
  });

  return r;
}
