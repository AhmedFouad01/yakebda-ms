import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { Knex } from "knex";
import { err } from "../lib/errors";
import { newId } from "../lib/ids";
import { writeAudit } from "../lib/audit";
import { requirePermission, requireUser } from "../middleware/auth";
import { ar } from "../i18n/ar";

const createUserSchema = z.object({
  name: z.string().min(1),
  email: z.string().email().optional(),
  password: z.string().min(8).optional(),
  pin: z.string().min(4).max(8).optional(),
  branch_id: z.string().uuid().optional().nullable(),
  role_keys: z.array(z.string()).default([]),
});

export function userRoutes(db: Knex): Router {
  const r = Router();
  r.use(requireUser(db));

  r.get("/", requirePermission("users.manage"), async (req, res, next) => {
    try {
      const users = await db("users")
        .where({ account_id: req.user!.accountId })
        .select("id", "name", "email", "branch_id", "is_active", "created_at")
        .orderBy("created_at", "asc");
      const roleRows = await db("user_roles as ur")
        .join("roles as r", "r.id", "ur.role_id")
        .whereIn("ur.user_id", users.map((u) => u.id))
        .select("ur.user_id", "r.key", "r.name_ar");
      const byUser: Record<string, Array<{ key: string; name_ar: string }>> = {};
      for (const row of roleRows) (byUser[row.user_id] ??= []).push({ key: row.key, name_ar: row.name_ar });
      res.json({ data: users.map((u) => ({ ...u, roles: byUser[u.id] ?? [] })) });
    } catch (e) {
      next(e);
    }
  });

  r.post("/", requirePermission("users.manage"), async (req, res, next) => {
    try {
      const body = createUserSchema.safeParse(req.body);
      if (!body.success) throw err.validation(body.error.flatten());
      const d = body.data;
      if (!d.password && !d.pin) throw err.validation({ password: "required password or pin" });
      const id = newId();
      await db("users").insert({
        id,
        account_id: req.user!.accountId,
        branch_id: d.branch_id ?? null,
        name: d.name,
        email: d.email ?? null,
        password_hash: d.password ? bcrypt.hashSync(d.password, 10) : null,
        pin_hash: d.pin ? bcrypt.hashSync(d.pin, 10) : null,
      });
      if (d.role_keys.length) {
        const roles = await db("roles")
          .where({ account_id: req.user!.accountId })
          .whereIn("key", d.role_keys);
        if (roles.length)
          await db("user_roles").insert(roles.map((ro) => ({ user_id: id, role_id: ro.id })));
      }
      await writeAudit(db, {
        accountId: req.user!.accountId,
        userId: req.user!.id,
        action: "user.create",
        entityType: "user",
        entityId: id,
        meta: { name: d.name, roles: d.role_keys },
        ip: req.ip,
      });
      res.status(201).json({ data: { id }, message: ar.messages.created });
    } catch (e) {
      next(e);
    }
  });

  return r;
}

export function roleRoutes(db: Knex): Router {
  const r = Router();
  r.use(requireUser(db));

  r.get("/", async (req, res, next) => {
    try {
      const roles = await db("roles").where({ account_id: req.user!.accountId }).orderBy("key");
      const perms = await db("role_permissions").whereIn("role_id", roles.map((x) => x.id));
      res.json({
        data: roles.map((ro) => ({
          ...ro,
          permissions: perms.filter((p) => p.role_id === ro.id).map((p) => p.permission_key),
        })),
      });
    } catch (e) {
      next(e);
    }
  });

  r.get("/permissions", async (_req, res, next) => {
    try {
      res.json({ data: await db("permissions").orderBy("group") });
    } catch (e) {
      next(e);
    }
  });

  // FR-010: create custom role
  r.post("/", requirePermission("roles.manage"), async (req, res, next) => {
    try {
      const body = z
        .object({
          key: z.string().min(2),
          name_ar: z.string().min(1),
          permissions: z.array(z.string()).default([]),
        })
        .safeParse(req.body);
      if (!body.success) throw err.validation(body.error.flatten());
      const id = newId();
      await db("roles").insert({
        id,
        account_id: req.user!.accountId,
        key: body.data.key,
        name_ar: body.data.name_ar,
        is_system: false,
      });
      if (body.data.permissions.length)
        await db("role_permissions").insert(
          body.data.permissions.map((p) => ({ role_id: id, permission_key: p }))
        );
      await writeAudit(db, {
        accountId: req.user!.accountId,
        userId: req.user!.id,
        action: "role.create",
        entityType: "role",
        entityId: id,
        meta: body.data,
        ip: req.ip,
      });
      res.status(201).json({ data: { id }, message: ar.messages.created });
    } catch (e) {
      next(e);
    }
  });

  return r;
}
