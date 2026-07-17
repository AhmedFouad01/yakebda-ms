import { Router } from "express";
import { z } from "zod";
import { Knex } from "knex";
import { err } from "../lib/errors";
import { newId } from "../lib/ids";
import { writeAudit } from "../lib/audit";
import { getStorage, MAX_IMAGE_BYTES, validateImageBuffer } from "../lib/storage";
import { requirePermission, requireUser } from "../middleware/auth";
import { ar } from "../i18n/ar";

/**
 * YKMS-02C — إعدادات النظام Settings.
 * account-scoped مع إمكانية override لكل فرع (branch_id).
 * القيم الافتراضية تعيش في الكود؛ الجدول يخزن فقط ما تغيّر.
 */

export const SETTINGS_SCHEMA = z.object({
  // ——— بيانات المطعم (Restaurant Profile) ———
  restaurant_name: z.string().min(1), // الاسم العربي
  restaurant_name_en: z.string(),
  system_display_name: z.string().min(1), // اسم POS الظاهر
  brand_name_ar: z.string().min(1),
  address: z.string(),
  phone: z.string(),
  tax_number: z.string(),
  logo_url: z.string(),
  brand_primary_color: z.string(), // أصفر
  brand_secondary_color: z.string(), // أسود
  default_language: z.enum(["ar", "en"]),
  rtl_enabled: z.boolean(),
  currency: z.string().min(1),
  timezone: z.string().min(1),
  receipt_footer: z.string(),

  // ——— الضرائب والرسوم ———
  vat_enabled: z.boolean(),
  vat_percentage: z.number().min(0).max(100),
  prices_include_vat: z.boolean(),
  service_fee_enabled: z.boolean(),
  service_fee_type: z.enum(["percent", "fixed"]),
  service_fee_value: z.number().nonnegative(),
  default_delivery_fee: z.number().nonnegative(),
  min_delivery_order: z.number().nonnegative(),
  rounding_rule: z.enum(["none", "nearest_050", "nearest_1"]),
  receipt_tax_display: z.enum(["combined", "detailed"]),

  // ——— الطلبات ———
  order_type_takeaway_enabled: z.boolean(),
  order_type_delivery_enabled: z.boolean(),
  order_type_dine_in_enabled: z.boolean(), // قرار YAKEBDA: مقفول حاليًا
  online_orders_enabled: z.boolean(), // placeholder
  require_customer_for_delivery: z.boolean(),
  require_address_for_delivery: z.boolean(),
  require_driver_for_delivery: z.boolean(),
  order_number_prefix: z.string().max(4),
  order_type_letter_prefix: z.boolean(), // T/D/O
  order_daily_reset: z.boolean(),
  order_starting_number: z.number().int().min(1),
  branch_specific_numbering: z.boolean(),
  approval_delete_item_after_kitchen: z.boolean(),
  approval_cancel_order: z.boolean(),
  approval_discount_above_limit: z.boolean(),
  approval_refund: z.boolean(),
  approval_open_cash_drawer: z.boolean(),

  // ——— نقطة البيع ———
  show_product_images: z.boolean(),
  enabled_payment_methods: z.array(z.enum(["cash", "card", "wallet", "unpaid"])).min(1),

  // ——— العروض والخصومات ———
  allow_discounts: z.boolean(), // manual discount enabled
  max_discount_without_manager: z.number().nonnegative(), // مبلغ
  max_cashier_discount_percent: z.number().min(0).max(100),
  discount_reason_required: z.boolean(),
  offers_combo_enabled: z.boolean(), // placeholders — لا محرك عروض بعد
  offers_buy_x_get_y_enabled: z.boolean(),
  offers_happy_hour_enabled: z.boolean(),
  offers_scheduled_enabled: z.boolean(),

  // ——— المطبخ / KDS ———
  kds_enabled: z.boolean(),
  kitchen_ticket_enabled: z.boolean(),
  default_prep_time_minutes: z.number().int().min(0),
  kds_warning_minutes: z.number().int().min(1),
  kds_late_minutes: z.number().int().min(1),
  kds_hide_ready_after_minutes: z.number().int().min(1),
  kds_sound_alert: z.boolean(),
  hide_completed_kitchen_after_minutes: z.number().int().min(1),

  // ——— الطباعة والأجهزة ———
  receipt_printing_enabled: z.boolean(),
  kitchen_printer_enabled: z.boolean(),
  paper_width_mm: z.union([z.literal(58), z.literal(80)]),
  receipt_copies: z.number().int().min(1).max(5),
  auto_print_on_kitchen_send: z.boolean(),
  auto_print_on_payment: z.boolean(),
  cash_drawer_enabled: z.boolean(), // placeholders — تفعيل فعلي مع الجسر لاحقًا
  barcode_scanner_enabled: z.boolean(),
  customer_display_enabled: z.boolean(),
  payment_terminal_enabled: z.boolean(),
  kds_screen_enabled: z.boolean(),

  // ——— الشيفت والكاش ———
  require_open_shift_for_cash: z.boolean(),
  opening_cash_required: z.boolean(),
  force_close_shift_before_day_end: z.boolean(),
  manager_approval_cash_out: z.boolean(),
  shift_report_visibility: z.enum(["manager", "all"]),

  // ——— العملاء والتوصيل ———
  customers_enabled: z.boolean(),
  customer_phone_required: z.boolean(),

  // ——— عام/قديم ———
  allow_order_cancel: z.boolean(),
});

export type Settings = z.infer<typeof SETTINGS_SCHEMA>;

const SETTINGS_UPDATE_SCHEMA = SETTINGS_SCHEMA.omit({ logo_url: true }).partial().strict();
const LOGO_UPLOAD_SCHEMA = z
  .object({
    mime: z.enum(["image/jpeg", "image/jpg", "image/png", "image/webp"]),
    data_base64: z.string().min(1).max(Math.ceil((MAX_IMAGE_BYTES * 4) / 3) + 8),
  })
  .strict();

export const SETTINGS_DEFAULTS: Settings = {
  restaurant_name: "يا كبدة",
  restaurant_name_en: "Ya Kebda",
  system_display_name: "YAKEBDA MS",
  brand_name_ar: "يا كبدة",
  address: "",
  phone: "",
  tax_number: "",
  logo_url: "/brand/yakebda-logo-placeholder.svg",
  brand_primary_color: "#F5B301",
  brand_secondary_color: "#111111",
  default_language: "ar",
  rtl_enabled: true,
  currency: "EGP",
  timezone: "Africa/Cairo",
  receipt_footer: "شكرًا لاختيارك يا كبدة",

  vat_enabled: false,
  vat_percentage: 14,
  prices_include_vat: true,
  service_fee_enabled: false,
  service_fee_type: "percent",
  service_fee_value: 0,
  default_delivery_fee: 10,
  min_delivery_order: 0,
  rounding_rule: "none",
  receipt_tax_display: "combined",

  order_type_takeaway_enabled: true,
  order_type_delivery_enabled: true,
  order_type_dine_in_enabled: false,
  online_orders_enabled: false,
  require_customer_for_delivery: true,
  require_address_for_delivery: true,
  require_driver_for_delivery: false,
  order_number_prefix: "",
  order_type_letter_prefix: false,
  order_daily_reset: false,
  order_starting_number: 1,
  branch_specific_numbering: true,
  approval_delete_item_after_kitchen: true,
  approval_cancel_order: true,
  approval_discount_above_limit: true,
  approval_refund: true,
  approval_open_cash_drawer: true,

  show_product_images: true,
  enabled_payment_methods: ["cash", "card", "wallet", "unpaid"],

  allow_discounts: true,
  max_discount_without_manager: 20,
  max_cashier_discount_percent: 20,
  discount_reason_required: false,
  offers_combo_enabled: false,
  offers_buy_x_get_y_enabled: false,
  offers_happy_hour_enabled: false,
  offers_scheduled_enabled: false,

  kds_enabled: true,
  kitchen_ticket_enabled: true,
  default_prep_time_minutes: 10,
  kds_warning_minutes: 7,
  kds_late_minutes: 12,
  kds_hide_ready_after_minutes: 15,
  kds_sound_alert: true,
  hide_completed_kitchen_after_minutes: 30,

  receipt_printing_enabled: true,
  kitchen_printer_enabled: true,
  paper_width_mm: 80,
  receipt_copies: 1,
  auto_print_on_kitchen_send: false,
  auto_print_on_payment: false,
  cash_drawer_enabled: false,
  barcode_scanner_enabled: false,
  customer_display_enabled: false,
  payment_terminal_enabled: false,
  kds_screen_enabled: false,

  require_open_shift_for_cash: true,
  opening_cash_required: true,
  force_close_shift_before_day_end: false,
  manager_approval_cash_out: true,
  shift_report_visibility: "manager",

  customers_enabled: true,
  customer_phone_required: false,

  allow_order_cancel: true,
};

function logoPrefix(accountId: string): string {
  return `logos-${accountId}`;
}

function uploadedLogoKey(accountId: string, value: unknown): string | null {
  if (typeof value !== "string") return null;
  const prefix = logoPrefix(accountId);
  const match = value.match(
    new RegExp(`^/uploads/(${prefix}/[0-9]+-[a-f0-9]{16}\\.(?:jpg|png|webp))$`, "i")
  );
  return match?.[1] ?? null;
}

function safeLogoUrl(accountId: string, value: unknown): string {
  if (value === SETTINGS_DEFAULTS.logo_url) return SETTINGS_DEFAULTS.logo_url;
  return uploadedLogoKey(accountId, value) ? String(value) : SETTINGS_DEFAULTS.logo_url;
}

function decodeBase64(value: string): Buffer | null {
  if (value.length % 4 !== 0 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    return null;
  }
  const data = Buffer.from(value, "base64");
  return data.toString("base64") === value ? data : null;
}

async function setAccountLogo(db: Knex, accountId: string, logoUrl: string): Promise<void> {
  const updated = await db("settings")
    .where({ account_id: accountId, key: "logo_url" })
    .whereNull("branch_id")
    .update({ value: JSON.stringify(logoUrl), updated_at: db.fn.now() });
  if (!updated) {
    await db("settings").insert({
      id: newId(),
      account_id: accountId,
      branch_id: null,
      key: "logo_url",
      value: JSON.stringify(logoUrl),
    });
  }
}

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
  const parsed = SETTINGS_SCHEMA.parse(merged);
  return { ...parsed, logo_url: safeLogoUrl(accountId, parsed.logo_url) };
}

export function settingsRoutes(db: Knex): Router {
  const r = Router();
  r.use(requireUser(db));

  // GET /settings/brand — إعداد هوية آمن للحساب الحالي فقط.
  r.get("/brand", async (req, res, next) => {
    try {
      const settings = await getSettings(db, req.user!.accountId);
      res.json({ data: { logo_url: settings.logo_url } });
    } catch (e) {
      next(e);
    }
  });

  // POST /settings/logo — رفع صورة مولدة الاسم ومملوكة للحساب الحالي.
  r.post("/logo", requirePermission("settings.manage"), async (req, res, next) => {
    const storage = getStorage();
    let storedKey: string | null = null;
    try {
      const body = LOGO_UPLOAD_SCHEMA.safeParse(req.body);
      if (!body.success) throw err.validation(body.error.flatten());
      const data = decodeBase64(body.data.data_base64);
      if (!data) throw err.validation({ data_base64: ["بيانات الصورة غير صالحة"] });
      const imageError = validateImageBuffer(body.data.mime, data);
      if (imageError) throw err.validation({ image: [imageError] });

      const current = await getSettings(db, req.user!.accountId);
      const oldKey = uploadedLogoKey(req.user!.accountId, current.logo_url);
      const stored = await storage.save({
        data,
        mime: body.data.mime,
        prefix: logoPrefix(req.user!.accountId),
      });
      storedKey = stored.key;

      await db.transaction(async (trx) => {
        await trx("accounts").where({ id: req.user!.accountId }).forUpdate().first();
        await setAccountLogo(trx, req.user!.accountId, stored.url);
        await writeAudit(trx, {
          accountId: req.user!.accountId,
          userId: req.user!.id,
          action: "settings.logo_upload",
          entityType: "settings",
          entityId: req.user!.accountId,
          meta: { mime: stored.mime, size: stored.size },
          ip: req.ip,
        });
      });
      storedKey = null;
      if (oldKey && oldKey !== stored.key) await storage.delete(oldKey).catch(() => undefined);
      res.json({ data: { logo_url: stored.url, size: stored.size }, message: ar.messages.updated });
    } catch (e) {
      if (storedKey) await storage.delete(storedKey).catch(() => undefined);
      next(e);
    }
  });

  // DELETE /settings/logo — العودة إلى اللوجو الافتراضي دون قبول مسار من العميل.
  r.delete("/logo", requirePermission("settings.manage"), async (req, res, next) => {
    try {
      const current = await getSettings(db, req.user!.accountId);
      const oldKey = uploadedLogoKey(req.user!.accountId, current.logo_url);
      await db.transaction(async (trx) => {
        await trx("accounts").where({ id: req.user!.accountId }).forUpdate().first();
        await trx("settings")
          .where({ account_id: req.user!.accountId, key: "logo_url" })
          .whereNull("branch_id")
          .del();
        await writeAudit(trx, {
          accountId: req.user!.accountId,
          userId: req.user!.id,
          action: "settings.logo_remove",
          entityType: "settings",
          entityId: req.user!.accountId,
          ip: req.ip,
        });
      });
      if (oldKey) await getStorage().delete(oldKey).catch(() => undefined);
      res.json({ data: { logo_url: SETTINGS_DEFAULTS.logo_url }, message: ar.messages.updated });
    } catch (e) {
      next(e);
    }
  });

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
      const body = SETTINGS_UPDATE_SCHEMA.safeParse(req.body);
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

/** YKMS-02E — محطات التحضير (جريل/قلاية/تجهيز/مشروبات). */
export function prepStationRoutes(db: Knex): Router {
  const r = Router();
  r.use(requireUser(db));

  r.get("/", async (req, res, next) => {
    try {
      const rows = await db("prep_stations")
        .where({ account_id: req.user!.accountId })
        .orderBy("sort_order", "asc");
      res.json({ data: rows });
    } catch (e) {
      next(e);
    }
  });

  r.post("/", requirePermission("settings.manage"), async (req, res, next) => {
    try {
      const body = z
        .object({ name_ar: z.string().min(1), sort_order: z.number().int().default(0) })
        .safeParse(req.body);
      if (!body.success) throw err.validation(body.error.flatten());
      const id = newId();
      await db("prep_stations").insert({ id, account_id: req.user!.accountId, ...body.data });
      res.status(201).json({ data: await db("prep_stations").where({ id }).first(), message: ar.messages.created });
    } catch (e) {
      next(e);
    }
  });

  r.patch("/:id", requirePermission("settings.manage"), async (req, res, next) => {
    try {
      const body = z
        .object({
          name_ar: z.string().min(1).optional(),
          sort_order: z.number().int().optional(),
          is_active: z.boolean().optional(),
        })
        .safeParse(req.body);
      if (!body.success) throw err.validation(body.error.flatten());
      const row = await db("prep_stations")
        .where({ id: req.params.id, account_id: req.user!.accountId })
        .first();
      if (!row) throw err.notFound();
      await db("prep_stations").where({ id: row.id }).update({ ...body.data, updated_at: db.fn.now() });
      res.json({ data: await db("prep_stations").where({ id: row.id }).first(), message: ar.messages.updated });
    } catch (e) {
      next(e);
    }
  });

  return r;
}

/** YKMS-02E — مناطق التوصيل: رسوم وحد أدنى لكل منطقة. */
export function deliveryZoneRoutes(db: Knex): Router {
  const r = Router();
  r.use(requireUser(db));

  r.get("/", async (req, res, next) => {
    try {
      const rows = await db("delivery_zones")
        .where({ account_id: req.user!.accountId })
        .orderBy("name_ar", "asc");
      res.json({ data: rows });
    } catch (e) {
      next(e);
    }
  });

  r.post("/", requirePermission("settings.manage"), async (req, res, next) => {
    try {
      const body = z
        .object({
          name_ar: z.string().min(1),
          fee: z.number().nonnegative().default(0),
          min_order: z.number().nonnegative().default(0),
        })
        .safeParse(req.body);
      if (!body.success) throw err.validation(body.error.flatten());
      const id = newId();
      await db("delivery_zones").insert({ id, account_id: req.user!.accountId, ...body.data });
      res.status(201).json({ data: await db("delivery_zones").where({ id }).first(), message: ar.messages.created });
    } catch (e) {
      next(e);
    }
  });

  r.patch("/:id", requirePermission("settings.manage"), async (req, res, next) => {
    try {
      const body = z
        .object({
          name_ar: z.string().min(1).optional(),
          fee: z.number().nonnegative().optional(),
          min_order: z.number().nonnegative().optional(),
          is_active: z.boolean().optional(),
        })
        .safeParse(req.body);
      if (!body.success) throw err.validation(body.error.flatten());
      const row = await db("delivery_zones")
        .where({ id: req.params.id, account_id: req.user!.accountId })
        .first();
      if (!row) throw err.notFound();
      await db("delivery_zones").where({ id: row.id }).update({ ...body.data, updated_at: db.fn.now() });
      res.json({ data: await db("delivery_zones").where({ id: row.id }).first(), message: ar.messages.updated });
    } catch (e) {
      next(e);
    }
  });

  return r;
}

/** YKMS-02E — السائقون (خفيف): إدارة + تعيين لاحقًا على طلبات الدليفري. */
export function driverRoutes(db: Knex): Router {
  const r = Router();
  r.use(requireUser(db));

  r.get("/", async (req, res, next) => {
    try {
      const rows = await db("drivers")
        .where({ account_id: req.user!.accountId })
        .orderBy("name", "asc");
      res.json({ data: rows });
    } catch (e) {
      next(e);
    }
  });

  r.post("/", requirePermission("drivers.manage"), async (req, res, next) => {
    try {
      const body = z
        .object({ name: z.string().min(1), phone: z.string().optional().nullable() })
        .safeParse(req.body);
      if (!body.success) throw err.validation(body.error.flatten());
      const id = newId();
      await db("drivers").insert({ id, account_id: req.user!.accountId, ...body.data });
      res.status(201).json({ data: await db("drivers").where({ id }).first(), message: ar.messages.created });
    } catch (e) {
      next(e);
    }
  });

  r.patch("/:id", requirePermission("drivers.manage"), async (req, res, next) => {
    try {
      const body = z
        .object({
          name: z.string().min(1).optional(),
          phone: z.string().optional().nullable(),
          is_active: z.boolean().optional(),
        })
        .safeParse(req.body);
      if (!body.success) throw err.validation(body.error.flatten());
      const row = await db("drivers").where({ id: req.params.id, account_id: req.user!.accountId }).first();
      if (!row) throw err.notFound();
      await db("drivers").where({ id: row.id }).update({ ...body.data, updated_at: db.fn.now() });
      res.json({ data: await db("drivers").where({ id: row.id }).first(), message: ar.messages.updated });
    } catch (e) {
      next(e);
    }
  });

  return r;
}
