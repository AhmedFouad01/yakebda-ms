import { Router } from "express";
import { z } from "zod";
import { Knex } from "knex";
import { err } from "../lib/errors";
import { newApiToken, newId } from "../lib/ids";
import { writeAudit } from "../lib/audit";
import { requirePermission, requireUser } from "../middleware/auth";
import { ar } from "../i18n/ar";

export function apiClientRoutes(db: Knex): Router {
  const r = Router();
  r.use(requireUser(db), requirePermission("api_clients.manage"));

  r.get("/", async (req, res, next) => {
    try {
      const clients = await db("api_clients")
        .where({ account_id: req.user!.accountId })
        .orderBy("created_at", "asc");
      const tokens = await db("api_tokens")
        .whereIn("client_id", clients.map((c) => c.id))
        .select("id", "client_id", "name", "prefix", "scopes", "last_used_at", "revoked_at", "created_at");
      res.json({
        data: clients.map((c) => ({ ...c, tokens: tokens.filter((t) => t.client_id === c.id) })),
      });
    } catch (e) {
      next(e);
    }
  });

  // FR-161
  r.post("/", async (req, res, next) => {
    try {
      const body = z
        .object({ name: z.string().min(1), kind: z.enum(["website", "qr", "mobile", "bridge", "other"]) })
        .safeParse(req.body);
      if (!body.success) throw err.validation(body.error.flatten());
      const id = newId();
      await db("api_clients").insert({ id, account_id: req.user!.accountId, ...body.data });
      await writeAudit(db, {
        accountId: req.user!.accountId,
        userId: req.user!.id,
        action: "api_client.create",
        entityType: "api_client",
        entityId: id,
        meta: body.data,
        ip: req.ip,
      });
      res.status(201).json({ data: await db("api_clients").where({ id }).first(), message: ar.messages.created });
    } catch (e) {
      next(e);
    }
  });

  // FR-162 / NFR-003: token shown once, hash stored
  r.post("/:clientId/tokens", async (req, res, next) => {
    try {
      const body = z
        .object({ name: z.string().min(1), scopes: z.array(z.string()).min(1) })
        .safeParse(req.body);
      if (!body.success) throw err.validation(body.error.flatten());
      const client = await db("api_clients")
        .where({ id: req.params.clientId, account_id: req.user!.accountId })
        .first();
      if (!client) throw err.notFound();
      const { plain, hash, prefix } = newApiToken();
      const id = newId();
      await db("api_tokens").insert({
        id,
        client_id: client.id,
        name: body.data.name,
        token_hash: hash,
        prefix,
        scopes: JSON.stringify(body.data.scopes),
      });
      await writeAudit(db, {
        accountId: req.user!.accountId,
        userId: req.user!.id,
        action: "api_token.create",
        entityType: "api_token",
        entityId: id,
        meta: { client: client.name, scopes: body.data.scopes },
        ip: req.ip,
      });
      res.status(201).json({
        data: { id, token: plain, prefix, scopes: body.data.scopes },
        message: ar.messages.token_created_once,
      });
    } catch (e) {
      next(e);
    }
  });

  r.post("/tokens/:tokenId/revoke", async (req, res, next) => {
    try {
      const token = await db("api_tokens as t")
        .join("api_clients as c", "c.id", "t.client_id")
        .where("t.id", req.params.tokenId)
        .where("c.account_id", req.user!.accountId)
        .select("t.id")
        .first();
      if (!token) throw err.notFound();
      await db("api_tokens").where({ id: token.id }).update({ revoked_at: db.fn.now() });
      await writeAudit(db, {
        accountId: req.user!.accountId,
        userId: req.user!.id,
        action: "api_token.revoke",
        entityType: "api_token",
        entityId: token.id,
        ip: req.ip,
      });
      res.json({ ok: true, message: ar.messages.updated });
    } catch (e) {
      next(e);
    }
  });

  return r;
}
