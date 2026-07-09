import { Router } from "express";
import { z } from "zod";
import { Knex } from "knex";
import { err } from "../lib/errors";
import { newId } from "../lib/ids";
import { writeAudit } from "../lib/audit";
import { requirePermission, requireUser } from "../middleware/auth";
import { ar } from "../i18n/ar";
import { renderReceiptPayload } from "../lib/receipt";

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
  notes: z.string().optional().nullable(),
  submit: z.boolean().default(true), // POS submits immediately by default
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
  const items = await db("order_items").where({ order_id: order.id }).orderBy("created_at", "asc");
  const mods = items.length
    ? await db("order_item_modifiers").whereIn("order_item_id", items.map((i) => i.id))
    : [];
  const payments = await db("payments").where({ order_id: order.id }).orderBy("created_at", "asc");
  const branch = await db("branches").where({ id: order.branch_id }).first();
  const table = order.table_id ? await db("dining_tables").where({ id: order.table_id }).first() : null;
  const customer = order.customer_id ? await db("customers").where({ id: order.customer_id }).first() : null;
  return {
    ...order,
    branch_name: branch?.name ?? "",
    table_name_ar: table?.name_ar ?? null,
    customer_name: customer?.name ?? null,
    customer_phone: customer?.phone ?? null,
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
  if (to === "completed") patch.completed_at = db.fn.now();
  if (to === "cancelled" && cancelReason) patch.cancel_reason = cancelReason;
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
      const rows = await db("orders")
        .where({ account_id: req.user!.accountId })
        .modify((qb) => {
          if (q.data.branch_id) qb.where("branch_id", q.data.branch_id);
          if (q.data.status) qb.where("status", q.data.status);
        })
        .orderBy("created_at", "desc")
        .limit(200);
      res.json({ data: rows });
    } catch (e) {
      next(e);
    }
  });

  r.get("/:id", async (req, res, next) => {
    try {
      const order = await loadFullOrder(db, req.user!.accountId, req.params.id);
      if (!order) throw err.notFound();
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

      const branch = await db("branches").where({ id: d.branch_id, account_id: accountId }).first();
      if (!branch) throw err.notFound();
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

      const discount = Math.min(d.discount, subtotal);
      const total = subtotal - discount + d.delivery_fee;

      const orderId = newId();
      await db.transaction(async (trx) => {
        const [{ max }] = await trx("orders").where({ branch_id: branch.id }).max("order_no as max");
        await trx("orders").insert({
          id: orderId,
          account_id: accountId,
          branch_id: branch.id,
          order_no: Number(max ?? 0) + 1,
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
      });

      const created = (await db("orders").where({ id: orderId }).first())!;
      if (d.submit) await setStatus(db, created, "submitted", req.user!.id);

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
      if (order.status === "cancelled") throw err.validation({ status: ar.errors.bad_status_transition });
      let shiftId: string | null = null;
      if (body.data.method !== "unpaid") {
        const shift = await db("shifts")
          .where({ account_id: req.user!.accountId, branch_id: order.branch_id, cashier_user_id: req.user!.id, status: "open" })
          .first();
        // Cash operation must be attached to an open cashier shift. Card/wallet also attach when the current cashier has a shift.
        if (body.data.method === "cash" && !shift) throw err.validation({ shift: "لا يمكن تسجيل دفع نقدي بدون شيفت مفتوح للكاشير." });
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
        payload: JSON.stringify(renderReceiptPayload(order)),
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
      const items = ids.length ? await db("order_items").whereIn("order_id", ids) : [];
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
