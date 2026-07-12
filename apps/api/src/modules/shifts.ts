import { Router } from "express";
import { z } from "zod";
import { Knex } from "knex";
import { err } from "../lib/errors";
import { newId } from "../lib/ids";
import { writeAudit } from "../lib/audit";
import { canAccessBranch, requirePermission, requireUser } from "../middleware/auth";
import { ar } from "../i18n/ar";

function cashAmount(v: unknown): number {
  return Number(v ?? 0);
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
  const expectedCash = cashAmount(shift.opening_cash) + cashAmount(cashPayments.total) + cashAmount(cashIn.total) - cashAmount(cashOut.total);
  return {
    ...shift,
    totals: {
      cash_sales: cashAmount(cashPayments.total),
      card_sales: cashAmount(cardPayments.total),
      wallet_sales: cashAmount(walletPayments.total),
      cash_in: cashAmount(cashIn.total),
      cash_out: cashAmount(cashOut.total),
      expected_cash: expectedCash,
      orders_count: Number(orders.c ?? 0),
    },
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
      await db("shift_cash_movements").insert({ id: newId(), shift_id: shift.id, type: "cash_in", amount: body.data.amount, reason: body.data.reason, created_by: req.user!.id });
      await writeAudit(db, { accountId: req.user!.accountId, branchId: shift.branch_id, userId: req.user!.id, action: "shift.cash_in", entityType: "shift", entityId: shift.id, meta: body.data, ip: req.ip });
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
      await db("shift_cash_movements").insert({ id: newId(), shift_id: shift.id, type: "cash_out", amount: body.data.amount, reason: body.data.reason, created_by: req.user!.id });
      await writeAudit(db, { accountId: req.user!.accountId, branchId: shift.branch_id, userId: req.user!.id, action: "shift.cash_out", entityType: "shift", entityId: shift.id, meta: body.data, ip: req.ip });
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
      await db("shifts").where({ id: summary.id }).update({ status: "closed", closed_at: db.fn.now(), actual_cash: body.data.actual_cash, closing_cash: body.data.actual_cash, expected_cash: summary.totals.expected_cash, notes: body.data.notes ?? summary.notes, updated_at: db.fn.now() });
      await writeAudit(db, { accountId: req.user!.accountId, branchId: summary.branch_id, userId: req.user!.id, action: "shift.close", entityType: "shift", entityId: summary.id, meta: { actual_cash: body.data.actual_cash, expected_cash: summary.totals.expected_cash }, ip: req.ip });
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
