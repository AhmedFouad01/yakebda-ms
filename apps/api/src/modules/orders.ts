import { Router } from "express";
import { z } from "zod";
import { Knex } from "knex";
import { err } from "../lib/errors";
import { newId } from "../lib/ids";
import { writeAudit } from "../lib/audit";
import { AuthUser, canAccessBranch, requirePermission, requireUser } from "../middleware/auth";
import { ar } from "../i18n/ar";
import { renderReceiptPayload, renderKitchenTicketPayload } from "../lib/receipt";
import { getSettings, Settings } from "./settings";
/**
 * YKMS-02/03-lite — Orders & POS flow.
 * Prices are ALWAYS computed server-side from the branch menu (never trusted from the client).
 * Status flow: draft → submitted → in_kitchen → ready → completed | cancelled.
 */

export const ORDER_STATUSES = ["draft", "submitted", "in_kitchen", "ready", "completed", "cancelled"] as const;
const TRANSITIONS: Record<string, string[]> = {
  draft: ["submitted", "cancelled"],
  submitted: ["in_kitchen", "ready", "cancelled"],
  in_kitchen: ["ready", "cancelled"],
  ready: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};

const createOrderSchema = z.object({
  branch_id: z.string().uuid(),
  order_type: z.enum(["dine_in", "takeaway", "delivery"]).default("takeaway"),
  table_id: z.string().uuid().optional().nullable(),
  customer_id: z.string().uuid().optional().nullable(),
  delivery_address: z.string().optional().nullable(),
  delivery_fee: z.number().nonnegative().default(0),
  discount: z.number().nonnegative().default(0),
  discount_reason: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  submit: z.boolean().default(true), // POS submits immediately by default
  payment_method: z.enum(["cash", "card", "wallet", "unpaid"]).optional().nullable(),
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

export async function loadFullOrder(db: Knex, accountId: string, orderId: string) {
  const order = await db("orders").where({ id: orderId, account_id: accountId }).first();
  if (!order) return null;
  const items = await db("order_items as oi")
    .leftJoin("products as p", "p.id", "oi.product_id")
    .where("oi.order_id", order.id)
    .orderBy("oi.created_at", "asc")
    .select("oi.*", "p.image_url");
  const mods = items.length
    ? await db("order_item_modifiers").whereIn("order_item_id", items.map((i) => i.id))
    : [];
  const payments = await db("payments").where({ order_id: order.id }).orderBy("created_at", "asc");
  const branch = await db("branches").where({ id: order.branch_id }).first();
  const table = order.table_id ? await db("dining_tables").where({ id: order.table_id }).first() : null;
  const customer = order.customer_id ? await db("customers").where({ id: order.customer_id }).first() : null;
  const driver = order.driver_id ? await db("drivers").where({ id: order.driver_id }).first() : null;
  const sourceRow = order.source_id ? await db("order_sources").where({ id: order.source_id }).first() : null;
  // YKMS-02G: اسم الكاشير/منشئ الطلب لمراجعة التشغيل
  const cashier = order.created_by ? await db("users").where({ id: order.created_by }).first() : null;
  return {
    ...order,
    branch_name: branch?.name ?? "",
    table_name_ar: table?.name_ar ?? null,
    customer_name: customer?.name ?? null,
    customer_phone: customer?.phone ?? null,
    customer_address: customer?.address ?? null,
    driver_name: driver?.name ?? null,
    source_name: order.source_name_snapshot ?? sourceRow?.name_ar ?? "طلب سابق — المصدر غير مسجل",
    cashier_name: cashier?.name ?? null,
    items: items.map((i) => ({ ...i, modifiers: mods.filter((m) => m.order_item_id === i.id) })),
    payments,
  };
}

async function setStatus(
  db: Knex,
  order: { id: string; status: string; branch_id: string; account_id: string; table_id?: string | null },
  to: string,
  userId: string | null,
  cancelReason?: string
) {
  if (!TRANSITIONS[order.status]?.includes(to)) throw err.validation({ status: ar.errors.bad_status_transition });
  const patch: Record<string, unknown> = { status: to, updated_at: db.fn.now() };
  if (to === "submitted") patch.submitted_at = db.fn.now();
  if (to === "in_kitchen") patch.in_kitchen_at = db.fn.now(); // YKMS-02F: مصدر مؤقت المطبخ
  if (to === "ready") patch.ready_at = db.fn.now();
  if (to === "completed") patch.completed_at = db.fn.now();
  if (to === "cancelled") {
    patch.cancelled_at = db.fn.now();
    if (cancelReason) patch.cancel_reason = cancelReason;
  }
  await db("orders").where({ id: order.id }).update(patch);
  await db("order_status_history").insert({
    id: newId(),
    order_id: order.id,
    from_status: order.status,
    to_status: to,
    changed_by: userId,
  });
  // Table light-sync: occupy on submit, free on complete/cancel
  if (order.table_id) {
    if (to === "submitted" || to === "in_kitchen") {
      await db("dining_tables").where({ id: order.table_id }).update({ status: "occupied", updated_at: db.fn.now() });
    }
    if (to === "completed" || to === "cancelled") {
      await db("dining_tables").where({ id: order.table_id }).update({ status: "cleaning", updated_at: db.fn.now() });
    }
  }
}

/** YKMS-02E: ضرائب/رسوم خدمة/تقريب من الإعدادات — تُحفظ snapshot على الطلب. */
export function computeTotals(settings: Settings, subtotal: number, discount: number, deliveryFee: number) {
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
      vatAmount = Math.round((total - total / (1 + rate)) * 100) / 100; // معلوماتية — السعر شامل
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
  return { serviceFee, vatAmount, rounding, total: Math.round(total * 100) / 100 };
}

/** بادئة رقم الطلب: بادئة عامة + حرف نوع الطلب (T/D/O) عند التفعيل. */
function orderPrefix(settings: Settings, orderType: string): string | null {
  let prefix = settings.order_number_prefix ?? "";
  if (settings.order_type_letter_prefix) {
    prefix += orderType === "takeaway" ? "T" : orderType === "delivery" ? "D" : orderType === "online" ? "O" : "";
  }
  return prefix || null;
}

function canReadOrder(user: AuthUser, order: { branch_id: string; created_by?: string | null }): boolean {
  if (!canAccessBranch(user, order.branch_id)) return false;
  if (user.permissions.includes("orders.manage")) return true;
  return user.permissions.includes("orders.create") && order.created_by === user.id;
}

export function orderRoutes(db: Knex): Router {
  const r = Router();
  r.use(requireUser(db));

  r.get("/", async (req, res, next) => {
    try {
      const q = z
        .object({
          branch_id: z.string().uuid().optional(),
          status: z.enum(ORDER_STATUSES).optional(),
        })
        .safeParse(req.query);
      if (!q.success) throw err.validation(q.error.flatten());

      const canManage = req.user!.permissions.includes("orders.manage");
      const canCreate = req.user!.permissions.includes("orders.create");
      if (!canManage && !canCreate) throw err.forbidden();
      if (q.data.branch_id && !canAccessBranch(req.user!, q.data.branch_id)) throw err.forbidden();

      const rows = await db("orders")
        .where({ account_id: req.user!.accountId })
        .modify((qb) => {
          if (q.data.branch_id) qb.where("branch_id", q.data.branch_id);
          else if (req.user!.branchId && !req.user!.permissions.includes("branches.manage")) {
            qb.where("branch_id", req.user!.branchId);
          }
          if (!canManage) qb.where("created_by", req.user!.id);
          if (q.data.status) qb.where("status", q.data.status);
        })
        .orderBy("created_at", "desc")
        .limit(200);
      res.json({ data: rows });
    } catch (e) {
      next(e);
    }
  });

  // YKMS-02G-E — lightweight POS history for the logged-in cashier's active shift.
  r.get("/current-shift", requirePermission("orders.create"), async (req, res, next) => {
    try {
      const q = z.object({ branch_id: z.string().uuid().optional() }).safeParse(req.query);
      if (!q.success) throw err.validation(q.error.flatten());

      const branchId = q.data.branch_id ?? req.user!.branchId;
      if (!branchId) throw err.validation({ branch_id: "الفرع مطلوب" });
      if (!canAccessBranch(req.user!, branchId)) throw err.forbidden();

      const branch = await db("branches")
        .where({ id: branchId, account_id: req.user!.accountId, is_active: true })
        .first();
      if (!branch) throw err.notFound();

      const shift = await db("shifts")
        .where({
          account_id: req.user!.accountId,
          branch_id: branchId,
          cashier_user_id: req.user!.id,
          status: "open",
        })
        .orderBy("opened_at", "desc")
        .first();

      if (!shift) {
        res.json({ data: { shift: null, orders: [] } });
        return;
      }

      const orders = await db("orders as o")
        .where({
          "o.account_id": req.user!.accountId,
          "o.branch_id": branchId,
          "o.created_by": req.user!.id,
        })
        .where("o.created_at", ">=", shift.opened_at)
        .orderBy("o.created_at", "desc")
        .limit(200)
        .select(
          "o.id",
          "o.order_no",
          "o.order_prefix",
          "o.order_type",
          "o.source_name_snapshot",
          "o.status",
          "o.subtotal",
          "o.discount",
          "o.service_fee",
          "o.vat_amount",
          "o.delivery_fee",
          "o.rounding_adjustment",
          "o.total",
          "o.created_at",
          "o.submitted_at",
          "o.in_kitchen_at",
          "o.ready_at",
          "o.completed_at",
          "o.cancelled_at",
          db.raw("(select coalesce(sum(p.amount), 0) from payments p where p.order_id = o.id) as paid_amount"),
          db.raw("(select coalesce(sum(oi.qty), 0)::int from order_items oi where oi.order_id = o.id) as item_count"),
          db.raw(`(
            select coalesce(json_agg(json_build_object(
              'id', preview.id,
              'name_ar', preview.name_ar,
              'variant_name_ar', preview.variant_name_ar,
              'qty', preview.qty,
              'image_url', preview.image_url
            ) order by preview.created_at), '[]'::json)
            from (
              select oi.id, oi.name_ar, oi.variant_name_ar, oi.qty, oi.created_at, p.image_url
              from order_items oi
              left join products p on p.id = oi.product_id
              where oi.order_id = o.id
              order by oi.created_at
              limit 6
            ) preview
          ) as preview_items`)
        );

      const mapped = orders.map((order: Record<string, unknown>) => {
        const total = Number(order.total ?? 0);
        const paid = Number(order.paid_amount ?? 0);
        const status = String(order.status ?? "draft");
        const paymentStatus = paid <= 0 ? "unpaid" : paid + 0.001 < total ? "partial" : "paid";
        const kitchenStatus =
          status === "submitted" ? "waiting" :
          status === "in_kitchen" ? "preparing" :
          status === "ready" ? "ready" :
          status === "completed" ? "completed" :
          status === "cancelled" ? "cancelled" : "draft";
        return {
          ...order,
          source_name: order.source_name_snapshot ?? "طلب سابق — المصدر غير مسجل",
          payment_status: paymentStatus,
          kitchen_status: kitchenStatus,
        };
      });

      res.json({ data: { shift, orders: mapped } });
    } catch (e) {
      next(e);
    }
  });

  r.get("/:id", async (req, res, next) => {
    try {
      const order = await loadFullOrder(db, req.user!.accountId, req.params.id);
      if (!order) throw err.notFound();
      if (!canReadOrder(req.user!, order)) throw err.forbidden();
      res.json({ data: order });
    } catch (e) {
      next(e);
    }
  });

  // POST / — create order; prices computed server-side
  r.post("/", requirePermission("orders.create"), async (req, res, next) => {
    try {
      const body = createOrderSchema.safeParse(req.body);
      if (!body.success) throw err.validation(body.error.flatten());
      const d = body.data;
      const accountId = req.user!.accountId;
      if (d.payment_method && d.payment_method !== "unpaid" && !req.user!.permissions.includes("payments.record")) {
        throw err.forbidden();
      }

      const branch = await db("branches").where({ id: d.branch_id, account_id: accountId }).first();
      if (!branch) throw err.notFound();
      if (!canAccessBranch(req.user!, branch.id)) throw err.forbidden();

      // YKMS-02E: الإعدادات مصدر الحقيقة التشغيلي
      const settings = await getSettings(db, accountId, branch.id);
      const typeEnabled: Record<string, boolean> = {
        takeaway: settings.order_type_takeaway_enabled && branch.accepts_takeaway !== false,
        delivery: settings.order_type_delivery_enabled && branch.accepts_delivery !== false,
        dine_in: settings.order_type_dine_in_enabled && branch.dine_in_enabled === true,
      };
      if (!typeEnabled[d.order_type]) {
        throw err.validation({ order_type: ar.errors.order_type_disabled });
      }
      if (d.order_type === "delivery") {
        if (settings.require_customer_for_delivery && !d.customer_id) {
          throw err.validation({ customer: ar.errors.delivery_customer_required });
        }
        if (settings.require_address_for_delivery && !d.delivery_address) {
          throw err.validation({ address: ar.errors.delivery_address_required });
        }
        if (settings.min_delivery_order > 0) {
          // يُتحقق بعد حساب subtotal أدناه
        }
      }
      if (d.table_id) {
        const table = await db("dining_tables").where({ id: d.table_id, branch_id: branch.id }).first();
        if (!table) throw err.notFound();
      }
      if (d.customer_id) {
        const customer = await db("customers").where({ id: d.customer_id, account_id: accountId }).first();
        if (!customer) throw err.notFound();
      }

      // Load referenced menu data — all account-scoped
      const productIds = [...new Set(d.items.map((i) => i.product_id))];
      const products = await db("products")
        .whereIn("id", productIds)
        .where({ account_id: accountId, is_active: true });
      if (products.length !== productIds.length) throw err.notFound();
      const overrides = await db("branch_product_prices")
        .where({ branch_id: branch.id })
        .whereIn("product_id", productIds);
      const avail = await db("branch_product_availability")
        .where({ branch_id: branch.id })
        .whereIn("product_id", productIds);
      const variantIds = d.items.map((i) => i.variant_id).filter(Boolean) as string[];
      const variants = variantIds.length
        ? await db("product_variants").whereIn("id", variantIds).where("is_active", true)
        : [];
      const allModIds = [...new Set(d.items.flatMap((i) => i.modifier_ids))];
      const modifiers = allModIds.length
        ? await db("modifiers as m")
            .join("modifier_groups as g", "g.id", "m.modifier_group_id")
            .whereIn("m.id", allModIds)
            .where("g.account_id", accountId)
            .where("m.is_active", true)
            .select("m.*")
        : [];
      if (modifiers.length !== allModIds.length) throw err.notFound();

      // Compute lines
      let subtotal = 0;
      const lines = d.items.map((i) => {
        const p = products.find((x) => x.id === i.product_id)!;
        const a = avail.find((x) => x.product_id === i.product_id);
        if (a && !a.is_available) {
          throw err.validation({ product: `${ar.errors.product_unavailable}: ${p.name_ar}` });
        }
        let variant: { id: string; name_ar: string; price_delta: string | number } | undefined;
        if (i.variant_id) {
          variant = variants.find((v) => v.id === i.variant_id && v.product_id === p.id);
          if (!variant) throw err.notFound();
        }
        const override = overrides.find((x) => x.product_id === p.id)?.price_override;
        const base = override != null ? Number(override) : Number(p.base_price);
        const mods = i.modifier_ids.map((mid) => modifiers.find((m) => m.id === mid)!);
        const unit =
          base + (variant ? Number(variant.price_delta) : 0) + mods.reduce((s, m) => s + Number(m.price_delta), 0);
        const lineTotal = unit * i.qty;
        subtotal += lineTotal;
        return { input: i, product: p, variant, mods, unit, lineTotal };
      });

      // YKMS-02E: قواعد الخصم من الإعدادات
      let discount = settings.allow_discounts ? Math.min(d.discount, subtotal) : 0;
      if (discount > 0) {
        const overAmount = discount > settings.max_discount_without_manager;
        const overPercent = subtotal > 0 && (discount / subtotal) * 100 > settings.max_cashier_discount_percent;
        if (settings.approval_discount_above_limit && (overAmount || overPercent)) {
          if (!req.user!.permissions.includes("orders.discount_above_limit")) {
            throw err.validation({ discount: ar.errors.discount_above_limit });
          }
        }
        if (settings.discount_reason_required && !d.discount_reason) {
          throw err.validation({ discount_reason: ar.errors.discount_reason_required });
        }
      }
      if (d.order_type === "delivery" && settings.min_delivery_order > 0 && subtotal < settings.min_delivery_order) {
        throw err.validation({ min_order: ar.errors.delivery_min_order });
      }
      const { serviceFee, vatAmount, rounding, total } = computeTotals(settings, subtotal, discount, d.delivery_fee);

      let paymentShiftId: string | null = null;
      const paymentId = d.payment_method && d.payment_method !== "unpaid" ? newId() : null;
      if (paymentId) {
        if (!settings.enabled_payment_methods.includes(d.payment_method!)) {
          throw err.validation({ method: ar.errors.payment_method_disabled });
        }
        const activeShift = await db("shifts")
          .where({
            account_id: accountId,
            branch_id: branch.id,
            cashier_user_id: req.user!.id,
            status: "open",
          })
          .first();
        if (d.payment_method === "cash" && settings.require_open_shift_for_cash && !activeShift) {
          throw err.validation({ shift: ar.errors.shift_required_for_cash });
        }
        paymentShiftId = activeShift?.id ?? null;
      }

      const orderId = newId();
      await db.transaction(async (trx) => {
        // YKMS-02E: ترقيم من الإعدادات — يومي أو مستمر، لكل فرع أو للحساب
        const numberScope = settings.branch_specific_numbering
          ? trx("orders").where({ branch_id: branch.id })
          : trx("orders").where({ account_id: accountId });
        if (settings.order_daily_reset) {
          const dayStart = new Date();
          dayStart.setHours(0, 0, 0, 0);
          numberScope.where("created_at", ">=", dayStart);
        }
        const [{ max }] = await numberScope.max("order_no as max");
        const nextNo = max == null ? settings.order_starting_number : Number(max) + 1;
        await trx("orders").insert({
          id: orderId,
          account_id: accountId,
          branch_id: branch.id,
          order_no: nextNo,
          order_prefix: orderPrefix(settings, d.order_type),
          vat_amount: vatAmount,
          service_fee: serviceFee,
          rounding_adjustment: rounding,
          discount_reason: d.discount_reason ?? null,
          order_type: d.order_type,
          status: "draft",
          table_id: d.table_id ?? null,
          customer_id: d.customer_id ?? null,
          delivery_address: d.delivery_address ?? null,
          delivery_fee: d.delivery_fee,
          subtotal,
          discount,
          total,
          notes: d.notes ?? null,
          created_by: req.user!.id,
        });
        for (const line of lines) {
          const itemId = newId();
          await trx("order_items").insert({
            id: itemId,
            order_id: orderId,
            product_id: line.product.id,
            variant_id: line.variant?.id ?? null,
            name_ar: line.product.name_ar,
            variant_name_ar: line.variant?.name_ar ?? null,
            qty: line.input.qty,
            unit_price: line.unit,
            line_total: line.lineTotal,
            notes: line.input.notes ?? null,
          });
          if (line.mods.length) {
            await trx("order_item_modifiers").insert(
              line.mods.map((m) => ({
                id: newId(),
                order_item_id: itemId,
                modifier_id: m.id,
                name_ar: m.name_ar,
                price_delta: m.price_delta,
              }))
            );
          }
        }
        await trx("order_status_history").insert({
          id: newId(),
          order_id: orderId,
          from_status: null,
          to_status: "draft",
          changed_by: req.user!.id,
        });
        if (paymentId) {
          await trx("payments").insert({
            id: paymentId,
            order_id: orderId,
            branch_id: branch.id,
            method: d.payment_method,
            amount: total,
            received_by: req.user!.id,
            shift_id: paymentShiftId,
          });
        }
      });

      const created = (await db("orders").where({ id: orderId }).first())!;
      if (d.submit) {
        await setStatus(db, created, "submitted", req.user!.id);
        // YKMS-02E: تذكرة مطبخ تلقائية عند الإرسال (لو مفعلة وفيه طابعة مطبخ)
        if (settings.auto_print_on_kitchen_send && settings.kitchen_printer_enabled) {
          try {
            const kEndpoint = await db("hardware_endpoints")
              .where({ branch_id: branch.id, kind: "kitchen_printer", is_active: true })
              .first();
            if (kEndpoint) {
              const full = await loadFullOrder(db, accountId, orderId);
              await db("print_jobs").insert({
                id: newId(),
                branch_id: branch.id,
                endpoint_id: kEndpoint.id,
                device_id: kEndpoint.device_id ?? null,
                type: "kitchen_ticket",
                payload: JSON.stringify(renderKitchenTicketPayload(full!, settings.paper_width_mm)),
                status: "pending",
                created_by: req.user!.id,
              });
            }
          } catch {
            // فشل الطباعة لا يوقف الطلب — NFR-002
          }
        }
      }

      await writeAudit(db, {
        accountId,
        branchId: branch.id,
        userId: req.user!.id,
        action: "order.create",
        entityType: "order",
        entityId: orderId,
        meta: { order_no: created.order_no, order_type: d.order_type, total },
        ip: req.ip,
      });
      if (paymentId) {
        await writeAudit(db, {
          accountId,
          branchId: branch.id,
          userId: req.user!.id,
          action: "payment.record",
          entityType: "payment",
          entityId: paymentId,
          meta: { order_no: created.order_no, method: d.payment_method, amount: total },
          ip: req.ip,
        });
      }
      res.status(201).json({ data: await loadFullOrder(db, accountId, orderId), message: ar.messages.created });
    } catch (e) {
      next(e);
    }
  });

  // PATCH /:id/status
  r.patch("/:id/status", requirePermission("orders.manage"), async (req, res, next) => {
    try {
      const body = z
        .object({ status: z.enum(ORDER_STATUSES), cancel_reason: z.string().optional() })
        .safeParse(req.body);
      if (!body.success) throw err.validation(body.error.flatten());
      const order = await db("orders").where({ id: req.params.id, account_id: req.user!.accountId }).first();
      if (!order) throw err.notFound();
      if (!canAccessBranch(req.user!, order.branch_id)) throw err.forbidden();
      // YKMS-02E: إلغاء الطلب قد يتطلب صلاحية مدير حسب الإعدادات
      if (body.data.status === "cancelled") {
        const settings = await getSettings(db, req.user!.accountId, order.branch_id);
        if (!settings.allow_order_cancel) throw err.validation({ status: ar.errors.order_cancel_disabled });
        if (settings.approval_cancel_order && !req.user!.permissions.includes("orders.cancel")) {
          throw err.forbidden();
        }
      }
      await setStatus(db, order, body.data.status, req.user!.id, body.data.cancel_reason);
      await writeAudit(db, {
        accountId: req.user!.accountId,
        branchId: order.branch_id,
        userId: req.user!.id,
        action: `order.${body.data.status}`,
        entityType: "order",
        entityId: order.id,
        meta: body.data.cancel_reason ? { reason: body.data.cancel_reason } : {},
        ip: req.ip,
      });
      res.json({ data: await loadFullOrder(db, req.user!.accountId, order.id), message: ar.messages.updated });
    } catch (e) {
      next(e);
    }
  });

  // POST /:id/payments
  r.post("/:id/payments", requirePermission("payments.record"), async (req, res, next) => {
    try {
      const body = z
        .object({ method: z.enum(["cash", "card", "wallet", "unpaid"]), amount: z.number().nonnegative() })
        .safeParse(req.body);
      if (!body.success) throw err.validation(body.error.flatten());
      const order = await db("orders").where({ id: req.params.id, account_id: req.user!.accountId }).first();
      if (!order) throw err.notFound();
      if (!canAccessBranch(req.user!, order.branch_id)) throw err.forbidden();
      if (order.status === "cancelled") throw err.validation({ status: ar.errors.bad_status_transition });
      // YKMS-02C: الإعدادات تتحكم في طرق الدفع وشرط الشيفت للنقدي
      const settings = await getSettings(db, req.user!.accountId, order.branch_id);
      if (!settings.enabled_payment_methods.includes(body.data.method)) {
        throw err.validation({ method: ar.errors.payment_method_disabled });
      }
      let shiftId: string | null = null;
      if (body.data.method !== "unpaid") {
        const shift = await db("shifts")
          .where({ account_id: req.user!.accountId, branch_id: order.branch_id, cashier_user_id: req.user!.id, status: "open" })
          .first();
        // Cash operation may require an open cashier shift depending on settings. Card/wallet also attach when a shift exists.
        if (body.data.method === "cash" && settings.require_open_shift_for_cash && !shift) {
          throw err.validation({ shift: ar.errors.shift_required_for_cash });
        }
        shiftId = shift?.id ?? null;
      }
      const id = newId();
      await db("payments").insert({
        id,
        order_id: order.id,
        branch_id: order.branch_id,
        method: body.data.method,
        amount: body.data.amount,
        received_by: req.user!.id,
        shift_id: shiftId,
      });
      // YKMS-02E: طباعة تلقائية عند الدفع (لو مفعلة) — الفشل لا يوقف الدفع
      if (settings.auto_print_on_payment && settings.receipt_printing_enabled && body.data.method !== "unpaid") {
        try {
          const endpoint = await db("hardware_endpoints")
            .where({ branch_id: order.branch_id, kind: "receipt_printer", is_active: true })
            .first();
          if (endpoint) {
            const full = await loadFullOrder(db, req.user!.accountId, order.id);
            await db("print_jobs").insert({
              id: newId(),
              branch_id: order.branch_id,
              endpoint_id: endpoint.id,
              device_id: endpoint.device_id ?? null,
              type: "receipt",
              payload: JSON.stringify(
                renderReceiptPayload(full!, {
                  footer: settings.receipt_footer,
                  paperWidthMm: settings.paper_width_mm,
                  copies: settings.receipt_copies,
                  taxDisplay: settings.receipt_tax_display,
                })
              ),
              status: "pending",
              created_by: req.user!.id,
            });
          }
        } catch {
          /* NFR-002 */
        }
      }
      await writeAudit(db, {
        accountId: req.user!.accountId,
        branchId: order.branch_id,
        userId: req.user!.id,
        action: "payment.record",
        entityType: "payment",
        entityId: id,
        meta: { order_no: order.order_no, method: body.data.method, amount: body.data.amount },
        ip: req.ip,
      });
      res.status(201).json({ data: await db("payments").where({ id }).first(), message: ar.messages.created });
    } catch (e) {
      next(e);
    }
  });

  // POST /:id/print — queue receipt on the branch receipt printer (NFR-002: never blocks)
  r.post("/:id/print", requirePermission("print_jobs.create"), async (req, res, next) => {
    try {
      const body = z.object({ endpoint_id: z.string().uuid().optional() }).safeParse(req.body ?? {});
      if (!body.success) throw err.validation(body.error.flatten());
      const order = await loadFullOrder(db, req.user!.accountId, req.params.id);
      if (!order) throw err.notFound();
      if (!canAccessBranch(req.user!, order.branch_id)) throw err.forbidden();
      const settings = await getSettings(db, req.user!.accountId, order.branch_id);
      if (!settings.receipt_printing_enabled) {
        throw err.validation({ printing: ar.errors.receipt_printing_disabled });
      }
      const endpoint = body.data.endpoint_id
        ? await db("hardware_endpoints as h")
            .join("branches as b", "b.id", "h.branch_id")
            .where("h.id", body.data.endpoint_id)
            .where("b.account_id", req.user!.accountId)
            .select("h.*")
            .first()
        : await db("hardware_endpoints")
            .where({ branch_id: order.branch_id, kind: "receipt_printer", is_active: true })
            .first();
      if (!endpoint) throw err.validation({ endpoint: ar.errors.no_receipt_printer });
      const id = newId();
      await db("print_jobs").insert({
        id,
        branch_id: order.branch_id,
        endpoint_id: endpoint.id,
        device_id: endpoint.device_id ?? null,
        type: "receipt",
        payload: JSON.stringify(
          renderReceiptPayload(order, {
            footer: settings.receipt_footer,
            paperWidthMm: settings.paper_width_mm,
            copies: settings.receipt_copies,
            taxDisplay: settings.receipt_tax_display,
          })
        ),
        status: "pending",
        created_by: req.user!.id,
      });
      await writeAudit(db, {
        accountId: req.user!.accountId,
        branchId: order.branch_id,
        userId: req.user!.id,
        action: "order.print_receipt",
        entityType: "print_job",
        entityId: id,
        meta: { order_no: order.order_no },
        ip: req.ip,
      });
      res.status(201).json({ data: await db("print_jobs").where({ id }).first(), message: ar.messages.print_job_queued });
    } catch (e) {
      next(e);
    }
  });

  // YKMS-02E: تعيين سائق لطلب دليفري — صلاحية delivery.assign
  r.post("/:id/assign-driver", requirePermission("delivery.assign"), async (req, res, next) => {
    try {
      const body = z.object({ driver_id: z.string().uuid().nullable() }).safeParse(req.body);
      if (!body.success) throw err.validation(body.error.flatten());
      const order = await db("orders").where({ id: req.params.id, account_id: req.user!.accountId }).first();
      if (!order) throw err.notFound();
      if (!canAccessBranch(req.user!, order.branch_id)) throw err.forbidden();
      if (order.order_type !== "delivery") throw err.validation({ order_type: ar.errors.order_type_disabled });
      if (body.data.driver_id) {
        const driver = await db("drivers")
          .where({ id: body.data.driver_id, account_id: req.user!.accountId })
          .first();
        if (!driver) throw err.notFound();
        if (!driver.is_active) throw err.validation({ driver: ar.errors.driver_inactive });
      }
      await db("orders").where({ id: order.id }).update({ driver_id: body.data.driver_id, updated_at: db.fn.now() });
      await writeAudit(db, {
        accountId: req.user!.accountId,
        branchId: order.branch_id,
        userId: req.user!.id,
        action: "order.assign_driver",
        entityType: "order",
        entityId: order.id,
        meta: { driver_id: body.data.driver_id },
        ip: req.ip,
      });
      res.json({ data: await loadFullOrder(db, req.user!.accountId, order.id), message: ar.messages.updated });
    } catch (e) {
      next(e);
    }
  });

  return r;
}

/** Kitchen routes — /kitchen/orders */
export function kitchenRoutes(db: Knex): Router {
  const r = Router();
  r.use(requireUser(db));

  r.get("/orders", requirePermission("kitchen.view"), async (req, res, next) => {
    try {
      const q = z.object({ branch_id: z.string().uuid().optional() }).safeParse(req.query);
      if (!q.success) throw err.validation(q.error.flatten());
      const orders = await db("orders")
        .where({ account_id: req.user!.accountId })
        .whereIn("status", ["submitted", "in_kitchen", "ready"])
        .modify((qb) => {
          if (q.data.branch_id) qb.where("branch_id", q.data.branch_id);
        })
        .orderBy("submitted_at", "asc");
      const ids = orders.map((o: { id: string }) => o.id);
      const items = ids.length
        ? await db("order_items as i")
            .leftJoin("products as p", "p.id", "i.product_id")
            .leftJoin("prep_stations as ps", "ps.id", "p.prep_station_id")
            .leftJoin("categories as c", "c.id", "p.category_id")
            .leftJoin("prep_stations as cps", "cps.id", "c.default_prep_station_id")
            .whereIn("i.order_id", ids)
            .select(
              "i.*",
              db.raw("coalesce(ps.name_ar, cps.name_ar) as prep_station_ar"),
              db.raw(
                "case when p.prep_time_minutes > 0 then p.prep_time_minutes else c.default_prep_time_minutes end as prep_time_minutes"
              )
            )
        : [];
      const mods = items.length
        ? await db("order_item_modifiers").whereIn("order_item_id", items.map((i) => i.id))
        : [];
      res.json({
        data: orders.map((o: Record<string, unknown> & { id: string }) => ({
          ...o,
          items: items
            .filter((i) => i.order_id === o.id)
            .map((i) => ({ ...i, modifiers: mods.filter((m) => m.order_item_id === i.id) })),
        })),
      });
    } catch (e) {
      next(e);
    }
  });

  // YKMS-02G — مؤشرات المطبخ الحقيقية: زمن التحضير من الطوابع (submitted→ready)
  // لطلبات اليوم المكتملة، وليس مدة جلوس الطلبات المفتوحة (تصحيح متوسط 1189د).
  r.get("/metrics", requirePermission("kitchen.view"), async (req, res, next) => {
    try {
      const q = z.object({ branch_id: z.string().uuid().optional() }).safeParse(req.query);
      if (!q.success) throw err.validation(q.error.flatten());
      const dayStart = new Date();
      dayStart.setHours(0, 0, 0, 0);

      const completed = await db("orders")
        .where({ account_id: req.user!.accountId })
        .whereNotNull("submitted_at")
        .whereNotNull("ready_at")
        .where("ready_at", ">=", dayStart)
        .modify((qb) => {
          if (q.data.branch_id) qb.where("branch_id", q.data.branch_id);
        })
        .select("submitted_at", "ready_at");

      // دقائق التحضير الفعلية لكل طلب (submitted→ready)، مع تجاهل السالب/الشاذ.
      const durations = completed
        .map((o: { ready_at: unknown; submitted_at: unknown }) => (new Date(o.ready_at as string).getTime() - new Date(o.submitted_at as string).getTime()) / 60000)
        .filter((m: number) => m >= 0 && m < 24 * 60) // استبعاد >24س كبيانات شاذة
        .sort((a: number, b: number) => a - b);

      const open = await db("orders")
        .where({ account_id: req.user!.accountId })
        .whereIn("status", ["submitted", "in_kitchen", "ready"])
        .modify((qb) => {
          if (q.data.branch_id) qb.where("branch_id", q.data.branch_id);
        })
        .select("status");

      const settings = await getSettings(db, req.user!.accountId, q.data.branch_id ?? null);
      const lateMin = settings.kds_late_minutes;

      const avg = durations.length ? durations.reduce((s: number, m: number) => s + m, 0) / durations.length : null;
      const median = durations.length ? durations[Math.floor(durations.length / 2)] : null;
      const withinSla = durations.filter((m: number) => m <= lateMin).length;

      res.json({
        data: {
          completed_today: durations.length,
          avg_prep_minutes: avg == null ? null : Math.round(avg * 10) / 10,
          median_prep_minutes: median == null ? null : Math.round(median * 10) / 10,
          within_sla: withinSla,
          late_completed: durations.length - withinSla,
          currently_preparing: open.filter((o: { status: string }) => o.status === "in_kitchen").length,
          ready_waiting: open.filter((o: { status: string }) => o.status === "ready").length,
          submitted_waiting: open.filter((o: { status: string }) => o.status === "submitted").length,
          sla_late_minutes: lateMin,
        },
      });
    } catch (e) {
      next(e);
    }
  });

  r.patch("/orders/:id/status", requirePermission("kitchen.update"), async (req, res, next) => {
    try {
      const body = z.object({ status: z.enum(["in_kitchen", "ready", "completed"]) }).safeParse(req.body);
      if (!body.success) throw err.validation(body.error.flatten());
      const order = await db("orders").where({ id: req.params.id, account_id: req.user!.accountId }).first();
      if (!order) throw err.notFound();
      await setStatus(db, order, body.data.status, req.user!.id);
      res.json({ data: await db("orders").where({ id: order.id }).first(), message: ar.messages.updated });
    } catch (e) {
      next(e);
    }
  });

  return r;
}
