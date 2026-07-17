import { Router } from "express";
import { Knex } from "knex";
import { z } from "zod";
import type {
  PaymentMethodReportRow,
  ReportResponse,
  ReportRunMeta,
  ReportSummary,
  SalesByBranchRow,
  SalesByDayRow,
  SalesBySourceRow,
  SalesReportData,
  TopProductReportRow,
} from "@ykms/contracts";
import { err } from "../lib/errors";
import { canAccessBranch, requirePermission, requireUser, type AuthUser } from "../middleware/auth";
import { ACTIVE_REPORT_CATALOG } from "./reportCatalog";

const DEFAULT_TIMEZONE = "Africa/Cairo";
const CURRENCY = "EGP" as const;

const scopeQuery = z.object({
  branch_id: z.string().uuid().optional(),
});

const periodQuery = scopeQuery.extend({
  days: z.coerce.number().int().min(1).max(90).default(30),
});

interface ReportScope {
  branchId: string | null;
  timezone: string;
}

async function resolveReportScope(
  db: Knex,
  user: AuthUser,
  requestedBranchId?: string
): Promise<ReportScope> {
  const branchId = requestedBranchId ?? user.branchId ?? null;
  if (!branchId) return { branchId: null, timezone: DEFAULT_TIMEZONE };
  if (!canAccessBranch(user, branchId)) throw err.forbidden();

  const branch = await db("branches")
    .where({ id: branchId, account_id: user.accountId, is_active: true })
    .select("id", "timezone")
    .first();
  if (!branch) throw err.notFound();

  return {
    branchId: branch.id,
    timezone: branch.timezone || DEFAULT_TIMEZONE,
  };
}

function reportMeta(
  reportId: string,
  scope: ReportScope,
  filters: { days?: number; branch_id?: string | null }
): ReportRunMeta {
  return {
    report_id: reportId,
    generated_at: new Date().toISOString(),
    timezone: scope.timezone,
    currency: CURRENCY,
    filters,
  };
}

function localDayStart(db: Knex, timezone: string): Knex.Raw {
  return db.raw(
    "date_trunc('day', now() AT TIME ZONE ?) AT TIME ZONE ?",
    [timezone, timezone]
  );
}

function localPeriodStart(db: Knex, timezone: string, days: number): Knex.Raw {
  return db.raw(
    "(date_trunc('day', now() AT TIME ZONE ?) - ((?::int - 1) * interval '1 day')) AT TIME ZONE ?",
    [timezone, days, timezone]
  );
}

function applyBranch(
  qb: Knex.QueryBuilder,
  column: string,
  branchId: string | null
): void {
  if (branchId) qb.where(column, branchId);
}

function numberValue(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function reportRoutes(db: Knex): Router {
  const router = Router();
  router.use(requireUser(db));
  router.use(requirePermission("reports.view"));

  router.get("/catalog", (_req, res) => {
    res.json({ data: ACTIVE_REPORT_CATALOG });
  });

  router.get("/summary", async (req, res, next) => {
    try {
      const parsed = scopeQuery.safeParse(req.query);
      if (!parsed.success) throw err.validation(parsed.error.flatten());

      const user = req.user!;
      const scope = await resolveReportScope(db, user, parsed.data.branch_id);
      const today = localDayStart(db, scope.timezone);

      const salesQuery = db("payments as p")
        .join("orders as o", "o.id", "p.order_id")
        .where("o.account_id", user.accountId)
        .where("p.created_at", ">=", today)
        .whereNot("p.method", "unpaid")
        .modify((qb) => applyBranch(qb, "o.branch_id", scope.branchId))
        .sum("p.amount as total")
        .first();

      const ordersTodayQuery = db("orders")
        .where({ account_id: user.accountId })
        .where("created_at", ">=", today)
        .modify((qb) => applyBranch(qb, "branch_id", scope.branchId))
        .count("id as c")
        .first();

      const openOrdersQuery = db("orders")
        .where({ account_id: user.accountId })
        .whereIn("status", ["submitted", "in_kitchen", "ready"])
        .modify((qb) => applyBranch(qb, "branch_id", scope.branchId))
        .count("id as c")
        .first();

      const kitchenPendingQuery = db("orders")
        .where({ account_id: user.accountId })
        .whereIn("status", ["submitted", "in_kitchen"])
        .modify((qb) => applyBranch(qb, "branch_id", scope.branchId))
        .count("id as c")
        .first();

      const cancelledQuery = db("orders")
        .where({ account_id: user.accountId, status: "cancelled" })
        .where("created_at", ">=", today)
        .modify((qb) => applyBranch(qb, "branch_id", scope.branchId))
        .count("id as c")
        .first();

      const openShiftsQuery = db("shifts")
        .where({ account_id: user.accountId, status: "open" })
        .modify((qb) => applyBranch(qb, "branch_id", scope.branchId))
        .count("id as c")
        .first();

      const cashExpectedQuery = db("shifts as s")
        .leftJoin("payments as p", function () {
          this.on("p.shift_id", "=", "s.id").andOn(
            "p.method",
            "=",
            db.raw("?", ["cash"])
          );
        })
        .where("s.account_id", user.accountId)
        .where("s.status", "open")
        .modify((qb) => applyBranch(qb, "s.branch_id", scope.branchId))
        .sum("p.amount as cash_sales")
        .first();

      const [sales, ordersToday, openOrders, kitchenPending, cancelled, openShifts, cashExpected] =
        await Promise.all([
          salesQuery,
          ordersTodayQuery,
          openOrdersQuery,
          kitchenPendingQuery,
          cancelledQuery,
          openShiftsQuery,
          cashExpectedQuery,
        ]);

      const data: ReportSummary = {
        sales_today: numberValue(sales?.total),
        orders_today: numberValue(ordersToday?.c),
        open_orders: numberValue(openOrders?.c),
        kitchen_pending: numberValue(kitchenPending?.c),
        cancelled_today: numberValue(cancelled?.c),
        open_shifts: numberValue(openShifts?.c),
        open_shift_cash_sales: numberValue(cashExpected?.cash_sales),
      };

      const response: ReportResponse<ReportSummary> = {
        data,
        meta: reportMeta("sales.summary", scope, {
          branch_id: scope.branchId,
        }),
      };
      res.json(response);
    } catch (error) {
      next(error);
    }
  });

  router.get("/sales", async (req, res, next) => {
    try {
      const parsed = periodQuery.safeParse(req.query);
      if (!parsed.success) throw err.validation(parsed.error.flatten());

      const user = req.user!;
      const scope = await resolveReportScope(db, user, parsed.data.branch_id);
      const since = localPeriodStart(db, scope.timezone, parsed.data.days);
      const localDaySql = "date(p.created_at AT TIME ZONE ?)";

      const byDayRaw = await db("payments as p")
        .join("orders as o", "o.id", "p.order_id")
        .where("o.account_id", user.accountId)
        .where("p.created_at", ">=", since)
        .whereNot("p.method", "unpaid")
        .modify((qb) => applyBranch(qb, "o.branch_id", scope.branchId))
        .select(db.raw(`${localDaySql} as day`, [scope.timezone]))
        .sum("p.amount as total")
        .groupByRaw(localDaySql, [scope.timezone])
        .orderBy("day", "asc");

      const byBranchRaw = await db("payments as p")
        .join("orders as o", "o.id", "p.order_id")
        .join("branches as b", "b.id", "o.branch_id")
        .where("o.account_id", user.accountId)
        .where("p.created_at", ">=", since)
        .whereNot("p.method", "unpaid")
        .modify((qb) => applyBranch(qb, "o.branch_id", scope.branchId))
        .select("b.id as branch_id", "b.name as branch")
        .sum("p.amount as total")
        .groupBy("b.id", "b.name")
        .orderBy("total", "desc");

      const bySourceRaw = await db("payments as p")
        .join("orders as o", "o.id", "p.order_id")
        .leftJoin("order_sources as os", "os.id", "o.source_id")
        .where("o.account_id", user.accountId)
        .where("p.created_at", ">=", since)
        .whereNot("p.method", "unpaid")
        .modify((qb) => applyBranch(qb, "o.branch_id", scope.branchId))
        .select(
          "o.source_id",
          db.raw(
            "coalesce(os.name_ar, o.source_name_snapshot, ?) as source",
            ["غير محدد"]
          )
        )
        .sum("p.amount as total")
        .groupBy("o.source_id", "os.name_ar", "o.source_name_snapshot")
        .orderBy("total", "desc");

      const data: SalesReportData = {
        by_day: byDayRaw.map(
          (row): SalesByDayRow => ({
            day: String(row.day),
            total: numberValue(row.total),
          })
        ),
        by_branch: byBranchRaw.map(
          (row): SalesByBranchRow => ({
            branch_id: String(row.branch_id),
            branch: String(row.branch),
            total: numberValue(row.total),
          })
        ),
        by_source: bySourceRaw.map(
          (row): SalesBySourceRow => ({
            source_id: row.source_id ? String(row.source_id) : null,
            source: String(row.source),
            total: numberValue(row.total),
          })
        ),
      };

      const response: ReportResponse<SalesReportData> = {
        data,
        meta: reportMeta("sales.trend", scope, {
          days: parsed.data.days,
          branch_id: scope.branchId,
        }),
      };
      res.json(response);
    } catch (error) {
      next(error);
    }
  });

  router.get("/top-products", async (req, res, next) => {
    try {
      const parsed = periodQuery.safeParse(req.query);
      if (!parsed.success) throw err.validation(parsed.error.flatten());

      const user = req.user!;
      const scope = await resolveReportScope(db, user, parsed.data.branch_id);
      const since = localPeriodStart(db, scope.timezone, parsed.data.days);

      const rows = await db("order_items as i")
        .join("orders as o", "o.id", "i.order_id")
        .where("o.account_id", user.accountId)
        .where("o.created_at", ">=", since)
        .whereNot("o.status", "cancelled")
        .modify((qb) => applyBranch(qb, "o.branch_id", scope.branchId))
        .select("i.name_ar")
        .sum("i.qty as qty")
        .sum("i.line_total as total")
        .groupBy("i.name_ar")
        .orderBy("qty", "desc")
        .limit(10);

      const data: TopProductReportRow[] = rows.map((row) => ({
        name_ar: String(row.name_ar),
        qty: numberValue(row.qty),
        total: numberValue(row.total),
      }));

      const response: ReportResponse<TopProductReportRow[]> = {
        data,
        meta: reportMeta("sales.top_products", scope, {
          days: parsed.data.days,
          branch_id: scope.branchId,
        }),
      };
      res.json(response);
    } catch (error) {
      next(error);
    }
  });

  router.get("/payment-methods", async (req, res, next) => {
    try {
      const parsed = periodQuery.safeParse(req.query);
      if (!parsed.success) throw err.validation(parsed.error.flatten());

      const user = req.user!;
      const scope = await resolveReportScope(db, user, parsed.data.branch_id);
      const since = localPeriodStart(db, scope.timezone, parsed.data.days);

      const rows = await db("payments as p")
        .join("orders as o", "o.id", "p.order_id")
        .where("o.account_id", user.accountId)
        .where("p.created_at", ">=", since)
        .modify((qb) => applyBranch(qb, "o.branch_id", scope.branchId))
        .select("p.method")
        .sum("p.amount as total")
        .count("p.id as count")
        .groupBy("p.method")
        .orderBy("total", "desc");

      const data: PaymentMethodReportRow[] = rows.map((row) => ({
        method: String(row.method),
        total: numberValue(row.total),
        count: numberValue(row.count),
      }));

      const response: ReportResponse<PaymentMethodReportRow[]> = {
        data,
        meta: reportMeta("sales.payment_methods", scope, {
          days: parsed.data.days,
          branch_id: scope.branchId,
        }),
      };
      res.json(response);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
