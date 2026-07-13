import { Router } from "express";
import { z } from "zod";
import { Knex } from "knex";
import { config } from "../config";
import { err } from "../lib/errors";
import { newId } from "../lib/ids";
import { writeAudit } from "../lib/audit";
import { requirePermission, requireUser } from "../middleware/auth";
import { ar } from "../i18n/ar";

const createJobSchema = z.object({
  endpoint_id: z.string().uuid(),
  type: z.enum(["receipt", "kitchen_ticket", "test"]),
  payload: z.record(z.unknown()).default({}),
});

export function printJobRoutes(db: Knex): Router {
  const r = Router();
  r.use(requireUser(db));

  r.get("/", requirePermission("print_jobs.manage"), async (req, res, next) => {
    try {
      const rows = await db("print_jobs as p")
        .join("branches as b", "b.id", "p.branch_id")
        .where("b.account_id", req.user!.accountId)
        .select("p.*")
        .orderBy("p.created_at", "desc")
        .limit(200);
      res.json({ data: rows });
    } catch (e) {
      next(e);
    }
  });

  /**
   * Explicit recovery sweep for bridge crashes.
   * Jobs below the retry cap return to pending; exhausted jobs become terminal `dead`.
   */
  r.post("/requeue-stuck", requirePermission("print_jobs.manage"), async (req, res, next) => {
    try {
      const result = await db.transaction(async (trx) => {
        const requeued = await trx.raw(
          `
            update print_jobs p
               set status = 'pending',
                   updated_at = now()
             where p.status = 'printing'
               and p.attempts < ?
               and p.updated_at < now() - (? * interval '1 minute')
               and p.branch_id in (
                 select b.id from branches b where b.account_id = ?
               )
            returning p.id;
          `,
          [config.maxPrintAttempts, config.printStuckMinutes, req.user!.accountId]
        );

        const dead = await trx.raw(
          `
            update print_jobs p
               set status = 'dead',
                   updated_at = now()
             where p.status = 'printing'
               and p.attempts >= ?
               and p.updated_at < now() - (? * interval '1 minute')
               and p.branch_id in (
                 select b.id from branches b where b.account_id = ?
               )
            returning p.id;
          `,
          [config.maxPrintAttempts, config.printStuckMinutes, req.user!.accountId]
        );

        return {
          requeuedIds: (requeued.rows as Array<{ id: string }>).map((row) => row.id),
          deadIds: (dead.rows as Array<{ id: string }>).map((row) => row.id),
        };
      });

      await writeAudit(db, {
        accountId: req.user!.accountId,
        userId: req.user!.id,
        action: "print_job.requeue_stuck",
        entityType: "print_job",
        meta: {
          threshold_minutes: config.printStuckMinutes,
          max_attempts: config.maxPrintAttempts,
          requeued_count: result.requeuedIds.length,
          dead_count: result.deadIds.length,
        },
        ip: req.ip,
      });

      res.json({
        data: {
          requeued_count: result.requeuedIds.length,
          dead_count: result.deadIds.length,
          requeued_ids: result.requeuedIds,
          dead_ids: result.deadIds,
        },
      });
    } catch (e) {
      next(e);
    }
  });

  // FR-071: create Print Job (status=pending). NFR-002: printing never blocks order flow.
  r.post("/", requirePermission("print_jobs.create"), async (req, res, next) => {
    try {
      const body = createJobSchema.safeParse(req.body);
      if (!body.success) throw err.validation(body.error.flatten());
      const endpoint = await db("hardware_endpoints as h")
        .join("branches as b", "b.id", "h.branch_id")
        .where("h.id", body.data.endpoint_id)
        .where("b.account_id", req.user!.accountId)
        .select("h.*")
        .first();
      if (!endpoint) throw err.notFound();
      const id = newId();
      await db("print_jobs").insert({
        id,
        branch_id: endpoint.branch_id,
        endpoint_id: endpoint.id,
        device_id: endpoint.device_id ?? null,
        type: body.data.type,
        payload: JSON.stringify(body.data.payload),
        status: "pending",
        created_by: req.user!.id,
      });
      await writeAudit(db, {
        accountId: req.user!.accountId,
        branchId: endpoint.branch_id,
        deviceId: endpoint.device_id,
        userId: req.user!.id,
        action: "print_job.create",
        entityType: "print_job",
        entityId: id,
        meta: { type: body.data.type, endpoint: endpoint.name },
        ip: req.ip,
      });
      res.status(201).json({
        data: await db("print_jobs").where({ id }).first(),
        message: ar.messages.print_job_queued,
      });
    } catch (e) {
      next(e);
    }
  });

  return r;
}
