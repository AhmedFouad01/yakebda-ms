import { Router } from "express";
import { Knex } from "knex";
import { requirePermission, requireUser } from "../middleware/auth";
import { writeAudit } from "../lib/audit";
import type { SccIntegration } from "./integration";

export function sccRoutes(db: Knex, integration: SccIntegration) {
  const router = Router();
  router.use(requireUser(db), requirePermission("settings.manage"));
  router.get("/diagnostics", async (_req, res, next) => { try { res.json({ data: await integration.diagnostics() }); } catch (error) { next(error); } });
  router.post("/heartbeat", async (req, res, next) => { try { await integration.heartbeat(); await writeAudit(db, { accountId: req.user!.accountId, branchId: req.user!.branchId, userId: req.user!.id, action: "scc.heartbeat_requested", entityType: "scc_integration", ip: req.ip }); res.status(202).json({ data: await integration.diagnostics() }); } catch (error) { next(error); } });
  router.post("/backup-status", async (req, res, next) => { try { const { status, integrity, restoreTestedAt = null, locationClass = "local" } = req.body ?? {}; if (!["succeeded", "failed"].includes(status) || !["verified", "failed", "unknown"].includes(integrity) || !["local", "customer_cloud", "systronic_managed"].includes(locationClass)) return res.status(422).json({ code: "validation", message: "invalid backup status" }); await integration.reportBackup({ status, integrity, restoreTestedAt, locationClass }); await writeAudit(db, { accountId: req.user!.accountId, branchId: req.user!.branchId, userId: req.user!.id, action: "scc.backup_reported", entityType: "scc_integration", ip: req.ip }); res.status(202).json({ data: await integration.diagnostics() }); } catch (error) { next(error); } });
  router.post("/enabled", async (req, res, next) => { try { const enabled = req.body?.enabled; if (typeof enabled !== "boolean") return res.status(422).json({ code: "validation", message: "enabled must be boolean" }); await integration.setEnabled(enabled); await writeAudit(db, { accountId: req.user!.accountId, branchId: req.user!.branchId, userId: req.user!.id, action: enabled ? "scc.enabled" : "scc.disabled", entityType: "scc_integration", ip: req.ip }); res.json({ data: await integration.diagnostics() }); } catch (error) { next(error); } });
  return router;
}
