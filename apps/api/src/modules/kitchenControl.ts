import { Router } from "express";
import { Knex } from "knex";
import { z } from "zod";
import { ApiError, err } from "../lib/errors";
import { newId } from "../lib/ids";
import { writeAudit } from "../lib/audit";
import { canAccessBranch, requirePermission, requireUser } from "../middleware/auth";
import { ar } from "../i18n/ar";

/**
 * ADR-005 — Kitchen Pause & Order Hold.
 * Branch pause gates NEW final submissions only (existing board work keeps
 * flowing); order hold is a durable operational overlay on in_kitchen orders
 * that blocks the ->ready transition and pauses SLA time. All writes lock the
 * relevant row (FOR UPDATE), replay on the stored idempotency key, and audit
 * inside the same transaction.
 */

export const HOLD_REASONS = ["equipment_issue", "ingredient_shortage", "customer_request", "quality_check", "other"] as const;

const idem = z.string().trim().min(8).max(180);

const pauseSchema = z.object({
  branch_id: z.string().uuid(),
  reason: z.string().trim().min(3).max(300),
  idempotency_key: idem,
});
const resumeSchema = z.object({ branch_id: z.string().uuid(), idempotency_key: idem });
const holdSchema = z
  .object({
    reason_code: z.enum(HOLD_REASONS),
    reason_note: z.string().trim().min(1).max(500).optional(),
    idempotency_key: idem,
  })
  .refine((v) => v.reason_code !== "other" || !!v.reason_note, {
    message: "سبب «أخرى» يتطلب توضيحًا نصيًا",
    path: ["reason_note"],
  });
const holdResumeSchema = z.object({ idempotency_key: idem });

interface BranchStateRow {
  id: string;
  is_paused: boolean;
  paused_at: string | null;
  pause_reason: string | null;
  paused_by: string | null;
  version: number;
  last_pause_key: string | null;
  last_resume_key: string | null;
}

async function ownBranch(db: Knex, accountId: string, branchId: string) {
  return db("branches").where({ id: branchId, account_id: accountId }).first();
}

/** Read-only helper used by the submission guard and the state endpoint. */
export async function getKitchenState(db: Knex, accountId: string, branchId: string): Promise<{ is_paused: boolean; paused_at: string | null; pause_reason: string | null; paused_by: string | null }> {
  const row = await db("kitchen_branch_states")
    .where({ account_id: accountId, branch_id: branchId })
    .first();
  return row && row.is_paused
    ? { is_paused: true, paused_at: row.paused_at, pause_reason: row.pause_reason, paused_by: row.paused_by }
    : { is_paused: false, paused_at: null, pause_reason: null, paused_by: null };
}

/** Active hold for an order (or null). Lock inside a trx by passing trx. */
export async function getActiveHold(db: Knex, accountId: string, orderId: string, forUpdate = false) {
  const q = db("kitchen_order_holds").where({ account_id: accountId, order_id: orderId }).whereNull("resumed_at").first();
  return forUpdate ? q.forUpdate() : q;
}

/** Sum of CLOSED hold seconds + active hold row, for SLA display. */
export async function holdSummaryForOrders(db: Knex, accountId: string, orderIds: string[]) {
  if (!orderIds.length) return new Map<string, { held_total_seconds: number; active_hold: null | Record<string, unknown> }>();
  const rows = await db("kitchen_order_holds as h")
    .leftJoin("users as u", "u.id", "h.held_by")
    .where("h.account_id", accountId)
    .whereIn("h.order_id", orderIds)
    .select(
      "h.order_id",
      "h.reason_code",
      "h.reason_note",
      "h.held_at",
      "h.resumed_at",
      db.raw("coalesce(u.name, '') as held_by_name"),
      db.raw("extract(epoch from (coalesce(h.resumed_at, now()) - h.held_at)) as seconds")
    );
  const map = new Map<string, { held_total_seconds: number; active_hold: null | Record<string, unknown> }>();
  for (const id of orderIds) map.set(id, { held_total_seconds: 0, active_hold: null });
  for (const r of rows) {
    const entry = map.get(r.order_id)!;
    if (r.resumed_at) {
      entry.held_total_seconds += Math.max(0, Math.round(Number(r.seconds)));
    } else {
      entry.active_hold = {
        reason_code: r.reason_code,
        reason_note: r.reason_note,
        held_at: r.held_at,
        held_by_name: r.held_by_name,
      };
    }
  }
  return map;
}

export function kitchenControlRoutes(db: Knex): Router {
  const r = Router();
  r.use(requireUser(db));

  // GET /kitchen/state?branch_id=
  r.get("/state", requirePermission("kitchen.view"), async (req, res, next) => {
    try {
      const q = z.object({ branch_id: z.string().uuid() }).safeParse(req.query);
      if (!q.success) throw err.validation(q.error.flatten());
      const branch = await ownBranch(db, req.user!.accountId, q.data.branch_id);
      if (!branch) throw err.notFound();
      if (!canAccessBranch(req.user!, branch.id)) throw err.forbidden();
      const state = await getKitchenState(db, req.user!.accountId, branch.id);
      let pausedByName: string | null = null;
      if (state.paused_by) {
        const u = await db("users").where({ id: state.paused_by }).first();
        pausedByName = u?.name ?? null;
      }
      res.json({ data: { ...state, paused_by_name: pausedByName } });
    } catch (e) {
      next(e);
    }
  });

  // POST /kitchen/pause
  r.post("/pause", requirePermission("kitchen.manage"), async (req, res, next) => {
    try {
      const body = pauseSchema.safeParse(req.body);
      if (!body.success) throw err.validation(body.error.flatten());
      const branch = await ownBranch(db, req.user!.accountId, body.data.branch_id);
      if (!branch) throw err.notFound();
      if (!canAccessBranch(req.user!, branch.id)) throw err.forbidden();

      const outcome = await db.transaction(async (trx) => {
        let row = (await trx("kitchen_branch_states")
          .where({ account_id: req.user!.accountId, branch_id: branch.id })
          .forUpdate()
          .first()) as BranchStateRow | undefined;
        if (!row) {
          // Lazy create, then re-lock (unique key makes concurrent creates safe).
          await trx("kitchen_branch_states")
            .insert({ id: newId(), account_id: req.user!.accountId, branch_id: branch.id })
            .onConflict(["account_id", "branch_id"])
            .ignore();
          row = (await trx("kitchen_branch_states")
            .where({ account_id: req.user!.accountId, branch_id: branch.id })
            .forUpdate()
            .first()) as BranchStateRow;
        }
        if (row.is_paused) {
          if (row.last_pause_key === body.data.idempotency_key) return { replay: true, row };
          throw new ApiError(409, "kitchen_already_paused");
        }
        await trx("kitchen_branch_states").where({ id: row.id }).update({
          is_paused: true,
          paused_at: trx.fn.now(),
          paused_by: req.user!.id,
          pause_reason: body.data.reason,
          resumed_at: null,
          resumed_by: null,
          version: row.version + 1,
          last_pause_key: body.data.idempotency_key,
          updated_at: trx.fn.now(),
        });
        await writeAudit(trx, {
          accountId: req.user!.accountId,
          branchId: branch.id,
          userId: req.user!.id,
          action: "kitchen.paused",
          entityType: "kitchen_branch_state",
          entityId: row.id,
          meta: { reason: body.data.reason, previous: "active", next: "paused", request_id: (req as { requestId?: string }).requestId ?? null },
          ip: req.ip,
        });
        return { replay: false, row };
      });

      const state = await getKitchenState(db, req.user!.accountId, branch.id);
      res.status(outcome.replay ? 200 : 201).json({ data: { ...state, idempotent_replay: outcome.replay } });
    } catch (e) {
      next(e);
    }
  });

  // POST /kitchen/resume
  r.post("/resume", requirePermission("kitchen.manage"), async (req, res, next) => {
    try {
      const body = resumeSchema.safeParse(req.body);
      if (!body.success) throw err.validation(body.error.flatten());
      const branch = await ownBranch(db, req.user!.accountId, body.data.branch_id);
      if (!branch) throw err.notFound();
      if (!canAccessBranch(req.user!, branch.id)) throw err.forbidden();

      const outcome = await db.transaction(async (trx) => {
        const row = (await trx("kitchen_branch_states")
          .where({ account_id: req.user!.accountId, branch_id: branch.id })
          .forUpdate()
          .first()) as BranchStateRow | undefined;
        if (!row || !row.is_paused) {
          if (row?.last_resume_key === body.data.idempotency_key) return { replay: true };
          throw new ApiError(409, "kitchen_not_paused");
        }
        await trx("kitchen_branch_states").where({ id: row.id }).update({
          is_paused: false,
          resumed_at: trx.fn.now(),
          resumed_by: req.user!.id,
          version: row.version + 1,
          last_resume_key: body.data.idempotency_key,
          updated_at: trx.fn.now(),
        });
        await writeAudit(trx, {
          accountId: req.user!.accountId,
          branchId: branch.id,
          userId: req.user!.id,
          action: "kitchen.resumed",
          entityType: "kitchen_branch_state",
          entityId: row.id,
          meta: { previous: "paused", next: "active", request_id: (req as { requestId?: string }).requestId ?? null },
          ip: req.ip,
        });
        return { replay: false };
      });

      const state = await getKitchenState(db, req.user!.accountId, branch.id);
      res.status(outcome.replay ? 200 : 201).json({ data: { ...state, idempotent_replay: outcome.replay } });
    } catch (e) {
      next(e);
    }
  });

  // POST /kitchen/orders/:orderId/hold
  r.post("/orders/:orderId/hold", requirePermission("kitchen.update"), async (req, res, next) => {
    try {
      const body = holdSchema.safeParse(req.body);
      if (!body.success) throw err.validation(body.error.flatten());

      const outcome = await db.transaction(async (trx) => {
        const order = await trx("orders")
          .where({ id: req.params.orderId, account_id: req.user!.accountId })
          .forUpdate()
          .first();
        if (!order) throw err.notFound();
        if (!canAccessBranch(req.user!, order.branch_id)) throw err.forbidden();

        const active = await getActiveHold(trx, req.user!.accountId, order.id, true);
        if (active) {
          if (active.hold_key === body.data.idempotency_key) return { replay: true, hold: active };
          throw new ApiError(409, "order_already_held");
        }
        if (order.status !== "in_kitchen") throw new ApiError(409, "order_hold_invalid_state");

        const hold = {
          id: newId(),
          account_id: req.user!.accountId,
          branch_id: order.branch_id,
          order_id: order.id,
          reason_code: body.data.reason_code,
          reason_note: body.data.reason_note ?? null,
          held_by: req.user!.id,
          hold_key: body.data.idempotency_key,
        };
        await trx("kitchen_order_holds").insert(hold);
        await writeAudit(trx, {
          accountId: req.user!.accountId,
          branchId: order.branch_id,
          userId: req.user!.id,
          action: "kitchen.order_held",
          entityType: "order",
          entityId: order.id,
          meta: {
            reason_code: body.data.reason_code,
            reason_note: body.data.reason_note ?? null,
            previous: "in_kitchen",
            next: "in_kitchen+held",
            request_id: (req as { requestId?: string }).requestId ?? null,
          },
          ip: req.ip,
        });
        return { replay: false, hold: await trx("kitchen_order_holds").where({ id: hold.id }).first() };
      });

      res.status(outcome.replay ? 200 : 201).json({ data: { ...outcome.hold, idempotent_replay: outcome.replay } });
    } catch (e) {
      next(e);
    }
  });

  // POST /kitchen/orders/:orderId/hold-resume
  r.post("/orders/:orderId/hold-resume", requirePermission("kitchen.update"), async (req, res, next) => {
    try {
      const body = holdResumeSchema.safeParse(req.body);
      if (!body.success) throw err.validation(body.error.flatten());

      const outcome = await db.transaction(async (trx) => {
        const order = await trx("orders")
          .where({ id: req.params.orderId, account_id: req.user!.accountId })
          .forUpdate()
          .first();
        if (!order) throw err.notFound();
        if (!canAccessBranch(req.user!, order.branch_id)) throw err.forbidden();

        const active = await getActiveHold(trx, req.user!.accountId, order.id, true);
        if (!active) {
          const replayed = await trx("kitchen_order_holds")
            .where({ account_id: req.user!.accountId, order_id: order.id, resume_key: body.data.idempotency_key })
            .first();
          if (replayed) return { replay: true, hold: replayed };
          throw new ApiError(409, "order_not_held");
        }
        await trx("kitchen_order_holds").where({ id: active.id }).update({
          resumed_at: trx.fn.now(),
          resumed_by: req.user!.id,
          resume_key: body.data.idempotency_key,
        });
        await writeAudit(trx, {
          accountId: req.user!.accountId,
          branchId: order.branch_id,
          userId: req.user!.id,
          action: "kitchen.order_resumed",
          entityType: "order",
          entityId: order.id,
          meta: { previous: "in_kitchen+held", next: "in_kitchen", request_id: (req as { requestId?: string }).requestId ?? null },
          ip: req.ip,
        });
        return { replay: false, hold: await trx("kitchen_order_holds").where({ id: active.id }).first() };
      });

      res.status(outcome.replay ? 200 : 201).json({ data: { ...outcome.hold, idempotent_replay: outcome.replay } });
    } catch (e) {
      next(e);
    }
  });

  return r;
}

/** Submission guard — call before creating a final order. Audits the block. */
export async function assertKitchenAcceptsOrders(
  db: Knex,
  ctx: { accountId: string; branchId: string; userId: string; ip?: string | null; requestId?: string | null }
): Promise<void> {
  const state = await getKitchenState(db, ctx.accountId, ctx.branchId);
  if (!state.is_paused) return;
  await writeAudit(db, {
    accountId: ctx.accountId,
    branchId: ctx.branchId,
    userId: ctx.userId,
    action: "kitchen.transition_blocked_by_pause",
    entityType: "kitchen_branch_state",
    meta: { reason: state.pause_reason, request_id: ctx.requestId ?? null },
    ip: ctx.ip,
  });
  throw new ApiError(409, "kitchen_paused");
}

/** ->ready guard — call inside the status transition path (same trx). */
export async function assertNotHeldForReady(
  db: Knex,
  ctx: { accountId: string; order: { id: string; branch_id: string }; userId: string | null; ip?: string | null }
): Promise<void> {
  const active = await getActiveHold(db, ctx.accountId, ctx.order.id);
  if (!active) return;
  await writeAudit(db, {
    accountId: ctx.accountId,
    branchId: ctx.order.branch_id,
    userId: ctx.userId,
    action: "kitchen.transition_blocked_by_hold",
    entityType: "order",
    entityId: ctx.order.id,
    meta: { reason_code: active.reason_code, blocked_transition: "in_kitchen->ready" },
    ip: ctx.ip,
  });
  throw new ApiError(409, "order_on_hold");
}
