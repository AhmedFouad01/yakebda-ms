import { Router } from "express";
import { Knex } from "knex";
import { z } from "zod";
import { writeAudit } from "../lib/audit";
import { err } from "../lib/errors";
import { canAccessBranch, requirePermission, requireUser } from "../middleware/auth";
import { createCursorPage, parseCursorPage, type CursorDefinition } from "../lib/cursor";

export const FINANCIAL_EVENT_STATUSES = [
  "pending",
  "processing",
  "posted",
  "failed",
  "dead",
  "pending_policy",
  "deferred_rounding",
  "non_posting",
  "reconciled",
] as const;

const dateInput = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const createdAtCursorValues = z.object({
  created_at: z.string().datetime(),
  id: z.string().uuid(),
}).strict();

type CreatedAtCursorValues = z.infer<typeof createdAtCursorValues>;

const financialEventsCursor: CursorDefinition<CreatedAtCursorValues> = {
  endpoint: "accounting.financial-events",
  sort: "created_at_desc_id_desc",
  values: createdAtCursorValues,
};

function cursorTimestamp(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function applyCreatedAtCursor(qb: Knex.QueryBuilder, cursor: CreatedAtCursorValues | null): void {
  if (!cursor) return;
  qb.where((page) => {
    page
      .where("created_at", "<", cursor.created_at)
      .orWhere((tie) => tie.where("created_at", cursor.created_at).andWhere("id", "<", cursor.id));
  });
}

interface FinancialEventDetailRow {
  id: string;
  account_id: string;
  branch_id: string | null;
  source_type: string;
  source_id: string;
  status: string;
}

async function loadSourceLineage(
  db: Knex,
  event: FinancialEventDetailRow
): Promise<Record<string, unknown> | null> {
  if (event.source_type === "payment") {
    const payment = await db("payments as payment")
      .join("orders as order", "order.id", "payment.order_id")
      .where({ "payment.id": event.source_id, "order.account_id": event.account_id })
      .select(
        "payment.id",
        "payment.order_id",
        "payment.method",
        "payment.amount",
        "payment.kind",
        "payment.reversal_of_payment_id",
        "payment.shift_id",
        "payment.created_at",
        "order.order_no",
        "order.status as order_status"
      )
      .first();
    return payment ? { kind: "payment", payment } : null;
  }
  if (event.source_type === "stock_movement") {
    const movement = await db("stock_movements")
      .where({ id: event.source_id, account_id: event.account_id })
      .first();
    return movement ? { kind: "stock_movement", stock_movement: movement } : null;
  }
  if (event.source_type === "shift_cash_movement") {
    const movement = await db("shift_cash_movements as movement")
      .join("shifts as shift", "shift.id", "movement.shift_id")
      .where({ "movement.id": event.source_id, "shift.account_id": event.account_id })
      .select("movement.*", "shift.branch_id as shift_branch_id", "shift.status as shift_status")
      .first();
    return movement ? { kind: "shift_cash_movement", shift_cash_movement: movement } : null;
  }
  return null;
}

export function financialEventRoutes(db: Knex): Router {
  const router = Router();
  router.use(requireUser(db));

  router.get("/financial-events", requirePermission("accounting.view"), async (req, res, next) => {
    try {
      const parsed = z.object({
        status: z.enum(FINANCIAL_EVENT_STATUSES).optional(),
        event_type: z.string().trim().min(1).max(80).optional(),
        branch_id: z.string().uuid().optional(),
        date_from: dateInput.optional(),
        date_to: dateInput.optional(),
        cursor: z.string().optional(),
        limit: z.string().optional(),
      }).safeParse(req.query);
      if (!parsed.success) throw err.validation(parsed.error.flatten());
      const branchId = parsed.data.branch_id ?? req.user!.branchId ?? undefined;
      if (branchId && !canAccessBranch(req.user!, branchId)) throw err.forbidden();
      const page = parseCursorPage(req.query, financialEventsCursor);
      const rows = await db("financial_events")
        .where({ account_id: req.user!.accountId })
        .modify((qb) => {
          if (branchId) qb.where("branch_id", branchId);
          if (parsed.data.status) qb.where("status", parsed.data.status);
          if (parsed.data.event_type) qb.where("event_type", parsed.data.event_type);
          if (parsed.data.date_from) qb.where("created_at", ">=", db.raw("?::date", [parsed.data.date_from]));
          if (parsed.data.date_to) qb.where("created_at", "<", db.raw("?::date + interval '1 day'", [parsed.data.date_to]));
          applyCreatedAtCursor(qb, page.cursor);
        })
        .orderBy([{ column: "created_at", order: "desc" }, { column: "id", order: "desc" }])
        .limit(page.limit + 1);
      res.json(createCursorPage(rows, page.limit, financialEventsCursor, (row: { id: string; created_at: string | Date }) => ({
        created_at: cursorTimestamp(row.created_at),
        id: row.id,
      })));
    } catch (error) {
      next(error);
    }
  });

  // Literal route registered before /financial-events/:id (project rule).
  router.get("/financial-events/summary", requirePermission("accounting.view"), async (req, res, next) => {
    try {
      const parsed = z.object({ branch_id: z.string().uuid().optional() }).safeParse(req.query);
      if (!parsed.success) throw err.validation(parsed.error.flatten());
      const branchId = parsed.data.branch_id ?? req.user!.branchId ?? undefined;
      if (branchId && !canAccessBranch(req.user!, branchId)) throw err.forbidden();
      const rows = await db("financial_events")
        .where({ account_id: req.user!.accountId })
        .modify((qb) => {
          if (branchId) qb.where("branch_id", branchId);
        })
        .groupBy("status")
        .select("status")
        .count({ count: "*" });
      res.json({ data: rows });
    } catch (error) {
      next(error);
    }
  });

  router.get("/financial-events/:id", requirePermission("accounting.view"), async (req, res, next) => {
    try {
      if (!z.string().uuid().safeParse(req.params.id).success) throw err.notFound();
      const event = await db("financial_events")
        .where({ id: req.params.id, account_id: req.user!.accountId })
        .first();
      if (!event) throw err.notFound();
      if (event.branch_id && !canAccessBranch(req.user!, event.branch_id)) throw err.forbidden();
      const journalEntry = await db("journal_entries")
        .where({ financial_event_id: event.id, account_id: req.user!.accountId })
        .select("id", "entry_date", "event_type", "description", "reversal_of_entry_id", "posted_at")
        .first();
      const reconciliation = await db("financial_event_reconciliations")
        .where({ financial_event_id: event.id, account_id: req.user!.accountId })
        .first();
      res.json({
        data: {
          ...event,
          journal_entry: journalEntry ?? null,
          reconciliation: reconciliation ?? null,
          source: await loadSourceLineage(db, event),
        },
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/financial-events/:id/retry", requirePermission("accounting.manage"), async (req, res, next) => {
    try {
      const event = await db("financial_events").where({ id: req.params.id, account_id: req.user!.accountId }).first();
      if (!event) throw err.notFound();
      if (event.branch_id && !canAccessBranch(req.user!, event.branch_id)) throw err.forbidden();
      if (!new Set(["failed", "dead"]).has(event.status)) throw err.conflict();
      await db("financial_events").where({ id: event.id }).update({
        status: "pending",
        next_attempt_at: null,
        claimed_by: null,
        claimed_at: null,
        updated_at: db.fn.now(),
      });
      await writeAudit(db, {
        accountId: req.user!.accountId,
        branchId: event.branch_id,
        userId: req.user!.id,
        action: "accounting.event.retry",
        entityType: "financial_event",
        entityId: event.id,
        meta: { previous_status: event.status },
        ip: req.ip,
      });
      res.json({ data: await db("financial_events").where({ id: event.id }).first() });
    } catch (error) {
      next(error);
    }
  });

  router.post("/financial-events/:id/mark-dead", requirePermission("accounting.manage"), async (req, res, next) => {
    try {
      const body = z.object({ reason: z.string().trim().min(3).max(500) }).safeParse(req.body ?? {});
      if (!body.success) throw err.validation(body.error.flatten());
      const event = await db("financial_events").where({ id: req.params.id, account_id: req.user!.accountId }).first();
      if (!event) throw err.notFound();
      if (event.branch_id && !canAccessBranch(req.user!, event.branch_id)) throw err.forbidden();
      if (!new Set(["pending", "failed"]).has(event.status)) throw err.conflict();
      await db("financial_events").where({ id: event.id }).update({
        status: "dead",
        last_error: body.data.reason.slice(0, 500),
        next_attempt_at: null,
        claimed_by: null,
        claimed_at: null,
        updated_at: db.fn.now(),
      });
      await writeAudit(db, {
        accountId: req.user!.accountId,
        branchId: event.branch_id,
        userId: req.user!.id,
        action: "accounting.event.mark_dead",
        entityType: "financial_event",
        entityId: event.id,
        meta: { previous_status: event.status, reason: body.data.reason },
        ip: req.ip,
      });
      res.json({ data: await db("financial_events").where({ id: event.id }).first() });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
