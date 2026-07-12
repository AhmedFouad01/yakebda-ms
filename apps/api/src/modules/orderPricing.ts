import { Router } from "express";
import { Knex } from "knex";
import { z } from "zod";
import { err } from "../lib/errors";
import { canAccessBranch, requirePermission, requireUser } from "../middleware/auth";
import { ar } from "../i18n/ar";
import { getSettings, Settings } from "./settings";
import { validateOrderConfiguration } from "./orderIntegrity";

export interface PricingItemInput {
  product_id: string;
  variant_id?: string | null;
  qty: number;
  notes?: string | null;
  modifier_ids: string[];
}

export interface PricingInput {
  order_type: "dine_in" | "takeaway" | "delivery";
  delivery_fee: number;
  discount: number;
  discount_reason?: string | null;
  items: PricingItemInput[];
}

export interface PricedOrderLine {
  input: PricingItemInput;
  product: Record<string, any>;
  variant?: { id: string; name_ar: string; price_delta: string | number };
  mods: Array<Record<string, any>>;
  unit: number;
  lineTotal: number;
}

export interface OrderQuote {
  lines: PricedOrderLine[];
  subtotal: number;
  discount: number;
  deliveryFee: number;
  serviceFee: number;
  vatAmount: number;
  rounding: number;
  total: number;
}

export function computeOrderTotals(
  settings: Settings,
  subtotal: number,
  discount: number,
  deliveryFee: number
) {
  const afterDiscount = Math.max(0, subtotal - discount);
  let serviceFee = 0;
  if (settings.service_fee_enabled && settings.service_fee_value > 0) {
    serviceFee =
      settings.service_fee_type === "percent"
        ? (afterDiscount * settings.service_fee_value) / 100
        : settings.service_fee_value;
    serviceFee = Math.round(serviceFee * 100) / 100;
  }

  let vatAmount = 0;
  let total = afterDiscount + serviceFee + deliveryFee;
  if (settings.vat_enabled && settings.vat_percentage > 0) {
    const rate = settings.vat_percentage / 100;
    if (settings.prices_include_vat) {
      vatAmount = Math.round((total - total / (1 + rate)) * 100) / 100;
    } else {
      vatAmount = Math.round((afterDiscount + serviceFee) * rate * 100) / 100;
      total += vatAmount;
    }
  }

  let rounding = 0;
  if (settings.rounding_rule !== "none") {
    const step = settings.rounding_rule === "nearest_050" ? 0.5 : 1;
    const rounded = Math.round(total / step) * step;
    rounding = Math.round((rounded - total) * 100) / 100;
    total = rounded;
  }

  return {
    serviceFee,
    vatAmount,
    rounding,
    total: Math.round(total * 100) / 100,
  };
}

export async function buildOrderQuote(
  db: Knex,
  accountId: string,
  branchId: string,
  settings: Settings,
  input: PricingInput,
  options: { canApproveDiscount: boolean }
): Promise<OrderQuote> {
  await validateOrderConfiguration(db, accountId, input.items);

  const productIds = [...new Set(input.items.map((item) => item.product_id))];
  const products = await db("products")
    .whereIn("id", productIds)
    .where({ account_id: accountId, is_active: true });
  if (products.length !== productIds.length) throw err.notFound();

  const overrides = await db("branch_product_prices")
    .where({ branch_id: branchId })
    .whereIn("product_id", productIds);
  const availability = await db("branch_product_availability")
    .where({ branch_id: branchId })
    .whereIn("product_id", productIds);

  const variantIds = [...new Set(input.items.map((item) => item.variant_id).filter(Boolean) as string[])];
  const variants = variantIds.length
    ? await db("product_variants").whereIn("id", variantIds).where("is_active", true)
    : [];

  const modifierIds = [...new Set(input.items.flatMap((item) => item.modifier_ids))];
  const modifiers = modifierIds.length
    ? await db("modifiers as m")
        .join("modifier_groups as g", "g.id", "m.modifier_group_id")
        .whereIn("m.id", modifierIds)
        .where("g.account_id", accountId)
        .where("m.is_active", true)
        .where("g.is_active", true)
        .select("m.*")
    : [];
  if (modifiers.length !== modifierIds.length) throw err.notFound();

  let subtotal = 0;
  const lines = input.items.map((item) => {
    const product = products.find((candidate) => candidate.id === item.product_id)!;
    const itemAvailability = availability.find((candidate) => candidate.product_id === item.product_id);
    if (itemAvailability && !itemAvailability.is_available) {
      throw err.validation({ product: `${ar.errors.product_unavailable}: ${product.name_ar}` });
    }

    let variant: { id: string; name_ar: string; price_delta: string | number } | undefined;
    if (item.variant_id) {
      variant = variants.find(
        (candidate) => candidate.id === item.variant_id && candidate.product_id === product.id
      );
      if (!variant) throw err.notFound();
    }

    const override = overrides.find((candidate) => candidate.product_id === product.id)?.price_override;
    const base = override != null ? Number(override) : Number(product.base_price);
    const mods = item.modifier_ids.map((modifierId) => modifiers.find((modifier) => modifier.id === modifierId)!);
    const unit =
      base +
      (variant ? Number(variant.price_delta) : 0) +
      mods.reduce((sum, modifier) => sum + Number(modifier.price_delta), 0);
    const lineTotal = unit * item.qty;
    subtotal += lineTotal;
    return { input: item, product, variant, mods, unit, lineTotal };
  });

  let discount = settings.allow_discounts ? Math.min(input.discount, subtotal) : 0;
  if (discount > 0) {
    const overAmount = discount > settings.max_discount_without_manager;
    const overPercent = subtotal > 0 && (discount / subtotal) * 100 > settings.max_cashier_discount_percent;
    if (settings.approval_discount_above_limit && (overAmount || overPercent) && !options.canApproveDiscount) {
      throw err.validation({ discount: ar.errors.discount_above_limit });
    }
    if (settings.discount_reason_required && !input.discount_reason) {
      throw err.validation({ discount_reason: ar.errors.discount_reason_required });
    }
  }

  if (
    input.order_type === "delivery" &&
    settings.min_delivery_order > 0 &&
    subtotal < settings.min_delivery_order
  ) {
    throw err.validation({ min_order: ar.errors.delivery_min_order });
  }

  const totals = computeOrderTotals(settings, subtotal, discount, input.delivery_fee);
  return {
    lines,
    subtotal,
    discount,
    deliveryFee: input.delivery_fee,
    ...totals,
  };
}

const quoteSchema = z.object({
  branch_id: z.string().uuid(),
  order_type: z.enum(["dine_in", "takeaway", "delivery"]).default("takeaway"),
  delivery_fee: z.number().nonnegative().default(0),
  discount: z.number().nonnegative().default(0),
  discount_reason: z.string().optional().nullable(),
  items: z
    .array(
      z.object({
        product_id: z.string().uuid(),
        variant_id: z.string().uuid().optional().nullable(),
        qty: z.number().int().min(1),
        notes: z.string().optional().nullable(),
        modifier_ids: z.array(z.string().uuid()).default([]),
      })
    )
    .min(1),
});

export function orderPricingRoutes(db: Knex): Router {
  const router = Router();

  router.post(
    "/quote",
    requireUser(db),
    requirePermission("orders.create"),
    async (req, res, next) => {
      try {
        const parsed = quoteSchema.safeParse(req.body);
        if (!parsed.success) throw err.validation(parsed.error.flatten());
        const input = parsed.data;
        const branch = await db("branches")
          .where({ id: input.branch_id, account_id: req.user!.accountId, is_active: true })
          .first();
        if (!branch) throw err.notFound();
        if (!canAccessBranch(req.user!, branch.id)) throw err.forbidden();

        const settings = await getSettings(db, req.user!.accountId, branch.id);
        const typeEnabled: Record<string, boolean> = {
          takeaway: settings.order_type_takeaway_enabled && branch.accepts_takeaway !== false,
          delivery: settings.order_type_delivery_enabled && branch.accepts_delivery !== false,
          dine_in: settings.order_type_dine_in_enabled && branch.dine_in_enabled === true,
        };
        if (!typeEnabled[input.order_type]) {
          throw err.validation({ order_type: ar.errors.order_type_disabled });
        }

        const quote = await buildOrderQuote(
          db,
          req.user!.accountId,
          branch.id,
          settings,
          input,
          { canApproveDiscount: req.user!.permissions.includes("orders.discount_above_limit") }
        );

        res.json({
          data: {
            items: quote.lines.map((line) => ({
              product_id: line.product.id,
              name_ar: line.product.name_ar,
              variant_id: line.variant?.id ?? null,
              variant_name_ar: line.variant?.name_ar ?? null,
              modifier_ids: line.mods.map((modifier) => modifier.id),
              modifiers: line.mods.map((modifier) => ({
                id: modifier.id,
                name_ar: modifier.name_ar,
                price_delta: Number(modifier.price_delta),
              })),
              qty: line.input.qty,
              unit_price: line.unit,
              line_total: line.lineTotal,
            })),
            subtotal: quote.subtotal,
            discount: quote.discount,
            delivery_fee: quote.deliveryFee,
            service_fee: quote.serviceFee,
            vat_amount: quote.vatAmount,
            rounding_adjustment: quote.rounding,
            total: quote.total,
          },
        });
      } catch (error) {
        next(error);
      }
    }
  );

  return router;
}
