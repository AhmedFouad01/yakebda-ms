import { Request, Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { Knex } from "knex";
import { err } from "../lib/errors";
import { writeAudit } from "../lib/audit";
import { loadUser, requireUser, signUserToken } from "../middleware/auth";
import { ar } from "../i18n/ar";

type RateBucket = {
  count: number;
  resetAt: number;
};

type FailureState = {
  failedCount: number;
  lockedUntil: Date | null;
};

function positiveEnv(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

function lockDate(value: unknown): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

export function authRoutes(db: Knex): Router {
  const router = Router();
  const rateBuckets = new Map<string, RateBucket>();

  const rateMax = () => positiveEnv("AUTH_RATE_LIMIT_MAX", 10);
  const rateWindowMs = () => positiveEnv("AUTH_RATE_LIMIT_WINDOW_MS", 5 * 60 * 1000);
  const lockThreshold = () => positiveEnv("AUTH_LOCKOUT_THRESHOLD", 5);
  const lockWindowMs = () => positiveEnv("AUTH_LOCKOUT_MS", 15 * 60 * 1000);

  function retryAfterMs(key: string): number | null {
    const now = Date.now();
    const current = rateBuckets.get(key);
    if (!current) return null;
    if (current.resetAt <= now) {
      rateBuckets.delete(key);
      return null;
    }
    return current.count >= rateMax() ? current.resetAt - now : null;
  }

  function noteRateFailure(key: string): void {
    const now = Date.now();
    const current = rateBuckets.get(key);
    if (!current || current.resetAt <= now) {
      rateBuckets.set(key, { count: 1, resetAt: now + rateWindowMs() });
    } else {
      current.count += 1;
    }

    if (rateBuckets.size > 5_000) {
      for (const [candidateKey, bucket] of rateBuckets) {
        if (bucket.resetAt <= now) rateBuckets.delete(candidateKey);
      }
    }
  }

  function clearRateFailures(key: string): void {
    rateBuckets.delete(key);
  }

  async function auditFailure(entry: {
    action: "auth.login_failed" | "auth.pin_failed";
    req: Request;
    accountId?: string | null;
    branchId?: string | null;
    userId?: string | null;
    reason: string;
    failedCount?: number;
  }): Promise<void> {
    await writeAudit(db, {
      accountId: entry.accountId ?? null,
      branchId: entry.branchId ?? null,
      userId: entry.userId ?? null,
      action: entry.action,
      meta: {
        reason: entry.reason,
        ...(entry.failedCount == null ? {} : { failed_count: entry.failedCount }),
      },
      ip: entry.req.ip || null,
    });
  }

  async function recordUserFailure(userId: string): Promise<FailureState> {
    return db.transaction(async (trx) => {
      const user = await trx("users")
        .where({ id: userId, is_active: true })
        .forUpdate()
        .first();
      if (!user) return { failedCount: 0, lockedUntil: null };

      const now = Date.now();
      const existingLock = lockDate(user.locked_until);
      if (existingLock && existingLock.getTime() > now) {
        return {
          failedCount: Number(user.failed_login_count ?? 0),
          lockedUntil: existingLock,
        };
      }

      const baseCount = existingLock ? 0 : Number(user.failed_login_count ?? 0);
      const failedCount = baseCount + 1;
      const lockedUntil = failedCount >= lockThreshold()
        ? new Date(now + lockWindowMs())
        : null;

      await trx("users").where({ id: user.id }).update({
        failed_login_count: failedCount,
        locked_until: lockedUntil,
        updated_at: trx.fn.now(),
      });
      return { failedCount, lockedUntil };
    });
  }

  async function finalizeSuccessfulLogin(userId: string): Promise<Date | null> {
    return db.transaction(async (trx) => {
      const user = await trx("users")
        .where({ id: userId, is_active: true })
        .forUpdate()
        .first();
      if (!user) return null;

      const activeLock = lockDate(user.locked_until);
      if (activeLock && activeLock.getTime() > Date.now()) return activeLock;

      await trx("users").where({ id: user.id }).update({
        failed_login_count: 0,
        locked_until: null,
        updated_at: trx.fn.now(),
      });
      return null;
    });
  }

  router.post("/login", async (req, res, next) => {
    try {
      const body = z
        .object({ email: z.string().email(), password: z.string().min(1) })
        .safeParse(req.body);
      if (!body.success) throw err.validation(body.error.flatten());

      const email = body.data.email.trim().toLowerCase();
      const rateKey = `login:${req.ip}:${email}`;
      const retryMs = retryAfterMs(rateKey);
      if (retryMs != null) {
        await auditFailure({ action: "auth.login_failed", req, reason: "rate_limited" });
        throw err.rateLimited({ retry_after_ms: retryMs });
      }

      const userRow = await db("users")
        .whereRaw("lower(email) = ?", [email])
        .where({ is_active: true })
        .first();

      if (!userRow?.password_hash) {
        noteRateFailure(rateKey);
        await auditFailure({ action: "auth.login_failed", req, reason: "invalid_credentials" });
        throw err.badCredentials();
      }

      const activeLock = lockDate(userRow.locked_until);
      if (activeLock && activeLock.getTime() > Date.now()) {
        noteRateFailure(rateKey);
        await auditFailure({
          action: "auth.login_failed",
          req,
          accountId: userRow.account_id,
          branchId: userRow.branch_id,
          userId: userRow.id,
          reason: "account_locked",
          failedCount: Number(userRow.failed_login_count ?? 0),
        });
        throw err.locked({ locked_until: activeLock.toISOString() });
      }

      if (!bcrypt.compareSync(body.data.password, userRow.password_hash)) {
        const failure = await recordUserFailure(userRow.id);
        noteRateFailure(rateKey);
        await auditFailure({
          action: "auth.login_failed",
          req,
          accountId: userRow.account_id,
          branchId: userRow.branch_id,
          userId: userRow.id,
          reason: failure.lockedUntil ? "lockout_threshold" : "invalid_credentials",
          failedCount: failure.failedCount,
        });
        if (failure.lockedUntil) {
          throw err.locked({ locked_until: failure.lockedUntil.toISOString() });
        }
        throw err.badCredentials();
      }

      const lockedUntil = await finalizeSuccessfulLogin(userRow.id);
      if (lockedUntil) {
        noteRateFailure(rateKey);
        await auditFailure({
          action: "auth.login_failed",
          req,
          accountId: userRow.account_id,
          branchId: userRow.branch_id,
          userId: userRow.id,
          reason: "account_locked",
        });
        throw err.locked({ locked_until: lockedUntil.toISOString() });
      }
      clearRateFailures(rateKey);

      const user = await loadUser(db, userRow.id);
      if (!user) throw err.badCredentials();
      const token = signUserToken(user);
      await writeAudit(db, {
        accountId: user.accountId,
        branchId: user.branchId,
        userId: user.id,
        action: "auth.login",
        ip: req.ip,
      });
      res.json({ token, user, message: ar.messages.login_ok });
    } catch (error) {
      next(error);
    }
  });

  router.post("/pin-login", async (req, res, next) => {
    try {
      const body = z
        .object({ branch_id: z.string().uuid(), pin: z.string().min(4).max(8) })
        .safeParse(req.body);
      if (!body.success) throw err.validation(body.error.flatten());

      const rateKey = `pin:${req.ip}:${body.data.branch_id}`;
      const retryMs = retryAfterMs(rateKey);
      if (retryMs != null) {
        await auditFailure({ action: "auth.pin_failed", req, reason: "rate_limited" });
        throw err.rateLimited({ retry_after_ms: retryMs });
      }

      const branch = await db("branches")
        .where({ id: body.data.branch_id, is_active: true })
        .select("id", "account_id")
        .first();
      const candidates = branch
        ? await db("users")
            .where({ branch_id: branch.id, is_active: true })
            .whereNotNull("pin_hash")
        : [];
      const match = candidates.find((candidate) =>
        bcrypt.compareSync(body.data.pin, candidate.pin_hash)
      );

      if (!match) {
        noteRateFailure(rateKey);
        await auditFailure({
          action: "auth.pin_failed",
          req,
          accountId: branch?.account_id ?? null,
          branchId: branch?.id ?? null,
          reason: "invalid_pin",
        });
        throw err.badPin();
      }

      const lockedUntil = await finalizeSuccessfulLogin(match.id);
      if (lockedUntil) {
        noteRateFailure(rateKey);
        await auditFailure({
          action: "auth.pin_failed",
          req,
          accountId: match.account_id,
          branchId: match.branch_id,
          userId: match.id,
          reason: "account_locked",
          failedCount: Number(match.failed_login_count ?? 0),
        });
        throw err.locked({ locked_until: lockedUntil.toISOString() });
      }
      clearRateFailures(rateKey);

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
    } catch (error) {
      next(error);
    }
  });

  router.get("/me", requireUser(db), (req, res) => {
    res.json({ user: req.user });
  });

  return router;
}
