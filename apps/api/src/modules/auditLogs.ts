import { Router } from "express";
import { Knex } from "knex";
import { requirePermission, requireUser } from "../middleware/auth";

export function auditRoutes(db: Knex): Router {
  const r = Router();
  r.use(requireUser(db), requirePermission("audit.view"));

  // FR-014: user, action, time, branch, device
  r.get("/", async (req, res, next) => {
    try {
      const rows = await db("audit_logs as a")
        .leftJoin("users as u", "u.id", "a.user_id")
        .leftJoin("branches as b", "b.id", "a.branch_id")
        .leftJoin("devices as d", "d.id", "a.device_id")
        .where("a.account_id", req.user!.accountId)
        .select(
          "a.id",
          "a.action",
          "a.entity_type",
          "a.entity_id",
          "a.meta",
          "a.ip",
          "a.created_at",
          "u.name as user_name",
          "b.name as branch_name",
          "d.name as device_name"
        )
        .orderBy("a.created_at", "desc")
        .limit(200);
      res.json({ data: rows });
    } catch (e) {
      next(e);
    }
  });

  return r;
}
