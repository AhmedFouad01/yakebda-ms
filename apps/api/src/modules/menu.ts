import { Router } from "express";
import { z } from "zod";
import { Knex } from "knex";
import { err } from "../lib/errors";
import { newId } from "../lib/ids";
import { writeAudit } from "../lib/audit";
import { requirePermission, requireUser } from "../middleware/auth";
import { ar } from "../i18n/ar";

/** YKMS-02D — Menu Core + Ya Kebda POS menu import. All queries are account-scoped. */

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
  ingredients_ar: z.string().optional().nullable(),
  portion_note_ar: z.string().optional().nullable(),
  cost_price: z.number().nonnegative().optional().default(0),
  prep_time_minutes: z.number().int().min(0).optional().default(0),
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

const importSchema = z.object({
  items: z.array(
    z.object({
      category: z.string().min(1),
      name_ar: z.string().min(1),
      sku: z.string().optional().nullable(),
      base_price: z.number().nonnegative(),
      description_ar: z.string().optional().nullable(),
      image_url: z.string().optional().nullable(),
      ingredients_ar: z.string().optional().nullable(),
      portion_note_ar: z.string().optional().nullable(),
      cost_price: z.number().nonnegative().optional().default(0),
      prep_time_minutes: z.number().int().min(0).optional().default(0),
      variants: z.array(variantSchema.partial({ is_active: true }).extend({ name_ar: z.string().min(1), price_delta: z.number().default(0) })).optional().default([]),
      modifier_groups: z
        .array(
          z.object({
            name_ar: z.string().min(1),
            min_select: z.number().int().min(0).optional().default(0),
            max_select: z.number().int().min(1).optional().default(1),
            is_required: z.boolean().optional().default(false),
            modifiers: z.array(modifierSchema.partial({ is_active: true }).extend({ name_ar: z.string().min(1), price_delta: z.number().default(0) })).optional().default([]),
          })
        )
        .optional()
        .default([]),
    })
  ),
});

async function findOrCreateCategory(db: Knex, accountId: string, name: string): Promise<string> {
  const found = await db("categories").where({ account_id: accountId, name_ar: name }).first();
  if (found) return found.id;
  const id = newId();
  const [{ count }] = await db("categories").where({ account_id: accountId }).count<{ count: string }[]>("id as count");
  await db("categories").insert({ id, account_id: accountId, name_ar: name, sort_order: Number(count ?? 0), is_active: true });
  return id;
}

async function findOrCreateModifierGroup(
  trx: Knex.Transaction,
  accountId: string,
  input: z.infer<typeof importSchema>["items"][number]["modifier_groups"][number]
): Promise<string> {
  let group = await trx("modifier_groups").where({ account_id: accountId, name_ar: input.name_ar }).first();
  if (!group) {
    const id = newId();
    await trx("modifier_groups").insert({
      id,
      account_id: accountId,
      name_ar: input.name_ar,
      min_select: input.min_select,
      max_select: input.max_select,
      is_required: input.is_required,
      sort_order: 0,
      is_active: true,
    });
    group = await trx("modifier_groups").where({ id }).first();
  }
  for (const m of input.modifiers ?? []) {
    const existing = await trx("modifiers").where({ modifier_group_id: group.id, name_ar: m.name_ar }).first();
    if (existing) {
      await trx("modifiers").where({ id: existing.id }).update({ price_delta: m.price_delta ?? 0, is_active: m.is_active ?? true, updated_at: trx.fn.now() });
    } else {
      await trx("modifiers").insert({ id: newId(), modifier_group_id: group.id, name_ar: m.name_ar, price_delta: m.price_delta ?? 0, is_active: true });
    }
  }
  return group.id;
}

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
      await writeAudit(db, { accountId: req.user!.accountId, userId: req.user!.id, action: "category.create", entityType: "category", entityId: id, meta: { name_ar: body.data.name_ar }, ip: req.ip });
      res.status(201).json({ data: await db("categories").where({ id }).first(), message: ar.messages.created });
    } catch (e) {
      next(e);
    }
  });

  r.patch("/:id", requirePermission("menu.manage"), async (req, res, next) => {
    try {
      const body = categorySchema.partial().safeParse(req.body);
      if (!body.success) throw err.validation(body.error.flatten());
      const row = await db("categories").where({ id: req.params.id, account_id: req.user!.accountId }).first();
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
      const variants = ids.length ? await db("product_variants").whereIn("product_id", ids).orderBy("created_at", "asc") : [];
      const links = ids.length ? await db("product_modifier_groups").whereIn("product_id", ids) : [];
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

  r.post("/import", requirePermission("menu.manage"), async (req, res, next) => {
    try {
      const body = importSchema.safeParse(req.body);
      if (!body.success) throw err.validation(body.error.flatten());
      const accountId = req.user!.accountId;
      const result = await db.transaction(async (trx) => {
        let created = 0;
        let updated = 0;
        let variants = 0;
        for (const [idx, item] of body.data.items.entries()) {
          const categoryId = await findOrCreateCategory(trx, accountId, item.category);
          const productData = {
            category_id: categoryId,
            name_ar: item.name_ar,
            sku: item.sku ?? null,
            base_price: item.base_price,
            description_ar: item.description_ar ?? null,
            image_url: item.image_url ?? null,
            ingredients_ar: item.ingredients_ar ?? null,
            portion_note_ar: item.portion_note_ar ?? null,
            cost_price: item.cost_price ?? 0,
            prep_time_minutes: item.prep_time_minutes ?? 0,
            is_active: true,
          };
          const existing = item.sku
            ? await trx("products").where({ account_id: accountId, sku: item.sku }).first()
            : await trx("products").where({ account_id: accountId, name_ar: item.name_ar }).first();
          const productId = existing?.id ?? newId();
          if (existing) {
            updated++;
            await trx("products").where({ id: productId }).update({ ...productData, updated_at: trx.fn.now() });
          } else {
            created++;
            await trx("products").insert({ id: productId, account_id: accountId, sort_order: idx, ...productData });
          }
          for (const v of item.variants ?? []) {
            const existingVariant = await trx("product_variants").where({ product_id: productId, name_ar: v.name_ar }).first();
            if (existingVariant) {
              await trx("product_variants").where({ id: existingVariant.id }).update({ price_delta: v.price_delta ?? 0, is_active: v.is_active ?? true, updated_at: trx.fn.now() });
            } else {
              await trx("product_variants").insert({ id: newId(), product_id: productId, name_ar: v.name_ar, price_delta: v.price_delta ?? 0, is_active: true });
            }
            variants++;
          }
          const groupIds: string[] = [];
          for (const g of item.modifier_groups ?? []) {
            groupIds.push(await findOrCreateModifierGroup(trx, accountId, g));
          }
          if (groupIds.length) {
            await trx("product_modifier_groups").where({ product_id: productId }).del();
            await trx("product_modifier_groups").insert(groupIds.map((gid, i) => ({ product_id: productId, modifier_group_id: gid, sort_order: i })));
          }
        }
        return { created, updated, variants, total: body.data.items.length };
      });
      await writeAudit(db, { accountId, userId: req.user!.id, action: "menu.import", entityType: "product", entityId: null, meta: result, ip: req.ip });
      res.status(201).json({ data: result, message: ar.messages.created });
    } catch (e) {
      next(e);
    }
  });

  r.post("/", requirePermission("menu.manage"), async (req, res, next) => {
    try {
      const body = productSchema.safeParse(req.body);
      if (!body.success) throw err.validation(body.error.flatten());
      const category = await db("categories").where({ id: body.data.category_id, account_id: req.user!.accountId }).first();
      if (!category) throw err.notFound();
      const id = newId();
      await db("products").insert({ id, account_id: req.user!.accountId, ...body.data });
      await writeAudit(db, { accountId: req.user!.accountId, userId: req.user!.id, action: "product.create", entityType: "product", entityId: id, meta: { name_ar: body.data.name_ar }, ip: req.ip });
      res.status(201).json({ data: await db("products").where({ id }).first(), message: ar.messages.created });
    } catch (e) {
      next(e);
    }
  });

  r.patch("/:id", requirePermission("menu.manage"), async (req, res, next) => {
    try {
      const body = productSchema.partial().safeParse(req.body);
      if (!body.success) throw err.validation(body.error.flatten());
      const row = await db("products").where({ id: req.params.id, account_id: req.user!.accountId }).first();
      if (!row) throw err.notFound();
      if (body.data.category_id) {
        const cat = await db("categories").where({ id: body.data.category_id, account_id: req.user!.accountId }).first();
        if (!cat) throw err.notFound();
      }
      await db("products").where({ id: row.id }).update({ ...body.data, updated_at: db.fn.now() });
      res.json({ data: await db("products").where({ id: row.id }).first(), message: ar.messages.updated });
    } catch (e) {
      next(e);
    }
  });

  r.post("/:id/variants", requirePermission("menu.manage"), async (req, res, next) => {
    try {
      const body = variantSchema.safeParse(req.body);
      if (!body.success) throw err.validation(body.error.flatten());
      const product = await db("products").where({ id: req.params.id, account_id: req.user!.accountId }).first();
      if (!product) throw err.notFound();
      const id = newId();
      await db("product_variants").insert({ id, product_id: product.id, ...body.data });
      res.status(201).json({ data: await db("product_variants").where({ id }).first(), message: ar.messages.created });
    } catch (e) {
      next(e);
    }
  });

  r.put("/:id/modifier-groups", requirePermission("menu.manage"), async (req, res, next) => {
    try {
      const body = z.object({ modifier_group_ids: z.array(z.string().uuid()) }).safeParse(req.body);
      if (!body.success) throw err.validation(body.error.flatten());
      const product = await db("products").where({ id: req.params.id, account_id: req.user!.accountId }).first();
      if (!product) throw err.notFound();
      const owned = await db("modifier_groups").whereIn("id", body.data.modifier_group_ids).where({ account_id: req.user!.accountId }).pluck("id");
      if (owned.length !== body.data.modifier_group_ids.length) throw err.notFound();
      await db("product_modifier_groups").where({ product_id: product.id }).del();
      if (owned.length) await db("product_modifier_groups").insert(owned.map((gid: string, i: number) => ({ product_id: product.id, modifier_group_id: gid, sort_order: i })));
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
      const groups = await db("modifier_groups").where({ account_id: req.user!.accountId }).orderBy("sort_order", "asc");
      const ids = groups.map((g) => g.id);
      const mods = ids.length ? await db("modifiers").whereIn("modifier_group_id", ids) : [];
      res.json({ data: groups.map((g) => ({ ...g, modifiers: mods.filter((m) => m.modifier_group_id === g.id) })) });
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
      const row = await db("modifier_groups").where({ id: req.params.id, account_id: req.user!.accountId }).first();
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
      const group = await db("modifier_groups").where({ id: req.params.id, account_id: req.user!.accountId }).first();
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

  r.get("/:branchId/menu", async (req, res, next) => {
    try {
      const branch = await ownBranch(db, req.user!.accountId, req.params.branchId);
      if (!branch) throw err.notFound();
      const categories = await db("categories").where({ account_id: req.user!.accountId, is_active: true }).orderBy("sort_order", "asc");
      const products = await db("products").where({ account_id: req.user!.accountId, is_active: true }).orderBy("sort_order", "asc");
      const ids = products.map((p) => p.id);
      const [variants, links, groups, mods, prices, avail] = await Promise.all([
        ids.length ? db("product_variants").whereIn("product_id", ids).where("is_active", true) : [],
        ids.length ? db("product_modifier_groups").whereIn("product_id", ids).orderBy("sort_order") : [],
        db("modifier_groups").where({ account_id: req.user!.accountId, is_active: true }),
        db("modifiers").whereIn("modifier_group_id", db("modifier_groups").select("id").where({ account_id: req.user!.accountId })).where("is_active", true),
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
              modifier_groups: links.filter((l) => l.product_id === p.id).map((l) => groupById.get(l.modifier_group_id)).filter(Boolean),
            };
          }),
      }));
      res.json({ data: { branch: { id: branch.id, name: branch.name }, categories: data } });
    } catch (e) {
      next(e);
    }
  });

  r.patch("/:branchId/menu-availability", requirePermission("menu.manage"), async (req, res, next) => {
    try {
      const body = z.object({ items: z.array(z.object({ product_id: z.string().uuid(), is_available: z.boolean(), available_count: z.number().int().nullable().optional(), availability_note_ar: z.string().nullable().optional() })) }).safeParse(req.body);
      if (!body.success) throw err.validation(body.error.flatten());
      const branch = await ownBranch(db, req.user!.accountId, req.params.branchId);
      if (!branch) throw err.notFound();
      const owned = await db("products").whereIn("id", body.data.items.map((i) => i.product_id)).where({ account_id: req.user!.accountId }).pluck("id");
      for (const item of body.data.items) {
        if (!owned.includes(item.product_id)) throw err.notFound();
        await db("branch_product_availability").insert({ branch_id: branch.id, product_id: item.product_id, is_available: item.is_available, available_count: item.available_count ?? null, availability_note_ar: item.availability_note_ar ?? null }).onConflict(["branch_id", "product_id"]).merge();
      }
      res.json({ message: ar.messages.updated });
    } catch (e) {
      next(e);
    }
  });

  r.patch("/:branchId/menu-prices", requirePermission("menu.manage"), async (req, res, next) => {
    try {
      const body = z.object({ items: z.array(z.object({ product_id: z.string().uuid(), price_override: z.number().nonnegative().nullable() })) }).safeParse(req.body);
      if (!body.success) throw err.validation(body.error.flatten());
      const branch = await ownBranch(db, req.user!.accountId, req.params.branchId);
      if (!branch) throw err.notFound();
      const owned = await db("products").whereIn("id", body.data.items.map((i) => i.product_id)).where({ account_id: req.user!.accountId }).pluck("id");
      for (const item of body.data.items) {
        if (!owned.includes(item.product_id)) throw err.notFound();
        if (item.price_override == null) await db("branch_product_prices").where({ branch_id: branch.id, product_id: item.product_id }).del();
        else await db("branch_product_prices").insert({ branch_id: branch.id, product_id: item.product_id, price_override: item.price_override }).onConflict(["branch_id", "product_id"]).merge();
      }
      res.json({ message: ar.messages.updated });
    } catch (e) {
      next(e);
    }
  });

  return r;
}
