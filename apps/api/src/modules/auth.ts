import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { Knex } from "knex";
import { err } from "../lib/errors";
import { writeAudit } from "../lib/audit";
import { loadUser, requireUser, signUserToken } from "../middleware/auth";
import { ar } from "../i18n/ar";

export function authRoutes(db: Knex): Router {
  const r = Router();

  // FR-011: دخول الإدارة بالبريد وكلمة المرور
  r.post("/login", async (req, res, next) => {
    try {
      const body = z
        .object({ email: z.string().email(), password: z.string().min(1) })
        .safeParse(req.body);
      if (!body.success) throw err.validation(body.error.flatten());
      const u = await db("users")
        .where({ email: body.data.email, is_active: true })
        .first();
      if (!u?.password_hash || !bcrypt.compareSync(body.data.password, u.password_hash))
        throw err.badCredentials();
      const user = await loadUser(db, u.id);
      if (!user) throw err.badCredentials();
      const token = signUserToken(user);
      await writeAudit(db, {
        accountId: user.accountId,
        userId: user.id,
        action: "auth.login",
        ip: req.ip,
      });
      res.json({ token, user, message: ar.messages.login_ok });
    } catch (e) {
      next(e);
    }
  });

  // FR-012: دخول الكاشير/الويتر بـ PIN
  r.post("/pin-login", async (req, res, next) => {
    try {
      const body = z
        .object({ branch_id: z.string().uuid(), pin: z.string().min(4).max(8) })
        .safeParse(req.body);
      if (!body.success) throw err.validation(body.error.flatten());
      const candidates = await db("users")
        .where({ branch_id: body.data.branch_id, is_active: true })
        .whereNotNull("pin_hash");
      const match = candidates.find((u) => bcrypt.compareSync(body.data.pin, u.pin_hash));
      if (!match) throw err.badPin();
      const user = await loadUser(db, match.id);
      if (!user) throw err.badPin();
      const token = signUserToken(user);
      await writeAudit(db, {
        accountId: user.accountId,
        branchId: user.branchId,
        userId: user.id,
        action: "auth.pin_login",
        ip: req.ip,
      });
      res.json({ token, user, message: ar.messages.login_ok });
    } catch (e) {
      next(e);
    }
  });

  r.get("/me", requireUser(db), (req, res) => {
    res.json({ user: req.user });
  });

  return r;
}
