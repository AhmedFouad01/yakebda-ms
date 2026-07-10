import { Router } from "express";
import { z } from "zod";
import { Knex } from "knex";
import { err } from "../lib/errors";
import { newId } from "../lib/ids";
import { writeAudit } from "../lib/audit";
import { requirePermission, requireUser } from "../middleware/auth";
import { ar } from "../i18n/ar";

/**
 * YKMS-02C — إعدادات النظام Settings.
 * account-scoped مع إمكانية override لكل فرع (branch_id).
 * القيم الافتراضية تعيش في الكود؛ الجدول يخزن فقط ما تغيّر.
 */

export const SETTINGS_SCHEMA = z.object({
  restaurant_name: z.string().min(1),
  brand_name_ar: z.string().min(1),
  currency: z.string().min(1),
  rtl_enabled: z.boolean(),
  show_product_images: z.boolean(),
  require_open_shift_for_cash: z.boolean(),
  enabled_payment_methods: z.array(z.enum(["cash", "card", "wallet", "unpaid"])).min(1),
  receipt_printing_enabled: z.boolean(),
  kitchen_ticket_enabled: z.boolean(),
  allow_discounts: z.boolean(),
  max_discount_without_manager: z.number().nonnegative(),
  allow_order_cancel: z.boolean(),
  hide_completed_kitchen_after_minutes: z.number().int().min(1),
});

export type Settings = z.infer<typeof SETTINGS_SCHEMA>;

export const SETTINGS_DEFAULTS: Settings = {
  restaurant_name: "يا كبدة",
  brand_name_ar: "يا كبدة",
  currency: "EGP",
  rtl_enabled: true,
  show_product_images: true,
  require_open_shift_for_cash: true,
  enabled_payment_methods: ["cash", "card", "wallet", "unpaid"],
  receipt_printing_enabled: true,
  kitchen_ticket_enabled: true,
  allow_discounts: true,
  max_discount_without_manager: 20,
  allow_order_cancel: true,
  hide_completed_kitchen_after_minutes: 30,
};

/** Merge: defaults ← account-level ← branch-level. */
export async function getSettings(db: Knex, accountId: string, branchId?: string | null): Promise<Settings> {
  const rows = await db("settings")
    .where({ account_id: accountId })
    .where((w) => {
      w.whereNull("branch_id");
      if (branchId) w.orWhere("branch_id", branchId);
    })
    .orderByRaw("branch_id nulls first"); // account-level first, branch override wins
  const merged: Record<string, unknown> = { ...SETTINGS_DEFAULTS };
  for (const row of rows) {
    if (row.key in SETTINGS_DEFAULTS) merged[row.key] = row.value;
  }
  return SETTINGS_SCHEMA.parse(merged);
}

export function settingsRoutes(db: Knex): Router {
  const r = Router();
  r.use(requireUser(db));

  // GET /settings[?branch_id=] — أي مستخدم مسجل (POS يحتاجها)
  r.get("/", async (req, res, next) => {
    try {
      const q = z.object({ branch_id: z.string().uuid().optional() }).safeParse(req.query);
      if (!q.success) throw err.validation(q.error.flatten());
      if (q.data.branch_id) {
        const branch = await db("branches")
          .where({ id: q.data.branch_id, account_id: req.user!.accountId })
          .first();
        if (!branch) throw err.notFound();
      }
      res.json({ data: await getSettings(db, req.user!.accountId, q.data.branch_id) });
    } catch (e) {
      next(e);
    }
  });

  // PATCH /settings[?branch_id=] — settings.manage فقط
  r.patch("/", requirePermission("settings.manage"), async (req, res, next) => {
    try {
      const q = z.object({ branch_id: z.string().uuid().optional() }).safeParse(req.query);
      if (!q.success) throw err.validation(q.error.flatten());
      const body = SETTINGS_SCHEMA.partial().safeParse(req.body);
      if (!body.success) throw err.validation(body.error.flatten());
      if (q.data.branch_id) {
        const branch = await db("branches")
          .where({ id: q.data.branch_id, account_id: req.user!.accountId })
          .first();
        if (!branch) throw err.notFound();
      }
      for (const [key, value] of Object.entries(body.data)) {
        await db("settings")
          .insert({
            id: newId(),
            account_id: req.user!.accountId,
            branch_id: q.data.branch_id ?? null,
            key,
            value: JSON.stringify(value),
          })
          .onConflict(["account_id", "branch_id", "key"])
          .merge({ value: JSON.stringify(value), updated_at: db.fn.now() });
      }
      await writeAudit(db, {
        accountId: req.user!.accountId,
        branchId: q.data.branch_id ?? null,
        userId: req.user!.id,
        action: "settings.update",
        entityType: "settings",
        entityId: req.user!.accountId,
        meta: { keys: Object.keys(body.data) },
        ip: req.ip,
      });
      res.json({ data: await getSettings(db, req.user!.accountId, q.data.branch_id), message: ar.messages.updated });
    } catch (e) {
      next(e);
    }
  });

  return r;
}
