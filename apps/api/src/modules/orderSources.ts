import { Router } from "express";
import { Knex } from "knex";
import { z } from "zod";
import { err } from "../lib/errors";
import { newId } from "../lib/ids";
import { writeAudit } from "../lib/audit";
import { requirePermission, requireUser } from "../middleware/auth";
import { ar } from "../i18n/ar";

export interface OrderSourceRow {
  id: string;
  account_id: string;
  code: string;
  name_ar: string;
  is_active: boolean;
  supports_takeaway: boolean;
  supports_delivery: boolean;
  sort_order: number;
}

const sourceObjectSchema = z.object({
  name_ar: z.string().trim().min(1).max(120),
  is_active: z.boolean().default(true),
  supports_takeaway: z.boolean().default(true),
  supports_delivery: z.boolean().default(true),
  sort_order: z.number().int().default(0),
  copy_from_source_id: z.string().uuid().optional().nullable(),
});

const sourceSchema = sourceObjectSchema.refine(
  (value) => value.supports_takeaway || value.supports_delivery,
  {
    message: "يجب تفعيل نوع طلب واحد على الأقل",
    path: ["supports_takeaway"],
  }
);

const sourcePatchSchema = sourceObjectSchema
  .omit({ copy_from_source_id: true })
  .partial()
  .refine(
    (value) =>
      value.supports_takeaway === undefined ||
      value.supports_delivery === undefined ||
      value.supports_takeaway ||
      value.supports_delivery,
    { message: "يجب تفعيل نوع طلب واحد على الأقل", path: ["supports_takeaway"] }
  );

const menuRulesSchema = z.object({
  items: z.array(
    z.object({
      product_id: z.string().uuid(),
      price_override: z.number().nonnegative().nullable(),
      is_available: z.boolean(),
    })
  ),
});

export function sourceSupportsOrderType(source: OrderSourceRow, orderType: string): boolean {
  if (orderType === "takeaway") return source.supports_takeaway;
  if (orderType === "delivery") return source.supports_delivery;
  // Dine-in is a legacy/non-channel flow. Keep it compatible with the direct source.
  return source.code === "direct";
}

export async function ensureDefaultOrderSource(db: Knex, accountId: string): Promise<OrderSourceRow> {
  const existing = await db<OrderSourceRow>("order_sources")
    .where({ account_id: accountId, code: "direct" })
    .first();
  if (existing) return existing;

  const id = newId();
  await db("order_sources").insert({
    id,
    account_id: accountId,
    code: "direct",
    name_ar: "طلب مباشر",
    is_active: true,
    supports_takeaway: true,
    supports_delivery: true,
    sort_order: 0,
  });
  return (await db<OrderSourceRow>("order_sources").where({ id }).first())!;
}

export async function resolveOrderSource(
  db: Knex,
  accountId: string,
  sourceId: string | null | undefined,
  orderType: string
): Promise<OrderSourceRow> {
  const source = sourceId
    ? await db<OrderSourceRow>("order_sources")
        .where({ id: sourceId, account_id: accountId, is_active: true })
        .first()
    : await ensureDefaultOrderSource(db, accountId);

  if (!source) throw err.validation({ source_id: "مصدر الطلب غير متاح" });
  if (!sourceSupportsOrderType(source, orderType)) {
    throw err.validation({ source_id: "مصدر الطلب لا يدعم نوع الطلب المحدد" });
  }
  return source;
}

export function orderSourceRoutes(db: Knex): Router {
  const router = Router();
  router.use(requireUser(db));

  router.get("/", async (req, res, next) => {
    try {
      const query = z
        .object({
          active_only: z.enum(["true", "false"]).optional(),
          order_type: z.enum(["takeaway", "delivery"]).optional(),
        })
        .safeParse(req.query);
      if (!query.success) throw err.validation(query.error.flatten());

      const canManage = req.user!.permissions.includes("settings.manage");
      const activeOnly = !canManage || query.data.active_only !== "false";
      let rows: OrderSourceRow[] = await db<OrderSourceRow>("order_sources")
        .where({ account_id: req.user!.accountId })
        .modify((builder) => {
          if (activeOnly) builder.where("is_active", true);
        })
        .orderBy([{ column: "sort_order", order: "asc" }, { column: "name_ar", order: "asc" }]);

      if (query.data.order_type) {
        rows = rows.filter((source) => sourceSupportsOrderType(source, query.data.order_type!));
      }
      res.json({ data: rows });
    } catch (error) {
      next(error);
    }
  });

  router.post("/", requirePermission("settings.manage"), async (req, res, next) => {
    try {
      const parsed = sourceSchema.safeParse(req.body);
      if (!parsed.success) throw err.validation(parsed.error.flatten());
      const input = parsed.data;
      const accountId = req.user!.accountId;

      let copySource: OrderSourceRow | undefined;
      if (input.copy_from_source_id) {
        copySource = await db<OrderSourceRow>("order_sources")
          .where({ id: input.copy_from_source_id, account_id: accountId })
          .first();
        if (!copySource) throw err.notFound();
      }

      const id = newId();
      await db.transaction(async (trx) => {
        await trx("order_sources").insert({
          id,
          account_id: accountId,
          code: "source-" + id.slice(0, 8),
          name_ar: input.name_ar,
          is_active: input.is_active,
          supports_takeaway: input.supports_takeaway,
          supports_delivery: input.supports_delivery,
          sort_order: input.sort_order,
        });
        if (copySource) {
          const rules = await trx("source_product_rules").where({ source_id: copySource.id });
          if (rules.length) {
            await trx("source_product_rules").insert(
              rules.map((rule) => ({
                source_id: id,
                product_id: rule.product_id,
                price_override: rule.price_override,
                is_available: rule.is_available,
              }))
            );
          }
        }
      });

      await writeAudit(db, {
        accountId,
        userId: req.user!.id,
        action: "order_source.create",
        entityType: "order_source",
        entityId: id,
        meta: { name_ar: input.name_ar, copied_from: copySource?.id ?? null },
        ip: req.ip,
      });
      res.status(201).json({
        data: await db("order_sources").where({ id }).first(),
        message: ar.messages.created,
      });
    } catch (error) {
      next(error);
    }
  });

  router.patch("/:id", requirePermission("settings.manage"), async (req, res, next) => {
    try {
      const parsed = sourcePatchSchema.safeParse(req.body);
      if (!parsed.success) throw err.validation(parsed.error.flatten());
      const source = await db<OrderSourceRow>("order_sources")
        .where({ id: req.params.id, account_id: req.user!.accountId })
        .first();
      if (!source) throw err.notFound();

      const next = { ...source, ...parsed.data };
      if (!next.supports_takeaway && !next.supports_delivery) {
        throw err.validation({ supports_takeaway: "يجب تفعيل نوع طلب واحد على الأقل" });
      }
      await db("order_sources")
        .where({ id: source.id })
        .update({ ...parsed.data, updated_at: db.fn.now() });

      await writeAudit(db, {
        accountId: req.user!.accountId,
        userId: req.user!.id,
        action: "order_source.update",
        entityType: "order_source",
        entityId: source.id,
        meta: parsed.data,
        ip: req.ip,
      });
      res.json({
        data: await db("order_sources").where({ id: source.id }).first(),
        message: ar.messages.updated,
      });
    } catch (error) {
      next(error);
    }
  });

  router.get("/:id/menu", requirePermission("settings.manage"), async (req, res, next) => {
    try {
      const source = await db<OrderSourceRow>("order_sources")
        .where({ id: req.params.id, account_id: req.user!.accountId })
        .first();
      if (!source) throw err.notFound();

      const [products, rules] = await Promise.all([
        db("products as p")
          .join("categories as c", "c.id", "p.category_id")
          .where({ "p.account_id": req.user!.accountId, "p.is_active": true })
          .orderBy([{ column: "c.sort_order", order: "asc" }, { column: "p.sort_order", order: "asc" }])
          .select("p.id", "p.name_ar", "p.base_price", "p.image_url", "c.name_ar as category_name_ar"),
        db("source_product_rules").where({ source_id: source.id }),
      ]);
      const byProduct = new Map(rules.map((rule) => [rule.product_id, rule]));
      res.json({
        data: {
          source,
          products: products.map((product) => {
            const rule = byProduct.get(product.id);
            return {
              ...product,
              price_override: rule?.price_override == null ? null : Number(rule.price_override),
              is_available: rule?.is_available ?? true,
            };
          }),
        },
      });
    } catch (error) {
      next(error);
    }
  });

  router.put("/:id/menu", requirePermission("settings.manage"), async (req, res, next) => {
    try {
      const parsed = menuRulesSchema.safeParse(req.body);
      if (!parsed.success) throw err.validation(parsed.error.flatten());
      const source = await db<OrderSourceRow>("order_sources")
        .where({ id: req.params.id, account_id: req.user!.accountId })
        .first();
      if (!source) throw err.notFound();

      const productIds = [...new Set(parsed.data.items.map((item) => item.product_id))];
      const owned = productIds.length
        ? await db("products").whereIn("id", productIds).where({ account_id: req.user!.accountId }).pluck("id")
        : [];
      if (owned.length !== productIds.length) throw err.notFound();

      await db.transaction(async (trx) => {
        for (const item of parsed.data.items) {
          if (item.price_override == null && item.is_available) {
            await trx("source_product_rules")
              .where({ source_id: source.id, product_id: item.product_id })
              .del();
          } else {
            await trx("source_product_rules")
              .insert({
                source_id: source.id,
                product_id: item.product_id,
                price_override: item.price_override,
                is_available: item.is_available,
              })
              .onConflict(["source_id", "product_id"])
              .merge({
                price_override: item.price_override,
                is_available: item.is_available,
                updated_at: trx.fn.now(),
              });
          }
        }
      });

      await writeAudit(db, {
        accountId: req.user!.accountId,
        userId: req.user!.id,
        action: "order_source.menu_update",
        entityType: "order_source",
        entityId: source.id,
        meta: { products: parsed.data.items.length },
        ip: req.ip,
      });
      res.json({ message: ar.messages.updated });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
