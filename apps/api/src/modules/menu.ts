import { Router } from "express";
import { z } from "zod";
import { Knex } from "knex";
import { err } from "../lib/errors";
import { newId } from "../lib/ids";
import { writeAudit } from "../lib/audit";
import { requirePermission, requireUser } from "../middleware/auth";
import { ar } from "../i18n/ar";

/** YKMS-02 — Menu Core. All queries are account-scoped (tenant isolation rule). */

const categorySchema = z.object({
  name_ar: z.string().min(1),
  name_en: z.string().optional().nullable(),
  description_ar: z.string().optional().nullable(),
  sort_order: z.number().int().default(0),
  is_active: z.boolean().default(true),
});

const productSchema = z.object({
  category_id: z.string().uuid(),
  name_ar: z.string().min(1),
  name_en: z.string().optional().nullable(),
  description_ar: z.string().optional().nullable(),
  sku: z.string().optional().nullable(),
  base_price: z.number().nonnegative(),
  image_url: z.string().optional().nullable(),
  sort_order: z.number().int().default(0),
  is_active: z.boolean().default(true),
});

const variantSchema = z.object({
  name_ar: z.string().min(1),
  price_delta: z.number().default(0),
  is_active: z.boolean().default(true),
});

const modifierGroupSchema = z.object({
  name_ar: z.string().min(1),
  min_select: z.number().int().min(0).default(0),
  max_select: z.number().int().min(1).default(1),
  is_required: z.boolean().default(false),
  sort_order: z.number().int().default(0),
  is_active: z.boolean().default(true),
});

const modifierSchema = z.object({
  name_ar: z.string().min(1),
  price_delta: z.number().default(0),
  is_active: z.boolean().default(true),
});

export function categoryRoutes(db: Knex): Router {
  const r = Router();
  r.use(requireUser(db));

  r.get("/", async (req, res, next) => {
    try {
      const rows = await db("categories")
        .where({ account_id: req.user!.accountId })
        .orderBy("sort_order", "asc");
      res.json({ data: rows });
    } catch (e) {
      next(e);
    }
  });

  r.post("/", requirePermission("menu.manage"), async (req, res, next) => {
    try {
      const body = categorySchema.safeParse(req.body);
      if (!body.success) throw err.validation(body.error.flatten());
      const id = newId();
      await db("categories").insert({ id, account_id: req.user!.accountId, ...body.data });
      await writeAudit(db, {
        accountId: req.user!.accountId,
        userId: req.user!.id,
        action: "category.create",
        entityType: "category",
        entityId: id,
        meta: { name_ar: body.data.name_ar },
        ip: req.ip,
      });
      res.status(201).json({ data: await db("categories").where({ id }).first(), message: ar.messages.created });
    } catch (e) {
      next(e);
    }
  });

  r.patch("/:id", requirePermission("menu.manage"), async (req, res, next) => {
    try {
      const body = categorySchema.partial().safeParse(req.body);
      if (!body.success) throw err.validation(body.error.flatten());
      const row = await db("categories")
        .where({ id: req.params.id, account_id: req.user!.accountId })
        .first();
      if (!row) throw err.notFound();
      await db("categories").where({ id: row.id }).update({ ...body.data, updated_at: db.fn.now() });
      res.json({ data: await db("categories").where({ id: row.id }).first(), message: ar.messages.updated });
    } catch (e) {
      next(e);
    }
  });

  return r;
}

export function productRoutes(db: Knex): Router {
  const r = Router();
  r.use(requireUser(db));

  r.get("/", async (req, res, next) => {
    try {
      const q = z.object({ category_id: z.string().uuid().optional() }).safeParse(req.query);
      const rows = await db("products")
        .where({ account_id: req.user!.accountId })
        .modify((qb) => {
          if (q.success && q.data.category_id) qb.where("category_id", q.data.category_id);
        })
        .orderBy("sort_order", "asc");
      const ids = rows.map((p: { id: string }) => p.id);
      const variants = ids.length ? await db("product_variants").whereIn("product_id", ids) : [];
      const links = ids.length
        ? await db("product_modifier_groups").whereIn("product_id", ids)
        : [];
      res.json({
        data: rows.map((p: Record<string, unknown> & { id: string }) => ({
          ...p,
          variants: variants.filter((v) => v.product_id === p.id),
          modifier_group_ids: links.filter((l) => l.product_id === p.id).map((l) => l.modifier_group_id),
        })),
      });
    } catch (e) {
      next(e);
    }
  });

  r.post("/", requirePermission("menu.manage"), async (req, res, next) => {
    try {
      const body = productSchema.safeParse(req.body);
      if (!body.success) throw err.validation(body.error.flatten());
      const category = await db("categories")
        .where({ id: body.data.category_id, account_id: req.user!.accountId })
        .first();
      if (!category) throw err.notFound();
      const id = newId();
      await db("products").insert({ id, account_id: req.user!.accountId, ...body.data });
      await writeAudit(db, {
        accountId: req.user!.accountId,
        userId: req.user!.id,
        action: "product.create",
        entityType: "product",
        entityId: id,
        meta: { name_ar: body.data.name_ar },
        ip: req.ip,
      });
      res.status(201).json({ data: await db("products").where({ id }).first(), message: ar.messages.created });
    } catch (e) {
      next(e);
    }
  });

  r.patch("/:id", requirePermission("menu.manage"), async (req, res, next) => {
    try {
      const body = productSchema.partial().safeParse(req.body);
      if (!body.success) throw err.validation(body.error.flatten());
      const row = await db("products")
        .where({ id: req.params.id, account_id: req.user!.accountId })
        .first();
      if (!row) throw err.notFound();
      if (body.data.category_id) {
        const cat = await db("categories")
          .where({ id: body.data.category_id, account_id: req.user!.accountId })
          .first();
        if (!cat) throw err.notFound();
      }
      await db("products").where({ id: row.id }).update({ ...body.data, updated_at: db.fn.now() });
      res.json({ data: await db("products").where({ id: row.id }).first(), message: ar.messages.updated });
    } catch (e) {
      next(e);
    }
  });

  // Variants
  r.post("/:id/variants", requirePermission("menu.manage"), async (req, res, next) => {
    try {
      const body = variantSchema.safeParse(req.body);
      if (!body.success) throw err.validation(body.error.flatten());
      const product = await db("products")
        .where({ id: req.params.id, account_id: req.user!.accountId })
        .first();
      if (!product) throw err.notFound();
      const id = newId();
      await db("product_variants").insert({ id, product_id: product.id, ...body.data });
      res.status(201).json({ data: await db("product_variants").where({ id }).first(), message: ar.messages.created });
    } catch (e) {
      next(e);
    }
  });

  // Attach/detach modifier groups
  r.put("/:id/modifier-groups", requirePermission("menu.manage"), async (req, res, next) => {
    try {
      const body = z.object({ modifier_group_ids: z.array(z.string().uuid()) }).safeParse(req.body);
      if (!body.success) throw err.validation(body.error.flatten());
      const product = await db("products")
        .where({ id: req.params.id, account_id: req.user!.accountId })
        .first();
      if (!product) throw err.notFound();
      const owned = await db("modifier_groups")
        .whereIn("id", body.data.modifier_group_ids)
        .where({ account_id: req.user!.accountId })
        .pluck("id");
      if (owned.length !== body.data.modifier_group_ids.length) throw err.notFound();
      await db("product_modifier_groups").where({ product_id: product.id }).del();
      if (owned.length) {
        await db("product_modifier_groups").insert(
          owned.map((gid: string, i: number) => ({ product_id: product.id, modifier_group_id: gid, sort_order: i }))
        );
      }
      res.json({ data: { modifier_group_ids: owned }, message: ar.messages.updated });
    } catch (e) {
      next(e);
    }
  });

  return r;
}

export function modifierGroupRoutes(db: Knex): Router {
  const r = Router();
  r.use(requireUser(db));

  r.get("/", async (req, res, next) => {
    try {
      const groups = await db("modifier_groups")
        .where({ account_id: req.user!.accountId })
        .orderBy("sort_order", "asc");
      const ids = groups.map((g) => g.id);
      const mods = ids.length ? await db("modifiers").whereIn("modifier_group_id", ids) : [];
      res.json({
        data: groups.map((g) => ({ ...g, modifiers: mods.filter((m) => m.modifier_group_id === g.id) })),
      });
    } catch (e) {
      next(e);
    }
  });

  r.post("/", requirePermission("menu.manage"), async (req, res, next) => {
    try {
      const body = modifierGroupSchema.safeParse(req.body);
      if (!body.success) throw err.validation(body.error.flatten());
      const id = newId();
      await db("modifier_groups").insert({ id, account_id: req.user!.accountId, ...body.data });
      res.status(201).json({ data: await db("modifier_groups").where({ id }).first(), message: ar.messages.created });
    } catch (e) {
      next(e);
    }
  });

  r.patch("/:id", requirePermission("menu.manage"), async (req, res, next) => {
    try {
      const body = modifierGroupSchema.partial().safeParse(req.body);
      if (!body.success) throw err.validation(body.error.flatten());
      const row = await db("modifier_groups")
        .where({ id: req.params.id, account_id: req.user!.accountId })
        .first();
      if (!row) throw err.notFound();
      await db("modifier_groups").where({ id: row.id }).update({ ...body.data, updated_at: db.fn.now() });
      res.json({ data: await db("modifier_groups").where({ id: row.id }).first(), message: ar.messages.updated });
    } catch (e) {
      next(e);
    }
  });

  r.post("/:id/modifiers", requirePermission("menu.manage"), async (req, res, next) => {
    try {
      const body = modifierSchema.safeParse(req.body);
      if (!body.success) throw err.validation(body.error.flatten());
      const group = await db("modifier_groups")
        .where({ id: req.params.id, account_id: req.user!.accountId })
        .first();
      if (!group) throw err.notFound();
      const id = newId();
      await db("modifiers").insert({ id, modifier_group_id: group.id, ...body.data });
      res.status(201).json({ data: await db("modifiers").where({ id }).first(), message: ar.messages.created });
    } catch (e) {
      next(e);
    }
  });

  return r;
}

/** Branch-scoped menu: effective prices + availability. Mounted under /branches. */
export function branchMenuRoutes(db: Knex): Router {
  const r = Router();
  r.use(requireUser(db));

  async function ownBranch(db: Knex, accountId: string, branchId: string) {
    return db("branches").where({ id: branchId, account_id: accountId }).first();
  }

  // GET /:branchId/menu — full menu with effective price + availability (POS uses this)
  r.get("/:branchId/menu", async (req, res, next) => {
    try {
      const branch = await ownBranch(db, req.user!.accountId, req.params.branchId);
      if (!branch) throw err.notFound();
      const categories = await db("categories")
        .where({ account_id: req.user!.accountId, is_active: true })
        .orderBy("sort_order", "asc");
      const products = await db("products")
        .where({ account_id: req.user!.accountId, is_active: true })
        .orderBy("sort_order", "asc");
      const ids = products.map((p) => p.id);
      const [variants, links, groups, mods, prices, avail] = await Promise.all([
        ids.length ? db("product_variants").whereIn("product_id", ids).where("is_active", true) : [],
        ids.length ? db("product_modifier_groups").whereIn("product_id", ids).orderBy("sort_order") : [],
        db("modifier_groups").where({ account_id: req.user!.accountId, is_active: true }),
        db("modifiers")
          .whereIn("modifier_group_id", db("modifier_groups").select("id").where({ account_id: req.user!.accountId }))
          .where("is_active", true),
        db("branch_product_prices").where({ branch_id: branch.id }),
        db("branch_product_availability").where({ branch_id: branch.id }),
      ]);
      const groupById = new Map(groups.map((g) => [g.id, { ...g, modifiers: mods.filter((m) => m.modifier_group_id === g.id) }]));
      const data = categories.map((c) => ({
        ...c,
        products: products
          .filter((p) => p.category_id === c.id)
          .map((p) => {
            const override = prices.find((x) => x.product_id === p.id)?.price_override;
            const a = avail.find((x) => x.product_id === p.id);
            return {
              ...p,
              effective_price: override != null ? Number(override) : Number(p.base_price),
              is_available: a ? a.is_available : true,
              available_count: a?.available_count ?? null,
              availability_note_ar: a?.availability_note_ar ?? null,
              variants: variants.filter((v) => v.product_id === p.id),
              modifier_groups: links
                .filter((l) => l.product_id === p.id)
                .map((l) => groupById.get(l.modifier_group_id))
                .filter(Boolean),
            };
          }),
      }));
      res.json({ data: { branch: { id: branch.id, name: branch.name }, categories: data } });
    } catch (e) {
      next(e);
    }
  });

  // PATCH /:branchId/menu-availability
  r.patch("/:branchId/menu-availability", requirePermission("menu.manage"), async (req, res, next) => {
    try {
      const body = z
        .object({
          items: z.array(
            z.object({
              product_id: z.string().uuid(),
              is_available: z.boolean(),
              available_count: z.number().int().nullable().optional(),
              availability_note_ar: z.string().nullable().optional(),
            })
          ),
        })
        .safeParse(req.body);
      if (!body.success) throw err.validation(body.error.flatten());
      const branch = await ownBranch(db, req.user!.accountId, req.params.branchId);
      if (!branch) throw err.notFound();
      const owned = await db("products")
        .whereIn("id", body.data.items.map((i) => i.product_id))
        .where({ account_id: req.user!.accountId })
        .pluck("id");
      for (const item of body.data.items) {
        if (!owned.includes(item.product_id)) throw err.notFound();
        await db("branch_product_availability")
          .insert({
            branch_id: branch.id,
            product_id: item.product_id,
            is_available: item.is_available,
            available_count: item.available_count ?? null,
            availability_note_ar: item.availability_note_ar ?? null,
          })
          .onConflict(["branch_id", "product_id"])
          .merge();
      }
      res.json({ message: ar.messages.updated });
    } catch (e) {
      next(e);
    }
  });

  // PATCH /:branchId/menu-prices
  r.patch("/:branchId/menu-prices", requirePermission("menu.manage"), async (req, res, next) => {
    try {
      const body = z
        .object({
          items: z.array(
            z.object({ product_id: z.string().uuid(), price_override: z.number().nonnegative().nullable() })
          ),
        })
        .safeParse(req.body);
      if (!body.success) throw err.validation(body.error.flatten());
      const branch = await ownBranch(db, req.user!.accountId, req.params.branchId);
      if (!branch) throw err.notFound();
      const owned = await db("products")
        .whereIn("id", body.data.items.map((i) => i.product_id))
        .where({ account_id: req.user!.accountId })
        .pluck("id");
      for (const item of body.data.items) {
        if (!owned.includes(item.product_id)) throw err.notFound();
        if (item.price_override == null) {
          await db("branch_product_prices").where({ branch_id: branch.id, product_id: item.product_id }).del();
        } else {
          await db("branch_product_prices")
            .insert({ branch_id: branch.id, product_id: item.product_id, price_override: item.price_override })
            .onConflict(["branch_id", "product_id"])
            .merge();
        }
      }
      res.json({ message: ar.messages.updated });
    } catch (e) {
      next(e);
    }
  });

  return r;
}
