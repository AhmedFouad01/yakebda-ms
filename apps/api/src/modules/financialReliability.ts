import { NextFunction, Request, Response, Router } from "express";
import { z } from "zod";
import { Knex } from "knex";
import { err } from "../lib/errors";
import { newId } from "../lib/ids";
import { writeAudit } from "../lib/audit";
import { canAccessBranch, requirePermission, requireUser } from "../middleware/auth";
import { ar } from "../i18n/ar";
import { getSettings } from "./settings";
import { loadFullOrder } from "./orders";

type PaymentRow = {
  id: string;
  order_id: string;
  branch_id: string;
  method: string;
  amount: string | number;
  shift_id: string | null;
};

type RefundAllocation = {
  original_payment_id: string;
  refund_payment_id: string;
  method: string;
  amount: number;
  shift_id: string | null;
};

const CANCEL_FROM_STATUSES = new Set(["draft", "submitted", "in_kitchen", "ready"]);

function toMinorUnits(value: unknown): number {
  const normalized = typeof value === "string" ? value.trim() : String(value ?? 0);
  if (!/^-?\d+(\.\d+)?$/.test(normalized)) return 0;
  const negative = normalized.startsWith("-");
  const unsigned = negative ? normalized.slice(1) : normalized;
  const [whole, fraction = ""] = unsigned.split(".");
  const minor = Number(whole) * 100 + Number((fraction + "00").slice(0, 2));
  return negative ? -minor : minor;
}

function fromMinorUnits(value: number): number {
  return Math.round(value) / 100;
}

async function netPaidMinor(db: Knex, orderId: string): Promise<number> {
  const row = await db("payments")
    .where({ order_id: orderId })
    .whereNot("method", "unpaid")
    .sum("amount as total")
    .first();
  return toMinorUnits(row?.total);
}

async function createRefundRows(
  trx: Knex.Transaction,
  order: { id: string; branch_id: string; order_no: number },
  amountMinor: number,
  reason: string,
  userId: string,
  auditContext: { accountId: string; ip?: string | null; action: string }
): Promise<RefundAllocation[]> {
  const netPaid = await netPaidMinor(trx, order.id);
  if (amountMinor <= 0) throw err.validation({ amount: ar.errors.refund_amount_positive });
  if (amountMinor > netPaid) throw err.validation({ amount: ar.errors.refund_exceeds_paid });

  const originals = (await trx("payments")
    .where({ order_id: order.id })
    .whereNot("method", "unpaid")
    .where("amount", ">", 0)
    .orderBy("created_at", "desc")) as PaymentRow[];

  let remaining = amountMinor;
  const allocations: RefundAllocation[] = [];

  for (const original of originals) {
    if (remaining <= 0) break;
    const refundedRow = await trx("payments")
      .where({ reversal_of_payment_id: original.id, kind: "refund" })
      .sum("amount as total")
      .first();
    const refundable = Math.max(0, toMinorUnits(original.amount) + toMinorUnits(refundedRow?.total));
    if (refundable <= 0) continue;

    const allocated = Math.min(refundable, remaining);
    const refundId = newId();
    await trx("payments").insert({
      id: refundId,
      order_id: order.id,
      branch_id: order.branch_id,
      method: original.method,
      amount: -fromMinorUnits(allocated),
      received_by: userId,
      shift_id: original.shift_id ?? null,
      kind: "refund",
      reason,
      reversal_of_payment_id: original.id,
    });
    allocations.push({
      original_payment_id: original.id,
      refund_payment_id: refundId,
      method: original.method,
      amount: fromMinorUnits(allocated),
      shift_id: original.shift_id ?? null,
    });
    remaining -= allocated;
  }

  if (remaining > 0) throw err.validation({ amount: ar.errors.refund_exceeds_paid });

  await writeAudit(trx, {
    accountId: auditContext.accountId,
    branchId: order.branch_id,
    userId,
    action: auditContext.action,
    entityType: "order",
    entityId: order.id,
    meta: {
      order_no: order.order_no,
      amount: fromMinorUnits(amountMinor),
      reason,
      allocations,
    },
    ip: auditContext.ip,
  });

  return allocations;
}

async function handleCancellation(
  db: Knex,
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (req.body?.status !== "cancelled") {
    next();
    return;
  }

  try {
    const body = z.object({ status: z.literal("cancelled"), cancel_reason: z.string().trim().min(1).optional() }).safeParse(req.body);
    if (!body.success) throw err.validation(body.error.flatten());

    const order = await db("orders").where({ id: req.params.id, account_id: req.user!.accountId }).first();
    if (!order) throw err.notFound();
    if (!canAccessBranch(req.user!, order.branch_id)) throw err.forbidden();
    if (!CANCEL_FROM_STATUSES.has(order.status)) throw err.validation({ status: ar.errors.bad_status_transition });

    const settings = await getSettings(db, req.user!.accountId, order.branch_id);
    if (!settings.allow_order_cancel) throw err.validation({ status: ar.errors.order_cancel_disabled });
    if (settings.approval_cancel_order && !req.user!.permissions.includes("orders.cancel")) throw err.forbidden();

    await db.transaction(async (trx) => {
      const lockedOrder = await trx("orders")
        .where({ id: order.id, account_id: req.user!.accountId })
        .forUpdate()
        .first();
      if (!lockedOrder) throw err.notFound();
      if (!CANCEL_FROM_STATUSES.has(lockedOrder.status)) throw err.validation({ status: ar.errors.bad_status_transition });

      const paidMinor = await netPaidMinor(trx, lockedOrder.id);
      if (paidMinor > 0) {
        if (settings.approval_refund && !req.user!.permissions.includes("orders.refund")) throw err.forbidden();
        await createRefundRows(
          trx,
          lockedOrder,
          paidMinor,
          body.data.cancel_reason ?? "إلغاء الطلب",
          req.user!.id,
          { accountId: req.user!.accountId, ip: req.ip, action: "payment.refund_on_cancel" }
        );
      }

      await trx("orders").where({ id: lockedOrder.id }).update({
        status: "cancelled",
        cancelled_at: trx.fn.now(),
        cancel_reason: body.data.cancel_reason ?? null,
        updated_at: trx.fn.now(),
      });
      await trx("order_status_history").insert({
        id: newId(),
        order_id: lockedOrder.id,
        from_status: lockedOrder.status,
        to_status: "cancelled",
        changed_by: req.user!.id,
      });
      if (lockedOrder.table_id) {
        await trx("dining_tables")
          .where({ id: lockedOrder.table_id })
          .update({ status: "cleaning", updated_at: trx.fn.now() });
      }
      await writeAudit(trx, {
        accountId: req.user!.accountId,
        branchId: lockedOrder.branch_id,
        userId: req.user!.id,
        action: "order.cancelled",
        entityType: "order",
        entityId: lockedOrder.id,
        meta: {
          reason: body.data.cancel_reason ?? null,
          auto_refunded: paidMinor > 0,
          refund_amount: fromMinorUnits(paidMinor),
        },
        ip: req.ip,
      });
    });

    res.json({ data: await loadFullOrder(db, req.user!.accountId, order.id), message: ar.messages.updated });
  } catch (error) {
    next(error);
  }
}

export function financialReliabilityRoutes(db: Knex): Router {
  const router = Router();

  router.post(
    "/:id/refund",
    requireUser(db),
    requirePermission("payments.record"),
    async (req, res, next) => {
      try {
        const body = z.object({ amount: z.number().positive(), reason: z.string().trim().min(1) }).safeParse(req.body);
        if (!body.success) throw err.validation(body.error.flatten());

        const order = await db("orders").where({ id: req.params.id, account_id: req.user!.accountId }).first();
        if (!order) throw err.notFound();
        if (!canAccessBranch(req.user!, order.branch_id)) throw err.forbidden();

        const settings = await getSettings(db, req.user!.accountId, order.branch_id);
        if (settings.approval_refund && !req.user!.permissions.includes("orders.refund")) throw err.forbidden();

        const allocations = await db.transaction((trx) =>
          createRefundRows(
            trx,
            order,
            toMinorUnits(body.data.amount),
            body.data.reason,
            req.user!.id,
            { accountId: req.user!.accountId, ip: req.ip, action: "payment.refund" }
          )
        );

        res.status(201).json({
          data: {
            order: await loadFullOrder(db, req.user!.accountId, order.id),
            refund_amount: body.data.amount,
            allocations,
          },
          message: ar.messages.refund_created,
        });
      } catch (error) {
        next(error);
      }
    }
  );

  router.patch(
    "/:id/status",
    requireUser(db),
    requirePermission("orders.manage"),
    (req, res, next) => void handleCancellation(db, req, res, next)
  );

  return router;
}
