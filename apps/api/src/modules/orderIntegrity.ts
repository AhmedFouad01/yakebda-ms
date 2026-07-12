import { NextFunction, Request, Response, Router } from "express";
import { Knex } from "knex";
import { z } from "zod";
import { err } from "../lib/errors";
import { requireUser } from "../middleware/auth";

const orderConfigurationSchema = z.object({
  items: z
    .array(
      z.object({
        product_id: z.string().uuid(),
        variant_id: z.string().uuid().optional().nullable(),
        modifier_ids: z.array(z.string().uuid()).default([]),
      })
    )
    .min(1),
});

interface ValidationItem {
  product_id: string;
  variant_id?: string | null;
  modifier_ids: string[];
}

export async function validateOrderConfiguration(
  db: Knex,
  accountId: string,
  items: ValidationItem[]
): Promise<void> {
  const productIds = [...new Set(items.map((item) => item.product_id))];
  const products = await db("products")
    .where({ account_id: accountId, is_active: true })
    .whereIn("id", productIds)
    .select("id");
  const activeProductIds = new Set(products.map((product) => product.id));
  if (activeProductIds.size !== productIds.length) {
    throw err.validation({ items: "يوجد صنف غير موجود أو غير نشط." });
  }

  const variantIds = [...new Set(items.map((item) => item.variant_id).filter(Boolean) as string[])];
  const variants = variantIds.length
    ? await db("product_variants")
        .whereIn("id", variantIds)
        .where("is_active", true)
        .select("id", "product_id")
    : [];
  const variantsById = new Map(variants.map((variant) => [variant.id, variant]));

  const links = await db("product_modifier_groups as pmg")
    .join("modifier_groups as mg", "mg.id", "pmg.modifier_group_id")
    .whereIn("pmg.product_id", productIds)
    .where("mg.account_id", accountId)
    .where("mg.is_active", true)
    .select(
      "pmg.product_id",
      "mg.id as group_id",
      "mg.name_ar",
      "mg.min_select",
      "mg.max_select",
      "mg.is_required"
    );

  const modifierIds = [...new Set(items.flatMap((item) => item.modifier_ids))];
  const modifiers = modifierIds.length
    ? await db("modifiers as m")
        .join("modifier_groups as mg", "mg.id", "m.modifier_group_id")
        .whereIn("m.id", modifierIds)
        .where("mg.account_id", accountId)
        .where("m.is_active", true)
        .where("mg.is_active", true)
        .select("m.id", "m.modifier_group_id", "m.name_ar")
    : [];
  const modifiersById = new Map(modifiers.map((modifier) => [modifier.id, modifier]));

  for (const item of items) {
    if (item.variant_id) {
      const variant = variantsById.get(item.variant_id);
      if (!variant || variant.product_id !== item.product_id) {
        throw err.validation({ variant_id: "الحجم المختار لا يتبع الصنف المطلوب." });
      }
    }

    if (new Set(item.modifier_ids).size !== item.modifier_ids.length) {
      throw err.validation({ modifier_ids: "لا يمكن تكرار نفس الإضافة داخل الصنف." });
    }

    const productGroups = links.filter((link) => link.product_id === item.product_id);
    const linkedGroupIds = new Set(productGroups.map((group) => group.group_id));
    const selectedByGroup = new Map<string, number>();

    for (const modifierId of item.modifier_ids) {
      const modifier = modifiersById.get(modifierId);
      if (!modifier || !linkedGroupIds.has(modifier.modifier_group_id)) {
        throw err.validation({ modifier_ids: "يوجد اختيار لا يتبع الصنف المطلوب." });
      }
      selectedByGroup.set(
        modifier.modifier_group_id,
        (selectedByGroup.get(modifier.modifier_group_id) ?? 0) + 1
      );
    }

    for (const group of productGroups) {
      const selected = selectedByGroup.get(group.group_id) ?? 0;
      const minimum = Math.max(Number(group.min_select), group.is_required ? 1 : 0);
      if (selected < minimum) {
        throw err.validation({
          modifier_ids: `يجب اختيار ${minimum} على الأقل من مجموعة «${group.name_ar}».`,
        });
      }
      if (selected > Number(group.max_select)) {
        throw err.validation({
          modifier_ids: `الحد الأقصى من مجموعة «${group.name_ar}» هو ${group.max_select}.`,
        });
      }
    }
  }
}

async function configurationPreflight(req: Request, _res: Response, next: NextFunction) {
  try {
    const parsed = orderConfigurationSchema.safeParse(req.body);
    // Leave malformed request reporting to the canonical create-order schema.
    if (!parsed.success) return next();
    await validateOrderConfiguration(req.app.locals.db as Knex, req.user!.accountId, parsed.data.items);
    return next();
  } catch (error) {
    return next(error);
  }
}

export function orderIntegrityRoutes(db: Knex): Router {
  const router = Router();
  router.use(requireUser(db));

  // Expose the DB handle only within this router's request lifecycle helper.
  router.use((req, _res, next) => {
    req.app.locals.db = db;
    next();
  });

  router.post("/", configurationPreflight);
  return router;
}
