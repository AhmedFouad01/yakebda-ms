import { Router } from "express";
import { z } from "zod";
import { Knex } from "knex";
import { err } from "../lib/errors";
import { newId } from "../lib/ids";
import { writeAudit } from "../lib/audit";
import { canAccessBranch, requirePermission, requireUser } from "../middleware/auth";
import { ar } from "../i18n/ar";
import { enqueueFinancialEvent } from "./financialOutbox";

interface ShiftOrderRow {
  id: string;
  order_no: number;
  order_prefix: string | null;
  status: string;
  total: unknown;
  paid_amount: unknown;
  created_at: Date | string;
}

function toMinorUnits(value: unknown): number {
  const normalized = typeof value === "string" ? value.trim() : String(value ?? 0);
  if (!/^-?\d+(\.\d+)?$/.test(normalized)) return 0;
  const negative = normalized.startsWith("-");
  const unsigned = negative ? normalized.slice(1) : normalized;
  const [whole, fraction = ""] = unsigned.split(".");
  const minor = Number(whole) * 100 + Number((fraction + "00").slice(0, 2));
  return negative ? -minor : minor;
}

function money(value: unknown): number {
  return toMinorUnits(value) / 100;
}

async function summarizeShift(db: Knex, shiftId: string) {
  const shift = await db("shifts").where({ id: shiftId }).first();
  if (!shift) return null;
  const [cashPayments] = await db("payments").where({ shift_id: shiftId, method: "cash" }).sum("amount as total");
  const [cardPayments] = await db("payments").where({ shift_id: shiftId, method: "card" }).sum("amount as total");
  const [walletPayments] = await db("payments").where({ shift_id: shiftId, method: "wallet" }).sum("amount as total");
  const [cashIn] = await db("shift_cash_movements").where({ shift_id: shiftId, type: "cash_in" }).sum("amount as total");
  const [cashOut] = await db("shift_cash_movements").where({ shift_id: shiftId, type: "cash_out" }).sum("amount as total");
  const [orders] = await db("payments").where({ shift_id: shiftId }).countDistinct("order_id as c");

  const expectedMinor =
    toMinorUnits(shift.opening_cash) +
    toMinorUnits(cashPayments.total) +
    toMinorUnits(cashIn.total) -
    toMinorUnits(cashOut.total);

  const shiftOrders: ShiftOrderRow[] = await db("orders as o")
    .where({
      "o.account_id": shift.account_id,
      "o.branch_id": shift.branch_id,
      "o.created_by": shift.cashier_user_id,
    })
    .where("o.created_at", ">=", shift.opened_at)
    .modify((query) => {
      if (shift.closed_at) query.where("o.created_at", "<=", shift.closed_at);
    })
    .select(
      "o.id",
      "o.order_no",
      "o.order_prefix",
      "o.status",
      "o.total",
      "o.created_at",
      db.raw("(select coalesce(sum(p.amount), 0) from payments p where p.order_id = o.id and p.method <> 'unpaid') as paid_amount")
    )
    .orderBy("o.created_at", "asc");

  const unsettledOrders = shiftOrders
    .filter((order) => {
      if (order.status === "cancelled") return false;
      const nonTerminal = order.status !== "completed";
      const unpaid = toMinorUnits(order.paid_amount) < toMinorUnits(order.total);
      return nonTerminal || unpaid;
    })
    .map((order) => ({
      id: order.id,
      order_no: order.order_no,
      order_prefix: order.order_prefix,
      status: order.status,
      total: money(order.total),
      paid_amount: money(order.paid_amount),
      remaining_amount: Math.max(0, money(toMinorUnits(order.total) - toMinorUnits(order.paid_amount))),
      created_at: order.created_at,
    }));

  return {
    ...shift,
    variance: shift.variance == null ? null : money(shift.variance),
    over_short: shift.over_short ?? null,
    totals: {
      cash_sales: money(cashPayments.total),
      card_sales: money(cardPayments.total),
      wallet_sales: money(walletPayments.total),
      cash_in: money(cashIn.total),
      cash_out: money(cashOut.total),
      expected_cash: expectedMinor / 100,
      orders_count: Number(orders.c ?? 0),
    },
    unsettled_orders: unsettledOrders,
    warnings: unsettledOrders.length
      ? [{ code: "unsettled_orders", message: ar.warnings.unsettled_orders, count: unsettledOrders.length }]
      : [],
  };
}

export function shiftRoutes(db: Knex): Router {
  const r = Router();
  r.use(requireUser(db));

  r.get("/current", async (req, res, next) => {
    try {
      const q = z.object({ branch_id: z.string().uuid().optional() }).safeParse(req.query);
      if (!q.success) throw err.validation(q.error.flatten());
      if (q.data.branch_id && !canAccessBranch(req.user!, q.data.branch_id)) throw err.forbidden();
      const row = await db("shifts")
        .where({ account_id: req.user!.accountId, cashier_user_id: req.user!.id, status: "open" })
        .modify((qb) => {
          if (q.data.branch_id) qb.where("branch_id", q.data.branch_id);
          if (!q.data.branch_id && req.user!.branchId) qb.where("branch_id", req.user!.branchId);
        })
        .orderBy("opened_at", "desc")
        .first();
      res.json({ data: row ? await summarizeShift(db, row.id) : null });
    } catch (e) {
      next(e);
    }
  });

  r.post("/open", requirePermission("shifts.manage"), async (req, res, next) => {
    try {
      const body = z.object({ branch_id: z.string().uuid(), opening_cash: z.number().nonnegative().default(0), notes: z.string().optional().nullable() }).safeParse(req.body);
      if (!body.success) throw err.validation(body.error.flatten());
      if (!canAccessBranch(req.user!, body.data.branch_id)) throw err.forbidden();
      const branch = await db("branches").where({ id: body.data.branch_id, account_id: req.user!.accountId, is_active: true }).first();
      if (!branch) throw err.notFound();
      const open = await db("shifts").where({ account_id: req.user!.accountId, branch_id: branch.id, cashier_user_id: req.user!.id, status: "open" }).first();
      if (open) return res.json({ data: await summarizeShift(db, open.id), message: "يوجد شيفت مفتوح بالفعل." });
      const id = newId();
      await db("shifts").insert({ id, account_id: req.user!.accountId, branch_id: branch.id, cashier_user_id: req.user!.id, opening_cash: body.data.opening_cash, notes: body.data.notes ?? null });
      await writeAudit(db, { accountId: req.user!.accountId, branchId: branch.id, userId: req.user!.id, action: "shift.open", entityType: "shift", entityId: id, meta: { opening_cash: body.data.opening_cash }, ip: req.ip });
      res.status(201).json({ data: await summarizeShift(db, id), message: ar.messages.created });
    } catch (e) {
      next(e);
    }
  });

  r.post("/:id/cash-in", requirePermission("shifts.manage"), async (req, res, next) => {
    try {
      const body = z.object({ amount: z.number().positive(), reason: z.string().min(1) }).safeParse(req.body);
      if (!body.success) throw err.validation(body.error.flatten());
      const shift = await db("shifts").where({ id: req.params.id, account_id: req.user!.accountId, status: "open" }).first();
      if (!shift) throw err.notFound();
      if (!canAccessBranch(req.user!, shift.branch_id)) throw err.forbidden();
      const movementId = newId();
      await db.transaction(async (trx) => {
        await trx("shift_cash_movements").insert({ id: movementId, shift_id: shift.id, type: "cash_in", amount: body.data.amount, reason: body.data.reason, created_by: req.user!.id });
        await enqueueFinancialEvent(trx, {
          accountId: req.user!.accountId,
          branchId: shift.branch_id,
          sourceType: "shift_cash_movement",
          sourceId: movementId,
          eventType: "cash.movement",
          idempotencyKey: `shift-cash:${movementId}:v1`,
          payload: { version: 1, movement_id: movementId, shift_id: shift.id, type: "cash_in", amount: body.data.amount, reason: body.data.reason },
        });
        await writeAudit(trx, { accountId: req.user!.accountId, branchId: shift.branch_id, userId: req.user!.id, action: "shift.cash_in", entityType: "shift", entityId: shift.id, meta: body.data, ip: req.ip });
      });
      res.json({ data: await summarizeShift(db, shift.id), message: ar.messages.updated });
    } catch (e) {
      next(e);
    }
  });

  r.post("/:id/cash-out", requirePermission("shifts.manage"), async (req, res, next) => {
    try {
      const body = z.object({ amount: z.number().positive(), reason: z.string().min(1) }).safeParse(req.body);
      if (!body.success) throw err.validation(body.error.flatten());
      const shift = await db("shifts").where({ id: req.params.id, account_id: req.user!.accountId, status: "open" }).first();
      if (!shift) throw err.notFound();
      if (!canAccessBranch(req.user!, shift.branch_id)) throw err.forbidden();
      const movementId = newId();
      await db.transaction(async (trx) => {
        await trx("shift_cash_movements").insert({ id: movementId, shift_id: shift.id, type: "cash_out", amount: body.data.amount, reason: body.data.reason, created_by: req.user!.id });
        await enqueueFinancialEvent(trx, {
          accountId: req.user!.accountId,
          branchId: shift.branch_id,
          sourceType: "shift_cash_movement",
          sourceId: movementId,
          eventType: "cash.movement",
          idempotencyKey: `shift-cash:${movementId}:v1`,
          payload: { version: 1, movement_id: movementId, shift_id: shift.id, type: "cash_out", amount: body.data.amount, reason: body.data.reason },
        });
        await writeAudit(trx, { accountId: req.user!.accountId, branchId: shift.branch_id, userId: req.user!.id, action: "shift.cash_out", entityType: "shift", entityId: shift.id, meta: body.data, ip: req.ip });
      });
      res.json({ data: await summarizeShift(db, shift.id), message: ar.messages.updated });
    } catch (e) {
      next(e);
    }
  });

  r.post("/:id/close", requirePermission("shifts.manage"), async (req, res, next) => {
    try {
      const body = z.object({ actual_cash: z.number().nonnegative(), notes: z.string().optional().nullable() }).safeParse(req.body);
      if (!body.success) throw err.validation(body.error.flatten());
      const summary = await summarizeShift(db, req.params.id);
      if (!summary || summary.account_id !== req.user!.accountId || summary.status !== "open") throw err.notFound();
      if (!canAccessBranch(req.user!, summary.branch_id)) throw err.forbidden();

      const actualMinor = toMinorUnits(body.data.actual_cash);
      const expectedMinor = toMinorUnits(summary.totals.expected_cash);
      const varianceMinor = actualMinor - expectedMinor;
      const overShort = varianceMinor > 0 ? "over" : varianceMinor < 0 ? "short" : "even";

      await db("shifts").where({ id: summary.id }).update({
        status: "closed",
        closed_at: db.fn.now(),
        actual_cash: actualMinor / 100,
        closing_cash: actualMinor / 100,
        expected_cash: expectedMinor / 100,
        variance: varianceMinor / 100,
        over_short: overShort,
        notes: body.data.notes ?? summary.notes,
        updated_at: db.fn.now(),
      });
      await writeAudit(db, {
        accountId: req.user!.accountId,
        branchId: summary.branch_id,
        userId: req.user!.id,
        action: "shift.close",
        entityType: "shift",
        entityId: summary.id,
        meta: {
          actual_cash: actualMinor / 100,
          expected_cash: expectedMinor / 100,
          variance: varianceMinor / 100,
          over_short: overShort,
          unsettled_order_ids: summary.unsettled_orders.map((order: { id: string }) => order.id),
        },
        ip: req.ip,
      });
      res.json({ data: await summarizeShift(db, summary.id), message: ar.messages.updated });
    } catch (e) {
      next(e);
    }
  });

  r.get("/:id/summary", requirePermission("shifts.manage"), async (req, res, next) => {
    try {
      const summary = await summarizeShift(db, req.params.id);
      if (!summary || summary.account_id !== req.user!.accountId) throw err.notFound();
      if (!canAccessBranch(req.user!, summary.branch_id)) throw err.forbidden();
      res.json({ data: summary });
    } catch (e) {
      next(e);
    }
  });

  return r;
}
