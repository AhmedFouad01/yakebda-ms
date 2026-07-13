import { Router } from "express";
import { z } from "zod";
import { Knex } from "knex";
import { config } from "../config";
import { err } from "../lib/errors";
import { writeAudit } from "../lib/audit";
import { requireApiToken } from "../middleware/auth";

/**
 * Local Device Bridge API — YKMS-01H (FR-072).
 * The Windows bridge authenticates with an API token that has the "bridge" scope.
 * Transport model: polling now, upgradeable to WebSocket later without changing payloads.
 *
 * Tenant isolation (security hardening):
 * every route resolves entities THROUGH the authenticated client's account_id.
 * A bridge token can never see or update devices, endpoints, or print jobs
 * belonging to another account.
 */
export function bridgeRoutes(db: Knex): Router {
  const r = Router();
  r.use(requireApiToken(db, "bridge"));

  /** Resolve a device only if it belongs to the token's account. */
  async function ownDevice(req: { apiClient?: { accountId: string } }, deviceId: string) {
    return db("devices")
      .where({ id: deviceId, account_id: req.apiClient!.accountId })
      .first();
  }

  // Bridge health check + device/endpoint heartbeats (FR-076)
  r.post("/heartbeat", async (req, res, next) => {
    try {
      const body = z
        .object({
          device_id: z.string().uuid(),
          endpoints: z
            .array(z.object({ id: z.string().uuid(), status: z.enum(["online", "offline"]) }))
            .default([]),
        })
        .safeParse(req.body);
      if (!body.success) throw err.validation(body.error.flatten());

      const device = await ownDevice(req, body.data.device_id);
      if (!device) throw err.notFound();

      await db("devices")
        .where({ id: device.id })
        .update({ status: "online", last_seen_at: db.fn.now() });

      for (const ep of body.data.endpoints) {
        // Endpoint must live in a branch of the same account.
        await db("hardware_endpoints")
          .where("hardware_endpoints.id", ep.id)
          .whereIn(
            "hardware_endpoints.branch_id",
            db("branches").select("id").where("account_id", req.apiClient!.accountId)
          )
          .update({ last_seen_at: db.fn.now(), is_active: ep.status === "online" });
      }
      res.json({ ok: true });
    } catch (e) {
      next(e);
    }
  });

  // Atomically claim pending print jobs for the endpoints hosted on this bridge device.
  r.get("/print-jobs", async (req, res, next) => {
    try {
      const q = z.object({ device_id: z.string().uuid() }).safeParse(req.query);
      if (!q.success) throw err.validation(q.error.flatten());

      const device = await ownDevice(req, q.data.device_id);
      if (!device) throw err.notFound();

      const jobs = await db.transaction(async (trx) => {
        const result = await trx.raw(
          `
            with claimable as (
              select p.id
                from print_jobs p
                join branches b on b.id = p.branch_id
               where b.account_id = ?
                 and p.device_id = ?
                 and p.status = 'pending'
                 and p.attempts < ?
               order by p.created_at asc, p.id asc
               limit 20
               for update of p skip locked
            )
            update print_jobs p
               set status = 'printing',
                   attempts = p.attempts + 1,
                   error = null,
                   updated_at = now()
              from claimable c
             where p.id = c.id
            returning p.*;
          `,
          [req.apiClient!.accountId, device.id, config.maxPrintAttempts]
        );
        return (result.rows as Array<Record<string, unknown>>).sort(
          (a, b) => new Date(String(a.created_at)).getTime() - new Date(String(b.created_at)).getTime()
        );
      });

      res.json({ data: jobs });
    } catch (e) {
      next(e);
    }
  });

  // Report print result (printed | failed). Failed jobs return to pending until the retry budget is exhausted.
  r.post("/print-jobs/:id/result", async (req, res, next) => {
    try {
      const body = z
        .object({ status: z.enum(["printed", "failed"]), error: z.string().optional() })
        .safeParse(req.body);
      if (!body.success) throw err.validation(body.error.flatten());

      // The job must belong to the token's account (via its branch),
      // and to a device of that account when device_id is set.
      const job = await db("print_jobs as p")
        .join("branches as b", "b.id", "p.branch_id")
        .where("p.id", req.params.id)
        .where("b.account_id", req.apiClient!.accountId)
        .select("p.*")
        .first();
      if (!job) throw err.notFound();
      if (job.device_id) {
        const device = await ownDevice(req, job.device_id);
        if (!device) throw err.notFound();
      }
      if (job.status !== "printing") throw err.conflict();

      const nextStatus =
        body.data.status === "printed"
          ? "printed"
          : Number(job.attempts) < config.maxPrintAttempts
            ? "pending"
            : "dead";

      const updated = await db("print_jobs")
        .where({ id: job.id, status: "printing" })
        .update({
          status: nextStatus,
          error: body.data.error ?? null,
          printed_at: nextStatus === "printed" ? db.fn.now() : null,
          updated_at: db.fn.now(),
        });
      if (!updated) throw err.conflict();

      await writeAudit(db, {
        accountId: req.apiClient!.accountId,
        branchId: job.branch_id,
        deviceId: job.device_id,
        apiClientId: req.apiClient!.id,
        action: `print_job.${body.data.status}`,
        entityType: "print_job",
        entityId: job.id,
        meta: {
          attempt: Number(job.attempts),
          final_status: nextStatus,
          ...(body.data.error ? { error: body.data.error } : {}),
        },
      });
      res.json({ ok: true, status: nextStatus, retry_scheduled: nextStatus === "pending" });
    } catch (e) {
      next(e);
    }
  });

  // Cash drawer command ack (FR-073) — account-scoped like everything else
  r.post("/cash-drawer/ack/:jobId", async (req, res, next) => {
    try {
      const job = await db("print_jobs as p")
        .join("branches as b", "b.id", "p.branch_id")
        .where("p.id", req.params.jobId)
        .where("p.type", "test")
        .where("b.account_id", req.apiClient!.accountId)
        .select("p.*")
        .first();
      if (!job) throw err.notFound();
      res.json({ ok: true });
    } catch (e) {
      next(e);
    }
  });

  return r;
}
