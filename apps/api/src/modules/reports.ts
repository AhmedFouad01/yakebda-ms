import { randomUUID } from "node:crypto";
import { Router } from "express";
import { Knex } from "knex";
import { z } from "zod";
import type {
  PaymentMethodReportRow,
  ReportResponse,
  ReportResponseMeta,
  ReportSummary,
  SalesByBranchReportData,
  SalesByBranchRow,
  SalesByDayRow,
  SalesBySourceReportData,
  SalesBySourceRow,
  SalesTrendReportData,
  TopProductReportRow,
} from "@ykms/contracts";
import { err } from "../lib/errors";
import {
  canAccessBranch,
  hasPermission,
  requirePermission,
  requireUser,
  type AuthUser,
} from "../middleware/auth";
import {
  ACTIVE_REPORT_CATALOG,
  getReportDefinition,
} from "./reportCatalog";

const ACCOUNT_REPORTING_TIMEZONE = "Africa/Cairo";
const CURRENCY = "EGP" as const;

const scopeQuery = z.object({
  branch_id: z.string().uuid().optional(),
});

const periodQuery = scopeQuery.extend({
  days: z.coerce.number().int().refine((value) => [7, 30, 90].includes(value), {
    message: "Supported report periods are 7, 30, or 90 days",
  }).default(30),
});

interface ReportScope {
  branchIds: string[];
  selectedBranchId: string | null;
  timezone: string;
  timezonePolicy: "branch" | "account_default";
}

async function resolveReportScope(
  db: Knex,
  user: AuthUser,
  requestedBranchId?: string
): Promise<ReportScope> {
  const selectedBranchId = requestedBranchId ?? user.branchId ?? null;
  if (selectedBranchId) {
    if (!canAccessBranch(user, selectedBranchId)) throw err.forbidden();
    const branch = await db("branches")
      .where({
        id: selectedBranchId,
        account_id: user.accountId,
        is_active: true,
      })
      .select("id", "timezone")
      .first();
    if (!branch) throw err.notFound();
    return {
      branchIds: [branch.id],
      selectedBranchId: branch.id,
      timezone: branch.timezone || ACCOUNT_REPORTING_TIMEZONE,
      timezonePolicy: "branch",
    };
  }

  const branches = await db("branches")
    .where({ account_id: user.accountId, is_active: true })
    .select("id");

  return {
    branchIds: branches.map((branch) => String(branch.id)),
    selectedBranchId: null,
    timezone: ACCOUNT_REPORTING_TIMEZONE,
    timezonePolicy: "account_default",
  };
}

function responseMeta(
  reportId: string,
  scope: ReportScope,
  user: AuthUser,
  filters: { days?: number; branch_id?: string | null }
): ReportResponseMeta {
  const definition = getReportDefinition(reportId);
  return {
    request_id: randomUUID(),
    report_id: reportId,
    query_version: definition.query_version,
    generated_at: new Date().toISOString(),
    generated_by_user_id: user.id,
    timezone: scope.timezone,
    timezone_policy: scope.timezonePolicy,
    currency: CURRENCY,
    effective_scope: {
      account_id: user.accountId,
      branch_ids: scope.branchIds,
    },
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

function applyBranchScope(
  qb: Knex.QueryBuilder,
  column: string,
  branchIds: string[]
): void {
  qb.whereIn(column, branchIds);
}

function aggregateNumber(value: unknown, emptyValue = 0): number {
  if (value == null) return emptyValue;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid numeric aggregate: ${String(value)}`);
  }
  return parsed;
}

function reportPermission(reportId: string) {
  return requirePermission(...getReportDefinition(reportId).required_permissions);
}

export function reportRoutes(db: Knex): Router {
  const router = Router();
  router.use(requireUser(db));

  router.get("/catalog", (req, res) => {
    const user = req.user!;
    res.json({
      data: ACTIVE_REPORT_CATALOG.filter((definition) =>
        definition.required_permissions.every((permission) => hasPermission(user, permission))
      ),
    });
  });

  router.get("/summary", reportPermission("sales.summary"), async (req, res, next) => {
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
        .modify((qb) => applyBranchScope(qb, "o.branch_id", scope.branchIds))
        .sum("p.amount as total")
        .first();

      const ordersTodayQuery = db("orders")
        .where({ account_id: user.accountId })
        .where("created_at", ">=", today)
        .modify((qb) => applyBranchScope(qb, "branch_id", scope.branchIds))
        .count("id as c")
        .first();

      const openOrdersQuery = db("orders")
        .where({ account_id: user.accountId })
        .whereIn("status", ["submitted", "in_kitchen", "ready"])
        .modify((qb) => applyBranchScope(qb, "branch_id", scope.branchIds))
        .count("id as c")
        .first();

      const kitchenPendingQuery = db("orders")
        .where({ account_id: user.accountId })
        .whereIn("status", ["submitted", "in_kitchen"])
        .modify((qb) => applyBranchScope(qb, "branch_id", scope.branchIds))
        .count("id as c")
        .first();

      const cancelledQuery = db("orders")
        .where({ account_id: user.accountId, status: "cancelled" })
        .where("created_at", ">=", today)
        .modify((qb) => applyBranchScope(qb, "branch_id", scope.branchIds))
        .count("id as c")
        .first();

      const openShiftsQuery = db("shifts")
        .where({ account_id: user.accountId, status: "open" })
        .modify((qb) => applyBranchScope(qb, "branch_id", scope.branchIds))
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
        .modify((qb) => applyBranchScope(qb, "s.branch_id", scope.branchIds))
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
        sales_today: aggregateNumber(sales?.total),
        orders_today: aggregateNumber(ordersToday?.c),
        open_orders: aggregateNumber(openOrders?.c),
        kitchen_pending: aggregateNumber(kitchenPending?.c),
        cancelled_today: aggregateNumber(cancelled?.c),
        open_shifts: aggregateNumber(openShifts?.c),
        open_shift_cash_sales: aggregateNumber(cashExpected?.cash_sales),
      };

      const response: ReportResponse<ReportSummary> = {
        data,
        meta: responseMeta("sales.summary", scope, user, {
          branch_id: scope.selectedBranchId,
        }),
      };
      res.json(response);
    } catch (error) {
      next(error);
    }
  });

  router.get("/sales/trend", reportPermission("sales.trend"), async (req, res, next) => {
    try {
      const parsed = periodQuery.safeParse(req.query);
      if (!parsed.success) throw err.validation(parsed.error.flatten());
      const user = req.user!;
      const scope = await resolveReportScope(db, user, parsed.data.branch_id);
      const since = localPeriodStart(db, scope.timezone, parsed.data.days);
      const localDaySql = "date(p.created_at AT TIME ZONE ?)";

      const rows = await db("payments as p")
        .join("orders as o", "o.id", "p.order_id")
        .where("o.account_id", user.accountId)
        .where("p.created_at", ">=", since)
        .whereNot("p.method", "unpaid")
        .modify((qb) => applyBranchScope(qb, "o.branch_id", scope.branchIds))
        .select(db.raw(`${localDaySql} as day`, [scope.timezone]))
        .sum("p.amount as total")
        .groupByRaw(localDaySql, [scope.timezone])
        .orderBy("day", "asc");

      const data: SalesTrendReportData = {
        rows: rows.map((row): SalesByDayRow => ({
          day: String(row.day),
          total: aggregateNumber(row.total),
        })),
      };
      res.json({
        data,
        meta: responseMeta("sales.trend", scope, user, {
          days: parsed.data.days,
          branch_id: scope.selectedBranchId,
        }),
      } satisfies ReportResponse<SalesTrendReportData>);
    } catch (error) {
      next(error);
    }
  });

  router.get("/sales/by-branch", reportPermission("sales.by_branch"), async (req, res, next) => {
    try {
      const parsed = periodQuery.safeParse(req.query);
      if (!parsed.success) throw err.validation(parsed.error.flatten());
      const user = req.user!;
      const scope = await resolveReportScope(db, user, parsed.data.branch_id);
      const since = localPeriodStart(db, scope.timezone, parsed.data.days);

      const rows = await db("payments as p")
        .join("orders as o", "o.id", "p.order_id")
        .join("branches as b", "b.id", "o.branch_id")
        .where("o.account_id", user.accountId)
        .where("p.created_at", ">=", since)
        .whereNot("p.method", "unpaid")
        .modify((qb) => applyBranchScope(qb, "o.branch_id", scope.branchIds))
        .select("b.id as branch_id", "b.name as branch")
        .sum("p.amount as total")
        .groupBy("b.id", "b.name")
        .orderBy("total", "desc");

      const data: SalesByBranchReportData = {
        rows: rows.map((row): SalesByBranchRow => ({
          branch_id: String(row.branch_id),
          branch: String(row.branch),
          total: aggregateNumber(row.total),
        })),
      };
      res.json({
        data,
        meta: responseMeta("sales.by_branch", scope, user, {
          days: parsed.data.days,
          branch_id: scope.selectedBranchId,
        }),
      } satisfies ReportResponse<SalesByBranchReportData>);
    } catch (error) {
      next(error);
    }
  });

  router.get("/sales/by-source", reportPermission("sales.by_source"), async (req, res, next) => {
    try {
      const parsed = periodQuery.safeParse(req.query);
      if (!parsed.success) throw err.validation(parsed.error.flatten());
      const user = req.user!;
      const scope = await resolveReportScope(db, user, parsed.data.branch_id);
      const since = localPeriodStart(db, scope.timezone, parsed.data.days);

      const rows = await db("payments as p")
        .join("orders as o", "o.id", "p.order_id")
        .leftJoin("order_sources as os", "os.id", "o.source_id")
        .where("o.account_id", user.accountId)
        .where("p.created_at", ">=", since)
        .whereNot("p.method", "unpaid")
        .modify((qb) => applyBranchScope(qb, "o.branch_id", scope.branchIds))
        .select("o.source_id")
        .select(
          db.raw(
            "(array_agg(coalesce(o.source_name_snapshot, os.name_ar, ?) order by o.created_at desc))[1] as source",
            ["غير محدد"]
          )
        )
        .sum("p.amount as total")
        .groupBy("o.source_id")
        .orderBy("total", "desc");

      const data: SalesBySourceReportData = {
        rows: rows.map((row): SalesBySourceRow => ({
          source_id: row.source_id ? String(row.source_id) : null,
          source: String(row.source),
          total: aggregateNumber(row.total),
        })),
      };
      res.json({
        data,
        meta: responseMeta("sales.by_source", scope, user, {
          days: parsed.data.days,
          branch_id: scope.selectedBranchId,
        }),
      } satisfies ReportResponse<SalesBySourceReportData>);
    } catch (error) {
      next(error);
    }
  });

  router.get("/top-products", reportPermission("sales.top_products"), async (req, res, next) => {
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
        .modify((qb) => applyBranchScope(qb, "o.branch_id", scope.branchIds))
        .select("i.product_id")
        .select(db.raw("(array_agg(i.name_ar order by i.created_at desc))[1] as name_ar"))
        .sum("i.qty as qty")
        .sum("i.line_total as gross_item_sales")
        .groupBy("i.product_id")
        .orderBy("qty", "desc")
        .limit(10);

      const data: TopProductReportRow[] = rows.map((row) => ({
        product_id: String(row.product_id),
        name_ar: String(row.name_ar),
        qty: aggregateNumber(row.qty),
        gross_item_sales: aggregateNumber(row.gross_item_sales),
      }));
      res.json({
        data,
        meta: responseMeta("sales.top_products", scope, user, {
          days: parsed.data.days,
          branch_id: scope.selectedBranchId,
        }),
      } satisfies ReportResponse<TopProductReportRow[]>);
    } catch (error) {
      next(error);
    }
  });

  router.get("/payment-methods", reportPermission("sales.payment_methods"), async (req, res, next) => {
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
        .whereNot("p.method", "unpaid")
        .modify((qb) => applyBranchScope(qb, "o.branch_id", scope.branchIds))
        .select("p.method")
        .sum("p.amount as total")
        .count("p.id as count")
        .groupBy("p.method")
        .orderBy("total", "desc");

      const data: PaymentMethodReportRow[] = rows.map((row) => ({
        method: String(row.method),
        total: aggregateNumber(row.total),
        count: aggregateNumber(row.count),
      }));
      res.json({
        data,
        meta: responseMeta("sales.payment_methods", scope, user, {
          days: parsed.data.days,
          branch_id: scope.selectedBranchId,
        }),
      } satisfies ReportResponse<PaymentMethodReportRow[]>);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
