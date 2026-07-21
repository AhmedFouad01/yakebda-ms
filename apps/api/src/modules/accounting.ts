import { Router } from "express";
import { Knex } from "knex";
import { z } from "zod";
import { writeAudit } from "../lib/audit";
import { err } from "../lib/errors";
import { newId } from "../lib/ids";
import { canAccessBranch, requirePermission, requireUser } from "../middleware/auth";
import { createCursorPage, parseCursorPage, type CursorDefinition } from "../lib/cursor";
import { postClaimedFinancialEvent, reverseJournalEntry } from "./accountingLedger";
import { claimFinancialEvents } from "./financialOutbox";

const dateInput = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const entryDateCursorValues = z.object({
  entry_date: dateInput,
  id: z.string().uuid(),
}).strict();

type EntryDateCursorValues = z.infer<typeof entryDateCursorValues>;

const journalsCursor: CursorDefinition<EntryDateCursorValues> = {
  endpoint: "accounting.journals",
  sort: "entry_date_desc_id_desc",
  values: entryDateCursorValues,
};

function cursorEntryDate(value: string | Date): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
}

function applyEntryDateCursor(qb: Knex.QueryBuilder, cursor: EntryDateCursorValues | null): void {
  if (!cursor) return;
  qb.where((page) => {
    page
      .where("entry_date", "<", cursor.entry_date)
      .orWhere((tie) => tie.where("entry_date", cursor.entry_date).andWhere("id", "<", cursor.id));
  });
}

async function loadJournalLines(db: Knex, accountId: string, entryIds: string[]) {
  if (!entryIds.length) return new Map<string, unknown[]>();
  const lines = await db("journal_lines as line")
    .join("accounting_accounts as account", "account.id", "line.accounting_account_id")
    .where({ "line.account_id": accountId })
    .whereIn("line.entry_id", entryIds)
    .select("line.*", "account.code as account_code", "account.name_ar as account_name_ar")
    .orderBy([{ column: "line.entry_id", order: "asc" }, { column: "line.id", order: "asc" }]);
  const byEntry = new Map<string, unknown[]>();
  for (const line of lines) {
    const bucket = byEntry.get(line.entry_id) ?? [];
    bucket.push(line);
    byEntry.set(line.entry_id, bucket);
  }
  return byEntry;
}

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
      const parsed = z.object({
        branch_id: z.string().uuid().optional(),
        event_type: z.string().trim().min(1).max(80).optional(),
        source_type: z.string().trim().min(1).max(60).optional(),
        period_id: z.string().uuid().optional(),
        date_from: dateInput.optional(),
        date_to: dateInput.optional(),
        cursor: z.string().optional(),
        limit: z.string().optional(),
      }).safeParse(req.query);
      if (!parsed.success) throw err.validation(parsed.error.flatten());
      const branchId = parsed.data.branch_id ?? req.user!.branchId ?? undefined;
      if (branchId && !canAccessBranch(req.user!, branchId)) throw err.forbidden();
      let period: { starts_on: string | Date; ends_on: string | Date } | undefined;
      if (parsed.data.period_id) {
        period = await db("accounting_periods")
          .where({ id: parsed.data.period_id, account_id: req.user!.accountId })
          .first();
        if (!period) throw err.notFound();
      }
      const page = parseCursorPage(req.query, journalsCursor);
      const rows = await db("journal_entries")
        .where({ account_id: req.user!.accountId })
        .modify((query) => {
          if (branchId) query.where("branch_id", branchId);
          if (parsed.data.event_type) query.where("event_type", parsed.data.event_type);
          if (parsed.data.source_type) query.where("source_type", parsed.data.source_type);
          if (parsed.data.date_from) query.where("entry_date", ">=", parsed.data.date_from);
          if (parsed.data.date_to) query.where("entry_date", "<=", parsed.data.date_to);
          if (period) {
            query.where("entry_date", ">=", period.starts_on).where("entry_date", "<=", period.ends_on);
          }
          applyEntryDateCursor(query, page.cursor);
        })
        .orderBy([{ column: "entry_date", order: "desc" }, { column: "id", order: "desc" }])
        .limit(page.limit + 1);
      const result = createCursorPage(rows, page.limit, journalsCursor, (row: { id: string; entry_date: string | Date }) => ({
        entry_date: cursorEntryDate(row.entry_date),
        id: row.id,
      }));
      const byEntry = await loadJournalLines(db, req.user!.accountId, result.data.map((entry: { id: string }) => entry.id));
      res.json({
        ...result,
        data: result.data.map((entry: { id: string }) => ({ ...entry, lines: byEntry.get(entry.id) ?? [] })),
      });
    } catch (error) {
      next(error);
    }
  });

  router.get("/journals/:id", requirePermission("accounting.view"), async (req, res, next) => {
    try {
      if (!z.string().uuid().safeParse(req.params.id).success) throw err.notFound();
      const entry = await db("journal_entries")
        .where({ id: req.params.id, account_id: req.user!.accountId })
        .first();
      if (!entry) throw err.notFound();
      if (entry.branch_id && !canAccessBranch(req.user!, entry.branch_id)) throw err.forbidden();
      const byEntry = await loadJournalLines(db, req.user!.accountId, [entry.id]);
      const reversedBy = await db("journal_entries")
        .where({ reversal_of_entry_id: entry.id, account_id: req.user!.accountId })
        .select("id", "entry_date", "description", "created_by")
        .first();
      const financialEvent = entry.financial_event_id
        ? await db("financial_events")
            .where({ id: entry.financial_event_id, account_id: req.user!.accountId })
            .select("id", "status", "event_type", "source_type", "source_id", "last_error", "created_at")
            .first()
        : null;
      res.json({
        data: {
          ...entry,
          lines: byEntry.get(entry.id) ?? [],
          reversed_by: reversedBy ?? null,
          financial_event: financialEvent ?? null,
        },
      });
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
