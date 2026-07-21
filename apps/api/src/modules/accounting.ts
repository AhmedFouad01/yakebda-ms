import { Router } from "express";
import { Knex } from "knex";
import { z } from "zod";
import { writeAudit } from "../lib/audit";
import { err } from "../lib/errors";
import { newId } from "../lib/ids";
import { canAccessBranch, requirePermission, requireUser } from "../middleware/auth";
import { createCursorPage, parseCursorPage, type CursorDefinition } from "../lib/cursor";
import { postClaimedFinancialEvent, reverseJournalEntry, settleOpenResiduals } from "./accountingLedger";
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
  // node-postgres parses DATE columns to a JS Date at *local* midnight, so
  // toISOString() would shift the day for any timezone ahead of UTC.
  if (value instanceof Date) {
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${value.getFullYear()}-${month}-${day}`;
  }
  return String(value).slice(0, 10);
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

// Every account referenced by a mapping must exist in the tenant and be
// active — a mapping to a disabled account would fail at posting time.
async function assertActiveAccounts(
  db: Knex,
  accountId: string,
  refs: Record<string, string | null | undefined>
): Promise<void> {
  for (const [field, id] of Object.entries(refs)) {
    if (id === undefined || id === null) continue;
    const account = await db("accounting_accounts").where({ id, account_id: accountId }).first();
    if (!account) throw err.validation({ [field]: "الحساب غير موجود في شجرة الحسابات." });
    if (!account.is_active) throw err.validation({ [field]: "الحساب غير نشط — فعّله أولًا أو اختر حسابًا آخر." });
  }
}

export function accountingRoutes(db: Knex): Router {
  const router = Router();
  router.use(requireUser(db));

  router.get("/accounts", requirePermission("accounting.view"), async (req, res, next) => {
    try {
      const parsed = z.object({ include_inactive: z.enum(["true", "false"]).optional() }).safeParse(req.query);
      if (!parsed.success) throw err.validation(parsed.error.flatten());
      const rows = await db("accounting_accounts")
        .where({ account_id: req.user!.accountId })
        .modify((query) => {
          if (parsed.data.include_inactive !== "true") query.where("is_active", true);
        })
        .orderBy("code");
      res.json({ data: rows });
    } catch (error) {
      next(error);
    }
  });

  router.post("/accounts", requirePermission("accounting.manage"), async (req, res, next) => {
    try {
      const body = z.object({
        code: z.string().trim().min(1).max(30),
        name_ar: z.string().trim().min(1).max(160),
        account_type: z.enum(["asset", "liability", "equity", "revenue", "expense"]),
      }).safeParse(req.body);
      if (!body.success) throw err.validation(body.error.flatten());
      const duplicate = await db("accounting_accounts")
        .where({ account_id: req.user!.accountId, code: body.data.code })
        .first();
      if (duplicate) throw err.conflict();
      const id = newId();
      await db("accounting_accounts").insert({ id, account_id: req.user!.accountId, ...body.data });
      await writeAudit(db, {
        accountId: req.user!.accountId,
        userId: req.user!.id,
        action: "accounting.account.create",
        entityType: "accounting_account",
        entityId: id,
        meta: body.data,
        ip: req.ip,
      });
      res.status(201).json({ data: await db("accounting_accounts").where({ id }).first() });
    } catch (error) {
      next(error);
    }
  });

  router.patch("/accounts/:id", requirePermission("accounting.manage"), async (req, res, next) => {
    try {
      if (!z.string().uuid().safeParse(req.params.id).success) throw err.notFound();
      const body = z.object({
        name_ar: z.string().trim().min(1).max(160).optional(),
        is_active: z.boolean().optional(),
      }).refine((value) => value.name_ar !== undefined || value.is_active !== undefined, { message: "empty" })
        .safeParse(req.body);
      if (!body.success) throw err.validation(body.error.flatten());
      const account = await db("accounting_accounts")
        .where({ id: req.params.id, account_id: req.user!.accountId })
        .first();
      if (!account) throw err.notFound();
      if (body.data.is_active === false) {
        const mapped = await db("accounting_mappings")
          .where({ account_id: req.user!.accountId })
          .where((qb) =>
            qb
              .where("debit_account_id", account.id)
              .orWhere("credit_account_id", account.id)
              .orWhere("vat_account_id", account.id)
          )
          .first();
        if (mapped) {
          throw err.validation({ is_active: "الحساب مرتبط بقاعدة ترحيل — أعد ربط القاعدة إلى حساب آخر قبل التعطيل." });
        }
      }
      await db("accounting_accounts").where({ id: account.id }).update({ ...body.data, updated_at: db.fn.now() });
      await writeAudit(db, {
        accountId: req.user!.accountId,
        userId: req.user!.id,
        action: "accounting.account.update",
        entityType: "accounting_account",
        entityId: account.id,
        meta: {
          before: { name_ar: account.name_ar, is_active: account.is_active },
          after: body.data,
        },
        ip: req.ip,
      });
      res.json({ data: await db("accounting_accounts").where({ id: account.id }).first() });
    } catch (error) {
      next(error);
    }
  });

  router.get("/mappings", requirePermission("accounting.view"), async (req, res, next) => {
    try {
      const parsed = z.object({ event_type: z.string().trim().min(1).max(80).optional() }).safeParse(req.query);
      if (!parsed.success) throw err.validation(parsed.error.flatten());
      const rows = await db("accounting_mappings as mapping")
        .join("accounting_accounts as debit", "debit.id", "mapping.debit_account_id")
        .join("accounting_accounts as credit", "credit.id", "mapping.credit_account_id")
        .leftJoin("accounting_accounts as vat", "vat.id", "mapping.vat_account_id")
        .where({ "mapping.account_id": req.user!.accountId })
        .modify((query) => {
          if (parsed.data.event_type) query.where("mapping.event_type", parsed.data.event_type);
        })
        .select(
          "mapping.*",
          "debit.code as debit_account_code",
          "debit.name_ar as debit_account_name_ar",
          "credit.code as credit_account_code",
          "credit.name_ar as credit_account_name_ar",
          "vat.code as vat_account_code",
          "vat.name_ar as vat_account_name_ar"
        )
        .orderBy([{ column: "mapping.event_type", order: "asc" }, { column: "mapping.dimension_key", order: "asc" }]);
      res.json({ data: rows });
    } catch (error) {
      next(error);
    }
  });

  router.post("/mappings", requirePermission("accounting.manage"), async (req, res, next) => {
    try {
      const body = z.object({
        event_type: z.string().trim().min(1).max(80),
        dimension_key: z.string().trim().min(1).max(80).default("default"),
        debit_account_id: z.string().uuid(),
        credit_account_id: z.string().uuid(),
        vat_account_id: z.string().uuid().nullable().optional(),
      }).safeParse(req.body);
      if (!body.success) throw err.validation(body.error.flatten());
      await assertActiveAccounts(db, req.user!.accountId, {
        debit_account_id: body.data.debit_account_id,
        credit_account_id: body.data.credit_account_id,
        vat_account_id: body.data.vat_account_id ?? null,
      });
      const duplicate = await db("accounting_mappings")
        .where({
          account_id: req.user!.accountId,
          event_type: body.data.event_type,
          dimension_key: body.data.dimension_key,
        })
        .first();
      if (duplicate) throw err.conflict();
      const id = newId();
      await db("accounting_mappings").insert({
        id,
        account_id: req.user!.accountId,
        event_type: body.data.event_type,
        dimension_key: body.data.dimension_key,
        debit_account_id: body.data.debit_account_id,
        credit_account_id: body.data.credit_account_id,
        vat_account_id: body.data.vat_account_id ?? null,
      });
      await writeAudit(db, {
        accountId: req.user!.accountId,
        userId: req.user!.id,
        action: "accounting.mapping.create",
        entityType: "accounting_mapping",
        entityId: id,
        meta: body.data,
        ip: req.ip,
      });
      res.status(201).json({ data: await db("accounting_mappings").where({ id }).first() });
    } catch (error) {
      next(error);
    }
  });

  router.put("/mappings/:id", requirePermission("accounting.manage"), async (req, res, next) => {
    try {
      if (!z.string().uuid().safeParse(req.params.id).success) throw err.notFound();
      const body = z.object({
        debit_account_id: z.string().uuid().optional(),
        credit_account_id: z.string().uuid().optional(),
        vat_account_id: z.string().uuid().nullable().optional(),
      }).refine(
        (value) => value.debit_account_id !== undefined || value.credit_account_id !== undefined || value.vat_account_id !== undefined,
        { message: "empty" }
      ).safeParse(req.body);
      if (!body.success) throw err.validation(body.error.flatten());
      const mapping = await db("accounting_mappings")
        .where({ id: req.params.id, account_id: req.user!.accountId })
        .first();
      if (!mapping) throw err.notFound();
      await assertActiveAccounts(db, req.user!.accountId, {
        debit_account_id: body.data.debit_account_id,
        credit_account_id: body.data.credit_account_id,
        vat_account_id: body.data.vat_account_id,
      });
      await db("accounting_mappings").where({ id: mapping.id }).update({ ...body.data, updated_at: db.fn.now() });
      await writeAudit(db, {
        accountId: req.user!.accountId,
        userId: req.user!.id,
        action: "accounting.mapping.update",
        entityType: "accounting_mapping",
        entityId: mapping.id,
        meta: {
          before: {
            debit_account_id: mapping.debit_account_id,
            credit_account_id: mapping.credit_account_id,
            vat_account_id: mapping.vat_account_id,
          },
          after: body.data,
        },
        ip: req.ip,
      });
      res.json({ data: await db("accounting_mappings").where({ id: mapping.id }).first() });
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
      // Server-computed totals: the client renders balance, it never sums it.
      const totals = await db("journal_lines")
        .where({ entry_id: entry.id, account_id: req.user!.accountId })
        .select(db.raw("coalesce(sum(debit), 0)::numeric(18,2)::text as debit"))
        .select(db.raw("coalesce(sum(credit), 0)::numeric(18,2)::text as credit"))
        .first();
      res.json({
        data: {
          ...entry,
          lines: byEntry.get(entry.id) ?? [],
          totals: { debit: totals!.debit, credit: totals!.credit },
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
      const parsed = z.object({
        branch_id: z.string().uuid().optional(),
        period_id: z.string().uuid().optional(),
        date_from: dateInput.optional(),
        through: dateInput.optional(),
      }).safeParse(req.query);
      if (!parsed.success) throw err.validation(parsed.error.flatten());
      const branchId = parsed.data.branch_id ?? req.user!.branchId ?? undefined;
      if (branchId && !canAccessBranch(req.user!, branchId)) throw err.forbidden();
      let dateFrom = parsed.data.date_from;
      let dateTo = parsed.data.through;
      let period: { id: string; starts_on: string; ends_on: string; status: string } | undefined;
      if (parsed.data.period_id) {
        period = await db("accounting_periods")
          .where({ id: parsed.data.period_id, account_id: req.user!.accountId })
          .first();
        if (!period) throw err.notFound();
        dateFrom = period.starts_on;
        dateTo = period.ends_on;
      }
      const lineScope = (query: Knex.QueryBuilder) => {
        if (branchId) query.where((scope) => scope.where("line.branch_id", branchId).orWhereNull("line.id"));
        if (dateFrom) query.where((scope) => scope.where("entry.entry_date", ">=", dateFrom!).orWhereNull("entry.id"));
        if (dateTo) query.where((scope) => scope.where("entry.entry_date", "<=", dateTo!).orWhereNull("entry.id"));
      };
      const rows = await db("accounting_accounts as account")
        .leftJoin("journal_lines as line", function joinLines() {
          this.on("line.accounting_account_id", "=", "account.id").andOn("line.account_id", "=", "account.account_id");
        })
        .leftJoin("journal_entries as entry", "entry.id", "line.entry_id")
        .where({ "account.account_id": req.user!.accountId, "account.is_active": true })
        .modify(lineScope)
        .groupBy("account.id", "account.code", "account.name_ar", "account.account_type")
        .select("account.id", "account.code", "account.name_ar", "account.account_type")
        .select(db.raw("coalesce(sum(line.debit), 0)::numeric(18,2)::text as debit"))
        .select(db.raw("coalesce(sum(line.credit), 0)::numeric(18,2)::text as credit"))
        .orderBy("account.code");
      // Totals are computed by the server (2dp, exact numeric) — the client
      // never re-derives them. debit must equal credit by DB balance guards.
      const totals = await db("journal_lines as line")
        .join("journal_entries as entry", "entry.id", "line.entry_id")
        .where({ "line.account_id": req.user!.accountId })
        .modify((query) => {
          if (branchId) query.where("line.branch_id", branchId);
          if (dateFrom) query.where("entry.entry_date", ">=", dateFrom);
          if (dateTo) query.where("entry.entry_date", "<=", dateTo);
        })
        .select(db.raw("coalesce(sum(line.debit), 0)::numeric(18,2)::text as debit"))
        .select(db.raw("coalesce(sum(line.credit), 0)::numeric(18,2)::text as credit"))
        .first();
      const residual = await db("financial_event_reconciliations")
        .where({ account_id: req.user!.accountId, status: "open" })
        .modify((query) => {
          if (branchId) query.where("branch_id", branchId);
          if (dateFrom) query.where("entry_date", ">=", dateFrom);
          if (dateTo) query.where("entry_date", "<=", dateTo);
        })
        .select(db.raw("coalesce(sum(residual_amount), 0)::numeric(24,4)::text as open_total"))
        .first();
      res.json({
        data: rows,
        totals: { debit: totals!.debit, credit: totals!.credit },
        balanced: totals!.debit === totals!.credit,
        residual_balance: residual!.open_total,
        period: period ?? null,
      });
    } catch (error) {
      next(error);
    }
  });

  router.get("/reconciliation/residuals", requirePermission("accounting.view"), async (req, res, next) => {
    try {
      const parsed = z.object({
        status: z.enum(["open", "settled", "reversed"]).default("open"),
        branch_id: z.string().uuid().optional(),
        date_from: dateInput.optional(),
        date_to: dateInput.optional(),
        limit: z.coerce.number().int().min(1).max(500).default(200),
      }).safeParse(req.query);
      if (!parsed.success) throw err.validation(parsed.error.flatten());
      const branchId = parsed.data.branch_id ?? req.user!.branchId ?? undefined;
      if (branchId && !canAccessBranch(req.user!, branchId)) throw err.forbidden();
      const scoped = (qb: Knex.QueryBuilder) => {
        if (branchId) qb.where("branch_id", branchId);
        if (parsed.data.date_from) qb.where("entry_date", ">=", parsed.data.date_from);
        if (parsed.data.date_to) qb.where("entry_date", "<=", parsed.data.date_to);
      };
      const items = await db("financial_event_reconciliations")
        .where({ account_id: req.user!.accountId, status: parsed.data.status })
        .modify(scoped)
        .orderBy([{ column: "entry_date", order: "desc" }, { column: "created_at", order: "desc" }, { column: "id", order: "desc" }])
        .limit(parsed.data.limit);
      const summary = await db("financial_event_reconciliations")
        .where({ account_id: req.user!.accountId, status: "open" })
        .modify(scoped)
        .groupBy("branch_id")
        .select("branch_id")
        .count({ open_count: "*" })
        .select(db.raw("sum(residual_amount)::numeric(24,4)::text as open_total"));
      const total = await db("financial_event_reconciliations")
        .where({ account_id: req.user!.accountId, status: "open" })
        .modify(scoped)
        .select(db.raw("coalesce(sum(residual_amount), 0)::numeric(24,4)::text as total_open"))
        .first();
      res.json({ data: { items, summary, total_open: total!.total_open } });
    } catch (error) {
      next(error);
    }
  });

  router.post("/reconciliation/settle", requirePermission("accounting.manage"), async (req, res, next) => {
    try {
      const body = z.object({
        branch_id: z.string().uuid().optional(),
        entry_date: dateInput.optional(),
        date_from: dateInput.optional(),
        date_to: dateInput.optional(),
        idempotency_key: z.string().trim().min(1).max(180).optional(),
      }).safeParse(req.body ?? {});
      if (!body.success) throw err.validation(body.error.flatten());
      if (body.data.branch_id && !canAccessBranch(req.user!, body.data.branch_id)) throw err.forbidden();
      if (!body.data.branch_id && req.user!.branchId) throw err.forbidden();
      const entryDate = body.data.entry_date ?? new Date().toISOString().slice(0, 10);
      const result = await db.transaction(async (trx) => {
        const settlement = await settleOpenResiduals(trx, {
          accountId: req.user!.accountId,
          createdBy: req.user!.id,
          entryDate,
          branchId: body.data.branch_id ?? null,
          from: body.data.date_from,
          to: body.data.date_to,
          idempotencyKey: body.data.idempotency_key,
          reference: { trigger: "manual" },
        });
        await writeAudit(trx, {
          accountId: req.user!.accountId,
          branchId: body.data.branch_id ?? null,
          userId: req.user!.id,
          action: "accounting.reconciliation.settle",
          entityType: "financial_event_reconciliation",
          meta: {
            entry_date: entryDate,
            settled_count: settlement.settled_count,
            total_residual: settlement.total_residual,
            journal_entries: settlement.journal_entries,
            absorbed_branches: settlement.absorbed_branches,
          },
          ip: req.ip,
        });
        return settlement;
      });
      // 201 only when this call actually settled rows; replays and no-ops are 200.
      res.status(result.settled_count ? 201 : 200).json({ data: result });
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

  router.get("/periods", requirePermission("accounting.view"), async (req, res, next) => {
    try {
      const parsed = z.object({
        status: z.enum(["open", "locked"]).optional(),
        limit: z.coerce.number().int().min(1).max(200).default(50),
      }).safeParse(req.query);
      if (!parsed.success) throw err.validation(parsed.error.flatten());
      const rows = await db("accounting_periods")
        .where({ account_id: req.user!.accountId })
        .modify((qb) => {
          if (parsed.data.status) qb.where("status", parsed.data.status);
        })
        .orderBy([{ column: "starts_on", order: "desc" }, { column: "ends_on", order: "desc" }])
        .limit(parsed.data.limit);
      res.json({ data: rows });
    } catch (error) {
      next(error);
    }
  });

  router.post("/periods/lock", requirePermission("accounting.manage"), async (req, res, next) => {
    try {
      if (req.user!.branchId && !req.user!.permissions.includes("branches.manage")) throw err.forbidden();
      const parsed = z.object({ starts_on: dateInput, ends_on: dateInput }).safeParse(req.body);
      if (!parsed.success || parsed.data.starts_on > parsed.data.ends_on) throw err.validation(parsed.success ? { dates: "invalid range" } : parsed.error.flatten());
      // ADR-004 type-A close: settlement -> zero-check -> lock in ONE
      // transaction. The settlement entry is recognized at the close date
      // (ends_on). If settlement fails, the lock rolls back entirely; the DB
      // residual guard on the period row remains the final arbiter.
      const result = await db.transaction(async (trx) => {
        const settlement = await settleOpenResiduals(trx, {
          accountId: req.user!.accountId,
          createdBy: req.user!.id,
          entryDate: parsed.data.ends_on,
          from: parsed.data.starts_on,
          to: parsed.data.ends_on,
          reference: { trigger: "period_lock", starts_on: parsed.data.starts_on, ends_on: parsed.data.ends_on },
        });
        const existing = await trx("accounting_periods").where({ account_id: req.user!.accountId, starts_on: parsed.data.starts_on, ends_on: parsed.data.ends_on }).first();
        const id = existing?.id ?? newId();
        if (existing) {
          await trx("accounting_periods").where({ id }).update({ status: "locked", locked_by: req.user!.id, locked_at: trx.fn.now(), updated_at: trx.fn.now() });
        } else {
          await trx("accounting_periods").insert({ id, account_id: req.user!.accountId, ...parsed.data, status: "locked", locked_by: req.user!.id, locked_at: trx.fn.now() });
        }
        await writeAudit(trx, {
          accountId: req.user!.accountId,
          userId: req.user!.id,
          action: "accounting.period.lock",
          entityType: "accounting_period",
          entityId: id,
          meta: {
            ...parsed.data,
            settlement: {
              settled_count: settlement.settled_count,
              total_residual: settlement.total_residual,
              journal_entries: settlement.journal_entries,
            },
          },
          ip: req.ip,
        });
        return { id, settlement };
      });
      res.status(201).json({
        data: await db("accounting_periods").where({ id: result.id }).first(),
        settlement: result.settlement,
      });
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
