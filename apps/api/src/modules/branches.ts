import { Router } from "express";
import { z } from "zod";
import { Knex } from "knex";
import { err } from "../lib/errors";
import { newId } from "../lib/ids";
import { writeAudit } from "../lib/audit";
import { requirePermission, requireUser } from "../middleware/auth";
import { ar } from "../i18n/ar";

const branchSchema = z.object({
  name: z.string().min(1),
  address: z.string().optional().nullable(),
  timezone: z.string().default("Africa/Cairo"),
  is_active: z.boolean().default(true),
});

export function branchRoutes(db: Knex): Router {
  const r = Router();
  r.use(requireUser(db));

  r.get("/", async (req, res, next) => {
    try {
      const rows = await db("branches")
        .where({ account_id: req.user!.accountId })
        .orderBy("created_at", "asc");
      res.json({ data: rows });
    } catch (e) {
      next(e);
    }
  });

  // FR-001
  r.post("/", requirePermission("branches.manage"), async (req, res, next) => {
    try {
      const body = branchSchema.safeParse(req.body);
      if (!body.success) throw err.validation(body.error.flatten());
      const id = newId();
      await db("branches").insert({ id, account_id: req.user!.accountId, ...body.data });
      await writeAudit(db, {
        accountId: req.user!.accountId,
        userId: req.user!.id,
        action: "branch.create",
        entityType: "branch",
        entityId: id,
        meta: { name: body.data.name },
        ip: req.ip,
      });
      const row = await db("branches").where({ id }).first();
      res.status(201).json({ data: row, message: ar.messages.created });
    } catch (e) {
      next(e);
    }
  });

  r.patch("/:id", requirePermission("branches.manage"), async (req, res, next) => {
    try {
      const body = branchSchema.partial().safeParse(req.body);
      if (!body.success) throw err.validation(body.error.flatten());
      const q = { id: req.params.id, account_id: req.user!.accountId };
      const found = await db("branches").where(q).first();
      if (!found) throw err.notFound();
      await db("branches").where(q).update({ ...body.data, updated_at: db.fn.now() });
      await writeAudit(db, {
        accountId: req.user!.accountId,
        userId: req.user!.id,
        action: "branch.update",
        entityType: "branch",
        entityId: found.id,
        meta: body.data,
        ip: req.ip,
      });
      res.json({ data: await db("branches").where(q).first(), message: ar.messages.updated });
    } catch (e) {
      next(e);
    }
  });

  return r;
}
