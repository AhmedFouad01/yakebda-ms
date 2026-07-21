import { Router } from "express";
import { Knex } from "knex";
import { z } from "zod";
import { writeAudit } from "../lib/audit";
import { err } from "../lib/errors";
import { newId } from "../lib/ids";
import { ar } from "../i18n/ar";
import { canAccessBranch, requirePermission, requireUser } from "../middleware/auth";

/**
 * ACC-FULL-01 CP3 — per-tenant accounting policy settings (ADR-004 type B).
 * Values live in the shared `settings` key/value store (account row + branch
 * override, getSettings pattern). VAT fields alias the existing operational
 * keys (vat_enabled / vat_percentage) so there is a single source of truth.
 * Type-A engine constants (settlement mechanics, close-date recognition,
 * 4dp/2dp half-up) are deliberately NOT exposed here.
 */

const STORAGE_KEYS = {
  vat_registered: "vat_enabled",
  vat_rate: "vat_percentage",
  revenue_recognition: "accounting_revenue_recognition",
  timezone: "accounting_timezone",
  day_close_hour: "accounting_day_close_hour",
  materiality_threshold: "accounting_materiality_threshold",
} as const;

type AccountingSettingField = keyof typeof STORAGE_KEYS;

export const ACCOUNTING_SETTINGS_DEFAULTS = {
  vat_registered: false,
  vat_rate: 14,
  revenue_recognition: "on_payment",
  timezone: "Africa/Cairo",
  day_close_hour: 4,
  materiality_threshold: "0.00",
} as const;

const effectiveSchema = z.object({
  vat_registered: z.boolean(),
  vat_rate: z.number().min(0).max(100),
  revenue_recognition: z.enum(["on_payment"]),
  timezone: z.string().min(1).max(60),
  day_close_hour: z.number().int().min(0).max(23),
  materiality_threshold: z.string().regex(/^\d{1,12}(\.\d{1,2})?$/),
});

export type AccountingSettings = z.infer<typeof effectiveSchema>;

function isValidTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

const updateSchema = z.object({
  vat_registered: z.boolean().optional(),
  vat_rate: z.number().min(0).max(100).multipleOf(0.01).optional(),
  revenue_recognition: z.enum(["on_payment"]).optional(),
  timezone: z.string().min(1).max(60).optional(),
  day_close_hour: z.number().int().min(0).max(23).optional(),
  materiality_threshold: z.string().regex(/^\d{1,12}(\.\d{1,2})?$/).optional(),
}).refine((value) => Object.values(value).some((entry) => entry !== undefined), { message: "empty" });

export async function getAccountingSettings(
  db: Knex,
  accountId: string,
  branchId?: string | null
): Promise<AccountingSettings> {
  const storageKeys = Object.values(STORAGE_KEYS);
  const rows = await db("settings")
    .where({ account_id: accountId })
    .whereIn("key", storageKeys)
    .where((w) => {
      w.whereNull("branch_id");
      if (branchId) w.orWhere("branch_id", branchId);
    })
    .orderByRaw("branch_id nulls first"); // account-level first, branch override wins
  const merged: Record<string, unknown> = { ...ACCOUNTING_SETTINGS_DEFAULTS };
  for (const row of rows) {
    const field = (Object.keys(STORAGE_KEYS) as AccountingSettingField[]).find(
      (key) => STORAGE_KEYS[key] === row.key
    );
    if (field) merged[field] = row.value;
  }
  const parsed = effectiveSchema.safeParse(merged);
  // A malformed stored override never invents behavior: fall back to defaults.
  return parsed.success ? parsed.data : effectiveSchema.parse({ ...ACCOUNTING_SETTINGS_DEFAULTS });
}

export function accountingSettingsRoutes(db: Knex): Router {
  const router = Router();
  router.use(requireUser(db));

  router.get("/settings", requirePermission("accounting.view"), async (req, res, next) => {
    try {
      const q = z.object({ branch_id: z.string().uuid().optional() }).safeParse(req.query);
      if (!q.success) throw err.validation(q.error.flatten());
      if (q.data.branch_id) {
        if (!canAccessBranch(req.user!, q.data.branch_id)) throw err.forbidden();
        const branch = await db("branches").where({ id: q.data.branch_id, account_id: req.user!.accountId }).first();
        if (!branch) throw err.notFound();
      }
      res.json({ data: await getAccountingSettings(db, req.user!.accountId, q.data.branch_id ?? null) });
    } catch (error) {
      next(error);
    }
  });

  router.put("/settings", requirePermission("accounting.manage"), async (req, res, next) => {
    try {
      const q = z.object({ branch_id: z.string().uuid().optional() }).safeParse(req.query);
      if (!q.success) throw err.validation(q.error.flatten());
      const body = updateSchema.safeParse(req.body);
      if (!body.success) throw err.validation(body.error.flatten());
      if (body.data.timezone !== undefined && !isValidTimezone(body.data.timezone)) {
        throw err.validation({ timezone: "المنطقة الزمنية غير صالحة — استخدم اسم IANA مثل Africa/Cairo." });
      }
      if (q.data.branch_id) {
        if (!canAccessBranch(req.user!, q.data.branch_id)) throw err.forbidden();
        const branch = await db("branches").where({ id: q.data.branch_id, account_id: req.user!.accountId }).first();
        if (!branch) throw err.notFound();
      }
      const provided = Object.entries(body.data).filter(([, value]) => value !== undefined) as Array<
        [AccountingSettingField, unknown]
      >;
      // NULL-safe upsert: Postgres treats NULL branch_id as distinct in the
      // settings unique index, so onConflict().merge() never fires for
      // account-level rows and would insert duplicates on every save. Delete
      // the matching scope (branch or account-level) then insert one row.
      const branchId = q.data.branch_id ?? null;
      await db.transaction(async (trx) => {
        for (const [field, value] of provided) {
          await trx("settings")
            .where({ account_id: req.user!.accountId, key: STORAGE_KEYS[field] })
            .modify((qb) => (branchId ? qb.where("branch_id", branchId) : qb.whereNull("branch_id")))
            .delete();
          await trx("settings").insert({
            id: newId(),
            account_id: req.user!.accountId,
            branch_id: branchId,
            key: STORAGE_KEYS[field],
            value: JSON.stringify(value),
          });
        }
      });
      await writeAudit(db, {
        accountId: req.user!.accountId,
        branchId,
        userId: req.user!.id,
        action: "accounting.settings.update",
        entityType: "accounting_settings",
        entityId: req.user!.accountId,
        meta: { branch_id: branchId, keys: provided.map(([field]) => field) },
        ip: req.ip,
      });
      res.json({
        data: await getAccountingSettings(db, req.user!.accountId, branchId),
        message: ar.messages.updated,
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
