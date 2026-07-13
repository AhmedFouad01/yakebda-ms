import { Router } from "express";
import { Knex } from "knex";
import { z } from "zod";
import { err } from "../lib/errors";
import { canAccessBranch, requireUser } from "../middleware/auth";
import { getSettings, Settings } from "./settings";

const SETTINGS_RUNTIME_KEYS: Array<keyof Settings> = [
  "show_product_images",
  "require_open_shift_for_cash",
  "enabled_payment_methods",
  "receipt_printing_enabled",
  "allow_discounts",
  "order_type_takeaway_enabled",
  "order_type_delivery_enabled",
  "order_type_dine_in_enabled",
  "default_delivery_fee",
  "min_delivery_order",
  "max_discount_without_manager",
  "max_cashier_discount_percent",
  "discount_reason_required",
  "vat_enabled",
  "vat_percentage",
  "prices_include_vat",
  "service_fee_enabled",
  "service_fee_type",
  "service_fee_value",
  "rounding_rule",
  "require_customer_for_delivery",
  "require_address_for_delivery",
  "kds_enabled",
  "kds_warning_minutes",
  "kds_late_minutes",
  "kds_hide_ready_after_minutes",
  "kds_sound_alert",
];

function hasAnyPermission(permissions: string[], ...keys: string[]): boolean {
  return keys.some((key) => permissions.includes(key));
}

/**
 * Owns GET /settings before the legacy settings router.
 * Managers receive the full document. POS/KDS roles receive a fixed runtime projection only.
 */
export function settingsReadRoutes(db: Knex): Router {
  const router = Router();

  router.get("/", requireUser(db), async (req, res, next) => {
    try {
      const parsed = z.object({ branch_id: z.string().uuid().optional() }).safeParse(req.query);
      if (!parsed.success) throw err.validation(parsed.error.flatten());

      const fullAccess = hasAnyPermission(
        req.user!.permissions,
        "settings.view",
        "settings.manage"
      );
      const runtimeAccess = hasAnyPermission(
        req.user!.permissions,
        "orders.create",
        "kitchen.view"
      );
      if (!fullAccess && !runtimeAccess) throw err.forbidden();

      const branchId = parsed.data.branch_id ?? req.user!.branchId ?? undefined;
      if (branchId) {
        const branch = await db("branches")
          .where({ id: branchId, account_id: req.user!.accountId, is_active: true })
          .first();
        if (!branch) throw err.notFound();
        if (!canAccessBranch(req.user!, branch.id)) throw err.forbidden();
      }

      const settings = await getSettings(db, req.user!.accountId, branchId);
      if (fullAccess) {
        res.json({ data: settings });
        return;
      }

      const runtime = Object.fromEntries(
        SETTINGS_RUNTIME_KEYS.map((key) => [key, settings[key]])
      );
      res.json({ data: runtime });
    } catch (error) {
      next(error);
    }
  });

  return router;
}

/** Full CRM list gate. The lightweight /lookup route remains available to POS lookup roles. */
export function customerReadRoutes(db: Knex): Router {
  const router = Router();

  router.get("/", requireUser(db), async (req, res, next) => {
    try {
      const canView = hasAnyPermission(
        req.user!.permissions,
        "customers.view",
        "customers.manage"
      );
      if (!canView) throw err.forbidden();

      const parsed = z.object({ search: z.string().optional() }).safeParse(req.query);
      if (!parsed.success) throw err.validation(parsed.error.flatten());

      const rows = await db("customers")
        .where({ account_id: req.user!.accountId })
        .modify((query) => {
          const search = parsed.data.search?.trim();
          if (!search) return;
          query.where((where) =>
            where
              .where("name", "ilike", `%${search}%`)
              .orWhere("phone", "ilike", `%${search}%`)
              .orWhere("alt_phone", "ilike", `%${search}%`)
          );
        })
        .orderBy("created_at", "desc")
        .limit(200);

      res.json({ data: rows });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
