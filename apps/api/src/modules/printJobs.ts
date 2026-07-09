import { Router } from "express";
import { z } from "zod";
import { Knex } from "knex";
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
