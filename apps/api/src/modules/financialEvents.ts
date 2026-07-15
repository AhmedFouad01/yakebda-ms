import { Router } from "express";
import { Knex } from "knex";
import { z } from "zod";
import { err } from "../lib/errors";
import { canAccessBranch, requirePermission, requireUser } from "../middleware/auth";

export function financialEventRoutes(db: Knex): Router {
  const router = Router();
  router.use(requireUser(db));

  router.get("/financial-events", requirePermission("accounting.view"), async (req, res, next) => {
    try {
      const parsed = z.object({ status: z.enum(["pending", "processing", "posted", "failed", "dead"]).optional() }).safeParse(req.query);
      if (!parsed.success) throw err.validation(parsed.error.flatten());
      const rows = await db("financial_events")
        .where({ account_id: req.user!.accountId })
        .modify((query) => {
          if (req.user!.branchId) query.where("branch_id", req.user!.branchId);
          if (parsed.data.status) query.where("status", parsed.data.status);
        })
        .orderBy([{ column: "created_at", order: "desc" }, { column: "id", order: "desc" }])
        .limit(200);
      res.json({ data: rows });
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
      res.json({ data: await db("financial_events").where({ id: event.id }).first() });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
