import { Router } from "express";
import { Knex } from "knex";
import { z } from "zod";
import { writeAudit } from "../lib/audit";
import { err } from "../lib/errors";
import { newId } from "../lib/ids";
import { canAccessBranch, requirePermission, requireUser } from "../middleware/auth";
import { postClaimedFinancialEvent, reverseJournalEntry } from "./accountingLedger";
import { claimFinancialEvents } from "./financialOutbox";

const dateInput = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export function accountingRoutes(db: Knex): Router {
  const router = Router();
  router.use(requireUser(db));

  router.get("/accounts", requirePermission("accounting.view"), async (req, res, next) => {
    try {
      const rows = await db("accounting_accounts")
        .where({ account_id: req.user!.accountId, is_active: true })
        .orderBy("code");
      res.json({ data: rows });
    } catch (error) {
      next(error);
    }
  });

  router.get("/journals", requirePermission("accounting.view"), async (req, res, next) => {
    try {
      const parsed = z.object({ branch_id: z.string().uuid().optional(), limit: z.coerce.number().int().min(1).max(200).default(100) }).safeParse(req.query);
      if (!parsed.success) throw err.validation(parsed.error.flatten());
      const branchId = parsed.data.branch_id ?? req.user!.branchId ?? undefined;
      if (branchId && !canAccessBranch(req.user!, branchId)) throw err.forbidden();
      const entries = await db("journal_entries")
        .where({ account_id: req.user!.accountId })
        .modify((query) => {
          if (branchId) query.where("branch_id", branchId);
        })
        .orderBy([{ column: "entry_date", order: "desc" }, { column: "id", order: "desc" }])
        .limit(parsed.data.limit);
      const entryIds = entries.map((entry: { id: string }) => entry.id);
      const lines = entryIds.length
        ? await db("journal_lines as line")
            .join("accounting_accounts as account", "account.id", "line.accounting_account_id")
            .where({ "line.account_id": req.user!.accountId })
            .whereIn("line.entry_id", entryIds)
            .select("line.*", "account.code as account_code", "account.name_ar as account_name_ar")
            .orderBy([{ column: "line.entry_id", order: "asc" }, { column: "line.id", order: "asc" }])
        : [];
      const byEntry = new Map<string, unknown[]>();
      for (const line of lines) {
        const bucket = byEntry.get(line.entry_id) ?? [];
        bucket.push(line);
        byEntry.set(line.entry_id, bucket);
      }
      res.json({ data: entries.map((entry: { id: string }) => ({ ...entry, lines: byEntry.get(entry.id) ?? [] })) });
    } catch (error) {
      next(error);
    }
  });

  router.get("/trial-balance", requirePermission("accounting.view"), async (req, res, next) => {
    try {
      const parsed = z.object({ branch_id: z.string().uuid().optional(), through: dateInput.optional() }).safeParse(req.query);
      if (!parsed.success) throw err.validation(parsed.error.flatten());
      const branchId = parsed.data.branch_id ?? req.user!.branchId ?? undefined;
      if (branchId && !canAccessBranch(req.user!, branchId)) throw err.forbidden();
      const rows = await db("accounting_accounts as account")
        .leftJoin("journal_lines as line", function joinLines() {
          this.on("line.accounting_account_id", "=", "account.id").andOn("line.account_id", "=", "account.account_id");
        })
        .leftJoin("journal_entries as entry", "entry.id", "line.entry_id")
        .where({ "account.account_id": req.user!.accountId, "account.is_active": true })
        .modify((query) => {
          if (branchId) query.where((scope) => scope.where("line.branch_id", branchId).orWhereNull("line.id"));
          if (parsed.data.through) query.where((scope) => scope.where("entry.entry_date", "<=", parsed.data.through!).orWhereNull("entry.id"));
        })
        .groupBy("account.id", "account.code", "account.name_ar", "account.account_type")
        .select("account.id", "account.code", "account.name_ar", "account.account_type")
        .sum({ debit: "line.debit", credit: "line.credit" })
        .orderBy("account.code");
      res.json({ data: rows });
    } catch (error) {
      next(error);
    }
  });

  router.get("/rounding-reconciliations", requirePermission("accounting.view"), async (req, res, next) => {
    try {
      const parsed = z.object({
        branch_id: z.string().uuid().optional(),
        status: z.enum(["open", "settled", "reversed"]).optional(),
        limit: z.coerce.number().int().min(1).max(200).default(100),
      }).safeParse(req.query);
      if (!parsed.success) throw err.validation(parsed.error.flatten());
      const branchId = parsed.data.branch_id ?? req.user!.branchId ?? undefined;
      if (branchId && !canAccessBranch(req.user!, branchId)) throw err.forbidden();
      const rows = await db("financial_event_reconciliations")
        .where({ account_id: req.user!.accountId })
        .modify((query) => {
          if (branchId) query.where("branch_id", branchId);
          if (parsed.data.status) query.where("status", parsed.data.status);
        })
        .orderBy([{ column: "entry_date", order: "desc" }, { column: "created_at", order: "desc" }, { column: "id", order: "desc" }])
        .limit(parsed.data.limit);
      res.json({ data: rows });
    } catch (error) {
      next(error);
    }
  });

  router.post("/events/process", requirePermission("accounting.manage"), async (req, res, next) => {
    try {
      const parsed = z.object({ limit: z.coerce.number().int().min(1).max(100).default(25) }).safeParse(req.body ?? {});
      if (!parsed.success) throw err.validation(parsed.error.flatten());
      const workerId = `accounting:${req.user!.id}:${newId()}`;
      const claimed = await claimFinancialEvents(db, {
        workerId,
        limit: parsed.data.limit,
        accountId: req.user!.accountId,
        branchId: req.user!.branchId ?? undefined,
      });
      const data = [];
      for (const event of claimed) {
        data.push({ event_id: event.id, ...(await postClaimedFinancialEvent(db, { eventId: event.id, workerId, createdBy: req.user!.id })) });
      }
      await writeAudit(db, { accountId: req.user!.accountId, branchId: req.user!.branchId, userId: req.user!.id, action: "accounting.events.process", entityType: "financial_event", meta: { claimed: claimed.length }, ip: req.ip });
      res.json({ data });
    } catch (error) {
      next(error);
    }
  });

  router.post("/periods/lock", requirePermission("accounting.manage"), async (req, res, next) => {
    try {
      if (req.user!.branchId && !req.user!.permissions.includes("branches.manage")) throw err.forbidden();
      const parsed = z.object({ starts_on: dateInput, ends_on: dateInput }).safeParse(req.body);
      if (!parsed.success || parsed.data.starts_on > parsed.data.ends_on) throw err.validation(parsed.success ? { dates: "invalid range" } : parsed.error.flatten());
      const existing = await db("accounting_periods").where({ account_id: req.user!.accountId, starts_on: parsed.data.starts_on, ends_on: parsed.data.ends_on }).first();
      const id = existing?.id ?? newId();
      if (existing) {
        await db("accounting_periods").where({ id }).update({ status: "locked", locked_by: req.user!.id, locked_at: db.fn.now(), updated_at: db.fn.now() });
      } else {
        await db("accounting_periods").insert({ id, account_id: req.user!.accountId, ...parsed.data, status: "locked", locked_by: req.user!.id, locked_at: db.fn.now() });
      }
      await writeAudit(db, { accountId: req.user!.accountId, userId: req.user!.id, action: "accounting.period.lock", entityType: "accounting_period", entityId: id, meta: parsed.data, ip: req.ip });
      res.status(201).json({ data: await db("accounting_periods").where({ id }).first() });
    } catch (error) {
      next(error);
    }
  });

  router.post("/journals/:id/reverse", requirePermission("accounting.manage"), async (req, res, next) => {
    try {
      const parsed = z.object({ reason: z.string().trim().min(3).max(500), entry_date: dateInput.optional() }).safeParse(req.body);
      if (!parsed.success) throw err.validation(parsed.error.flatten());
      const original = await db("journal_entries").where({ id: req.params.id, account_id: req.user!.accountId }).first();
      if (!original) throw err.notFound();
      if (original.branch_id && !canAccessBranch(req.user!, original.branch_id)) throw err.forbidden();
      const id = await reverseJournalEntry(db, { accountId: req.user!.accountId, entryId: original.id, reason: parsed.data.reason, createdBy: req.user!.id, entryDate: parsed.data.entry_date });
      await writeAudit(db, { accountId: req.user!.accountId, branchId: original.branch_id, userId: req.user!.id, action: "accounting.journal.reverse", entityType: "journal_entry", entityId: id, meta: { reversal_of: original.id }, ip: req.ip });
      res.status(201).json({ data: await db("journal_entries").where({ id }).first() });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
