import { Router } from "express";
import { Knex } from "knex";
import { z } from "zod";
import type { CustomerListItem, CustomerSortField, SortDirection } from "@ykms/contracts";
import { CUSTOMER_SORT_FIELDS } from "@ykms/contracts";
import { err } from "../lib/errors";
import { canAccessBranch, requireUser } from "../middleware/auth";
import { createCursorPage, parseCursorPage, type CursorDefinition } from "../lib/cursor";
import { getSettings, Settings } from "./settings";

/**
 * ADR-006 — sortable aggregate customers list.
 * Cursor values carry the primary sort value (v, nullable) + id tie-breaker;
 * the envelope's `sort` string binds field + direction, so a cursor minted
 * under one ordering is rejected under any other (existing P3 check).
 */
const customerSortCursorValues = z.object({
  v: z.union([z.string(), z.number(), z.boolean(), z.null()]),
  id: z.string().uuid(),
}).strict();

type CustomerSortCursorValues = z.infer<typeof customerSortCursorValues>;

interface CustomerReadRow extends Omit<CustomerListItem, "created_at" | "updated_at"> {
  created_at: string | Date;
  updated_at: string | Date;
  orders_count: number | string;
  last_order_at: string | Date | null;
  total_spent: number | string;
  avg_order: number | string | null;
  branch_name: string | null;
  [key: string]: unknown;
}

function customerListCursor(sort: CustomerSortField, direction: SortDirection): CursorDefinition<CustomerSortCursorValues> {
  return {
    endpoint: "customers.list",
    sort: `${sort}_${direction}`,
    values: customerSortCursorValues,
  };
}

function customerCursorTimestamp(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

/**
 * Sortable column expressions over the aggregate join. All values the
 * whitelist exposes; aggregates coalesce to 0 so only phone/last_order_at/
 * avg_order/branch can be null (ordered NULLS LAST deterministically).
 */
const CUSTOMER_SORT_EXPRESSIONS: Record<CustomerSortField, { sql: string; nullable: boolean }> = {
  name: { sql: "c.name", nullable: false },
  phone: { sql: "c.phone", nullable: true },
  orders_count: { sql: "coalesce(agg.orders_count, 0)", nullable: false },
  last_order_at: { sql: "agg.last_order_at", nullable: true },
  total_spent: { sql: "coalesce(agg.total_spent, 0)", nullable: false },
  avg_order: { sql: "agg.avg_order", nullable: true },
  branch: { sql: "b.name", nullable: true },
  status: { sql: "c.is_blocked", nullable: false },
  created_at: { sql: "c.created_at", nullable: false },
};

/** Keyset predicate implementing `<expr> <dir> NULLS LAST, id <dir>` after (v, id). */
function applyCustomerSortCursor(
  qb: Knex.QueryBuilder,
  sort: CustomerSortField,
  direction: SortDirection,
  cursor: CustomerSortCursorValues | null
): void {
  if (!cursor) return;
  const { sql, nullable } = CUSTOMER_SORT_EXPRESSIONS[sort];
  const cmp = direction === "desc" ? "<" : ">";
  const idCmp = cmp;
  if (cursor.v === null) {
    // Cursor row had a null sort value ⇒ we are inside the trailing null block.
    qb.whereRaw(`${sql} is null`).andWhereRaw(`c.id ${idCmp} ?`, [cursor.id]);
    return;
  }
  qb.where((page) => {
    page
      .whereRaw(`${sql} ${cmp} ?`, [cursor.v])
      .orWhere((tie) => tie.whereRaw(`${sql} = ?`, [cursor.v]).andWhereRaw(`c.id ${idCmp} ?`, [cursor.id]));
    if (nullable) page.orWhereRaw(`${sql} is null`); // nulls sort last in both directions
  });
}

function parseCustomerSort(query: Record<string, unknown>): { sort: CustomerSortField; direction: SortDirection } {
  const parsed = z
    .object({
      sort: z.enum(CUSTOMER_SORT_FIELDS).default("created_at"),
      direction: z.enum(["asc", "desc"]).default("desc"),
    })
    .safeParse({ sort: query.sort ?? undefined, direction: query.direction ?? undefined });
  if (!parsed.success) throw err.validation({ sort: "حقل الترتيب غير مدعوم" });
  return parsed.data;
}

const SETTINGS_RUNTIME_KEYS: Array<keyof Settings> = [
  "show_product_images",
  "require_open_shift_for_cash",
  "enabled_payment_methods",
  "receipt_printing_enabled",
  "allow_discounts",
  "order_type_takeaway_enabled",
  "order_type_delivery_enabled",
  "order_type_dine_in_enabled",
  "default_delivery_fee",
  "min_delivery_order",
  "max_discount_without_manager",
  "max_cashier_discount_percent",
  "discount_reason_required",
  "vat_enabled",
  "vat_percentage",
  "prices_include_vat",
  "service_fee_enabled",
  "service_fee_type",
  "service_fee_value",
  "rounding_rule",
  "require_customer_for_delivery",
  "require_address_for_delivery",
  "kds_enabled",
  "kds_warning_minutes",
  "kds_late_minutes",
  "kds_hide_ready_after_minutes",
  "kds_sound_alert",
];

function hasAnyPermission(permissions: string[], ...keys: string[]): boolean {
  return keys.some((key) => permissions.includes(key));
}

/**
 * Owns GET /settings before the legacy settings router.
 * Managers receive the full document. POS/KDS roles receive a fixed runtime projection only.
 */
export function settingsReadRoutes(db: Knex): Router {
  const router = Router();

  router.get("/", requireUser(db), async (req, res, next) => {
    try {
      const parsed = z.object({ branch_id: z.string().uuid().optional() }).safeParse(req.query);
      if (!parsed.success) throw err.validation(parsed.error.flatten());

      const fullAccess = hasAnyPermission(
        req.user!.permissions,
        "settings.view",
        "settings.manage"
      );
      const runtimeAccess = hasAnyPermission(
        req.user!.permissions,
        "orders.create",
        "kitchen.view"
      );
      if (!fullAccess && !runtimeAccess) throw err.forbidden();

      const branchId = parsed.data.branch_id ?? req.user!.branchId ?? undefined;
      if (branchId) {
        const branch = await db("branches")
          .where({ id: branchId, account_id: req.user!.accountId, is_active: true })
          .first();
        if (!branch) throw err.notFound();
        if (!canAccessBranch(req.user!, branch.id)) throw err.forbidden();
      }

      const settings = await getSettings(db, req.user!.accountId, branchId);
      if (fullAccess) {
        res.json({ data: settings });
        return;
      }

      const runtime = Object.fromEntries(
        SETTINGS_RUNTIME_KEYS.map((key) => [key, settings[key]])
      );
      res.json({ data: runtime });
    } catch (error) {
      next(error);
    }
  });

  return router;
}

/** Full CRM list gate. The lightweight /lookup route remains available to POS lookup roles. */
export function customerReadRoutes(db: Knex): Router {
  const router = Router();

  router.get("/", requireUser(db), async (req, res, next) => {
    try {
      const canView = hasAnyPermission(
        req.user!.permissions,
        "customers.view",
        "customers.manage"
      );
      if (!canView) throw err.forbidden();

      const parsed = z.object({ search: z.string().optional() }).safeParse(req.query);
      if (!parsed.success) throw err.validation(parsed.error.flatten());
      const { sort, direction } = parseCustomerSort(req.query as Record<string, unknown>);
      const definition = customerListCursor(sort, direction);
      const page = parseCursorPage(req.query, definition);
      const accountId = req.user!.accountId;
      const sortExpr = CUSTOMER_SORT_EXPRESSIONS[sort];

      // ADR-006: one aggregate subquery (account-scoped, non-cancelled) — no N+1.
      const aggregates = db("orders")
        .where("account_id", accountId)
        .whereNot("status", "cancelled")
        .whereNotNull("customer_id")
        .groupBy("customer_id")
        .select(
          "customer_id",
          db.raw("count(*)::int as orders_count"),
          db.raw("max(created_at) as last_order_at"),
          db.raw("coalesce(sum(total) filter (where status = 'completed'), 0) as total_spent"),
          db.raw(`case when count(*) filter (where status = 'completed') > 0
                    then round(sum(total) filter (where status = 'completed')
                               / count(*) filter (where status = 'completed'), 2)
                    end as avg_order`),
          db.raw("(array_agg(branch_id order by created_at desc))[1] as last_branch_id")
        )
        .as("agg");

      const rows: CustomerReadRow[] = await db("customers as c")
        .leftJoin(aggregates, "agg.customer_id", "c.id")
        .leftJoin("branches as b", "b.id", "agg.last_branch_id")
        .where("c.account_id", accountId)
        .modify((query) => {
          const search = parsed.data.search?.trim();
          if (search) {
            query.where((where) =>
              where
                .where("c.name", "ilike", `%${search}%`)
                .orWhere("c.phone", "ilike", `%${search}%`)
                .orWhere("c.alt_phone", "ilike", `%${search}%`)
            );
          }
          // P3 latent fix: the cursor now applies with AND without search.
          applyCustomerSortCursor(query, sort, direction, page.cursor);
        })
        .select(
          "c.*",
          db.raw("coalesce(agg.orders_count, 0)::int as orders_count"),
          "agg.last_order_at",
          db.raw("coalesce(agg.total_spent, 0) as total_spent"),
          "agg.avg_order",
          "b.name as branch_name"
        )
        .orderByRaw(`${sortExpr.sql} ${direction} nulls last`)
        .orderBy("c.id", direction)
        .limit(page.limit + 1);

      const cursorValue = (row: CustomerReadRow): CustomerSortCursorValues => {
        switch (sort) {
          case "created_at":
            return { v: customerCursorTimestamp(row.created_at), id: row.id };
          case "last_order_at":
            return { v: row.last_order_at ? customerCursorTimestamp(row.last_order_at) : null, id: row.id };
          case "orders_count":
            return { v: Number(row.orders_count), id: row.id };
          case "total_spent":
            return { v: Number(row.total_spent), id: row.id };
          case "avg_order":
            return { v: row.avg_order === null ? null : Number(row.avg_order), id: row.id };
          case "branch":
            return { v: row.branch_name, id: row.id };
          case "status":
            return { v: Boolean(row.is_blocked), id: row.id };
          case "phone":
            return { v: (row.phone as string | null) ?? null, id: row.id };
          case "name":
          default:
            return { v: row.name as string, id: row.id };
        }
      };

      const result = createCursorPage(rows, page.limit, definition, cursorValue);
      res.json({
        ...result,
        data: result.data.map((row) => ({
          ...row,
          orders_count: Number(row.orders_count),
          total_spent: Number(row.total_spent),
          avg_order: row.avg_order === null ? null : Number(row.avg_order),
          last_order_at: row.last_order_at ? customerCursorTimestamp(row.last_order_at) : null,
        })),
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
