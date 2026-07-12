import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { Knex } from "knex";
import { config } from "../config";
import { err } from "../lib/errors";
import { sha256 } from "../lib/ids";

export interface AuthUser {
  id: string;
  accountId: string;
  branchId: string | null;
  name: string;
  permissions: string[];
  roles: string[];
}

export interface AuthClient {
  id: string;
  accountId: string;
  name: string;
  kind: string;
  scopes: string[];
  tokenId: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
      apiClient?: AuthClient;
    }
  }
}

export function signUserToken(user: AuthUser): string {
  return jwt.sign(
    { sub: user.id, acc: user.accountId, br: user.branchId },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn } as jwt.SignOptions
  );
}

export async function loadUser(db: Knex, userId: string): Promise<AuthUser | null> {
  const u = await db("users").where({ id: userId, is_active: true }).first();
  if (!u) return null;
  const rows = await db("user_roles as ur")
    .join("roles as r", "r.id", "ur.role_id")
    .leftJoin("role_permissions as rp", "rp.role_id", "r.id")
    .where("ur.user_id", userId)
    .select("r.key as role_key", "rp.permission_key");
  const roles = [...new Set(rows.map((r) => r.role_key))];
  const permissions = [...new Set(rows.map((r) => r.permission_key).filter(Boolean))];
  return {
    id: u.id,
    accountId: u.account_id,
    branchId: u.branch_id ?? null,
    name: u.name,
    roles,
    permissions,
  };
}

/** JWT auth for admin/POS users. */
export function requireUser(db: Knex) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const header = req.headers.authorization ?? "";
      const token = header.startsWith("Bearer ") ? header.slice(7) : null;
      if (!token) throw err.unauthorized();
      let payload: jwt.JwtPayload;
      try {
        payload = jwt.verify(token, config.jwtSecret) as jwt.JwtPayload;
      } catch {
        throw err.unauthorized();
      }
      const user = await loadUser(db, String(payload.sub));
      if (!user) throw err.unauthorized();
      req.user = user;
      next();
    } catch (e) {
      next(e);
    }
  };
}

/** RBAC check — FR-010 / FR-013. Owners pass everything via seeded full permissions. */
export function requirePermission(...keys: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const u = req.user;
    if (!u) return next(err.unauthorized());
    const ok = keys.every((k) => u.permissions.includes(k));
    if (!ok) return next(err.forbidden());
    next();
  };
}

/** Branch access for operational users. Global users and branch managers may cross branches. */
export function canAccessBranch(user: AuthUser, branchId: string): boolean {
  return user.branchId == null || user.branchId === branchId || user.permissions.includes("branches.manage");
}

/** API token auth (bridge, website, QR...). Scope check included. */
export function requireApiToken(db: Knex, ...scopes: string[]) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const header = req.headers.authorization ?? "";
      const token = header.startsWith("Bearer ") ? header.slice(7) : null;
      if (!token || !token.startsWith("ykms_")) throw err.unauthorized();
      const row = await db("api_tokens as t")
        .join("api_clients as c", "c.id", "t.client_id")
        .where("t.token_hash", sha256(token))
        .whereNull("t.revoked_at")
        .where("c.is_active", true)
        .select(
          "t.id as token_id",
          "t.scopes",
          "c.id as client_id",
          "c.account_id",
          "c.name",
          "c.kind"
        )
        .first();
      if (!row) throw err.unauthorized();
      const tokenScopes: string[] =
        typeof row.scopes === "string" ? JSON.parse(row.scopes) : row.scopes;
      const ok = scopes.every((s) => tokenScopes.includes(s));
      if (!ok) throw err.forbidden();
      req.apiClient = {
        id: row.client_id,
        accountId: row.account_id,
        name: row.name,
        kind: row.kind,
        scopes: tokenScopes,
        tokenId: row.token_id,
      };
      await db("api_tokens").where({ id: row.token_id }).update({ last_used_at: db.fn.now() });
      next();
    } catch (e) {
      next(e);
    }
  };
}
