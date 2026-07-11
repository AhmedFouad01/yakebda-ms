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
        .select("id", "name", "email", "branch_id", "is_active", "created_at", "updated_at")
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

  // YKMS-02G-D — تحديث المستخدم: تفعيل/إيقاف، الأدوار، الفرع، إعادة تعيين كلمة السر/PIN.
  // حماية: منع إيقاف/تجريد آخر مالك نشط.
  r.patch("/:id", requirePermission("users.manage"), async (req, res, next) => {
    try {
      const body = z
        .object({
          name: z.string().min(1).optional(),
          email: z.string().email().optional().nullable().or(z.literal("")),
          branch_id: z.string().uuid().optional().nullable(),
          is_active: z.boolean().optional(),
          role_keys: z.array(z.string()).optional(),
          password: z.string().min(4).optional(),
          pin: z.string().min(4).optional(),
        })
        .safeParse(req.body);
      if (!body.success) throw err.validation(body.error.flatten());
      const accountId = req.user!.accountId;
      const target = await db("users").where({ id: req.params.id, account_id: accountId }).first();
      if (!target) throw err.notFound();
      const d = body.data;

      // هل الهدف مالك حاليًا؟
      const ownerRole = await db("roles").where({ account_id: accountId, key: "owner" }).first();
      const targetIsOwner = ownerRole
        ? !!(await db("user_roles").where({ user_id: target.id, role_id: ownerRole.id }).first())
        : false;

      // عدد الملاك النشطين
      async function activeOwnerCount(): Promise<number> {
        if (!ownerRole) return 0;
        const rows = await db("user_roles as ur")
          .join("users as u", "u.id", "ur.user_id")
          .where({ "ur.role_id": ownerRole.id, "u.account_id": accountId, "u.is_active": true })
          .countDistinct({ c: "u.id" });
        return Number((rows[0] as { c: string | number }).c);
      }

      // منع إيقاف آخر مالك نشط
      if (targetIsOwner && d.is_active === false && target.is_active) {
        if ((await activeOwnerCount()) <= 1) throw err.validation({ is_active: "لا يمكن إيقاف المالك الوحيد النشط." });
      }
      // منع إزالة دور المالك عن آخر مالك نشط
      if (targetIsOwner && d.role_keys && !d.role_keys.includes("owner")) {
        if ((await activeOwnerCount()) <= 1 && target.is_active) throw err.validation({ role_keys: "لا يمكن إزالة دور المالك عن المالك الوحيد." });
      }

      const patch: Record<string, unknown> = {};
      if (d.name != null) patch.name = d.name;
      if (d.email !== undefined) patch.email = d.email || null;
      if (d.branch_id !== undefined) patch.branch_id = d.branch_id;
      if (d.is_active != null) patch.is_active = d.is_active;
      if (d.password) patch.password_hash = bcrypt.hashSync(d.password, 10);
      if (d.pin) patch.pin_hash = bcrypt.hashSync(d.pin, 10);
      if (Object.keys(patch).length) await db("users").where({ id: target.id }).update({ ...patch, updated_at: db.fn.now() });

      if (d.role_keys) {
        const roles = await db("roles").where({ account_id: accountId }).whereIn("key", d.role_keys);
        await db("user_roles").where({ user_id: target.id }).del();
        if (roles.length) await db("user_roles").insert(roles.map((ro) => ({ user_id: target.id, role_id: ro.id })));
      }

      await writeAudit(db, {
        accountId,
        userId: req.user!.id,
        action: "user.update",
        entityType: "user",
        entityId: target.id,
        meta: { is_active: d.is_active, roles: d.role_keys, password_reset: !!d.password, pin_reset: !!d.pin },
        ip: req.ip,
      });
      res.json({ data: { id: target.id }, message: ar.messages.updated });
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
      const rp = await db("role_permissions as rp")
        .join("permissions as p", "p.key", "rp.permission_key")
        .whereIn("rp.role_id", roles.map((r2: { id: string }) => r2.id))
        .select("rp.role_id", "p.key", "p.name_ar", "p.group");
      for (const role of roles as Array<{ id: string; permissions?: unknown }>) {
        role.permissions = rp.filter((x: { role_id: string }) => x.role_id === role.id);
      }
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

  // YKMS-02G-D — تحديث الدور: إعادة تسمية و/أو ضبط الصلاحيات (مصفوفة الأذونات).
  r.patch("/:id", requirePermission("roles.manage"), async (req, res, next) => {
    try {
      const body = z
        .object({
          name_ar: z.string().min(1).optional(),
          permissions: z.array(z.string()).optional(),
        })
        .safeParse(req.body);
      if (!body.success) throw err.validation(body.error.flatten());
      const role = await db("roles").where({ id: req.params.id, account_id: req.user!.accountId }).first();
      if (!role) throw err.notFound();

      // حماية: لا يجوز تجريد دور المالك من صلاحياته الحرجة
      if (role.key === "owner" && body.data.permissions) {
        const all = await db("permissions").pluck("key");
        const missing = all.filter((k: string) => !body.data.permissions!.includes(k));
        if (missing.length) throw err.validation({ permissions: "لا يمكن تقليص صلاحيات دور المالك." });
      }

      if (body.data.name_ar) await db("roles").where({ id: role.id }).update({ name_ar: body.data.name_ar });

      if (body.data.permissions) {
        await db("role_permissions").where({ role_id: role.id }).del();
        if (body.data.permissions.length) {
          const valid = await db("permissions").whereIn("key", body.data.permissions).pluck("key");
          await db("role_permissions").insert(valid.map((p: string) => ({ role_id: role.id, permission_key: p })));
        }
      }

      await writeAudit(db, {
        accountId: req.user!.accountId,
        userId: req.user!.id,
        action: "role.update",
        entityType: "role",
        entityId: role.id,
        meta: { name_ar: body.data.name_ar, permission_count: body.data.permissions?.length },
        ip: req.ip,
      });
      res.json({ data: { id: role.id }, message: ar.messages.updated });
    } catch (e) {
      next(e);
    }
  });

  // YKMS-02G-D — تكرار دور مع صلاحياته
  r.post("/:id/duplicate", requirePermission("roles.manage"), async (req, res, next) => {
    try {
      const src = await db("roles").where({ id: req.params.id, account_id: req.user!.accountId }).first();
      if (!src) throw err.notFound();
      const body = z.object({ key: z.string().min(2), name_ar: z.string().min(1) }).safeParse(req.body);
      if (!body.success) throw err.validation(body.error.flatten());
      const id = newId();
      await db("roles").insert({ id, account_id: req.user!.accountId, key: body.data.key, name_ar: body.data.name_ar, is_system: false });
      const perms = await db("role_permissions").where({ role_id: src.id }).pluck("permission_key");
      if (perms.length) await db("role_permissions").insert(perms.map((p: string) => ({ role_id: id, permission_key: p })));
      await writeAudit(db, { accountId: req.user!.accountId, userId: req.user!.id, action: "role.duplicate", entityType: "role", entityId: id, meta: { from: src.id }, ip: req.ip });
      res.status(201).json({ data: { id }, message: ar.messages.created });
    } catch (e) {
      next(e);
    }
  });

  // YKMS-02G-D — حذف دور (يمنع حذف أدوار النظام والأدوار المستخدمة)
  r.delete("/:id", requirePermission("roles.manage"), async (req, res, next) => {
    try {
      const role = await db("roles").where({ id: req.params.id, account_id: req.user!.accountId }).first();
      if (!role) throw err.notFound();
      if (role.is_system) throw err.validation({ role: "لا يمكن حذف أدوار النظام." });
      const inUse = await db("user_roles").where({ role_id: role.id }).first();
      if (inUse) throw err.validation({ role: "الدور مستخدم من مستخدمين حاليين." });
      await db("role_permissions").where({ role_id: role.id }).del();
      await db("roles").where({ id: role.id }).del();
      await writeAudit(db, { accountId: req.user!.accountId, userId: req.user!.id, action: "role.delete", entityType: "role", entityId: role.id, ip: req.ip });
      res.json({ message: ar.messages.deleted });
    } catch (e) {
      next(e);
    }
  });

  return r;
}
