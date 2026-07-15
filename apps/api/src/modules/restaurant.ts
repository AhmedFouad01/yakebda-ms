import { Router } from "express";
import { z } from "zod";
import { Knex } from "knex";
import { err } from "../lib/errors";
import { newId } from "../lib/ids";
import { requirePermission, requireUser } from "../middleware/auth";
import { ar } from "../i18n/ar";
import { createCursorPage, parseCursorPage, type CursorDefinition } from "../lib/cursor";

/** YKMS-02 — Tables (light), Customers (light), Reports. Account-scoped throughout. */

const TABLE_STATUSES = ["available", "occupied", "reserved", "cleaning"] as const;

const createdAtCursorValues = z.object({
  created_at: z.string().datetime(),
  id: z.string().uuid(),
}).strict();

type CreatedAtCursorValues = z.infer<typeof createdAtCursorValues>;

interface CreatedAtRow {
  id: string;
  created_at: string | Date;
}

interface CustomerLookupRow extends CreatedAtRow {
  name: string;
  phone: string | null;
  alt_phone: string | null;
  address: string | null;
  addresses: unknown;
}

interface CustomerOrderRow extends CreatedAtRow {
  order_no: number;
  order_prefix: string | null;
  order_type: string;
  status: string;
  total: string | number;
}

const customerLookupCursor: CursorDefinition<CreatedAtCursorValues> = {
  endpoint: "customers.lookup",
  sort: "created_at_desc_id_desc",
  values: createdAtCursorValues,
};

const customerListCursor: CursorDefinition<CreatedAtCursorValues> = {
  endpoint: "customers.list",
  sort: "created_at_desc_id_desc",
  values: createdAtCursorValues,
};

const customerOrdersCursor: CursorDefinition<CreatedAtCursorValues> = {
  endpoint: "customers.orders",
  sort: "created_at_desc_id_desc",
  values: createdAtCursorValues,
};

function cursorTimestamp(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function applyCreatedAtCursor(qb: Knex.QueryBuilder, cursor: CreatedAtCursorValues | null): void {
  if (!cursor) return;
  qb.where((page) => {
    page
      .where("created_at", "<", cursor.created_at)
      .orWhere((tie) => tie.where("created_at", cursor.created_at).andWhere("id", "<", cursor.id));
  });
}

export function tableRoutes(db: Knex): Router {
  const r = Router();
  r.use(requireUser(db));

  r.get("/", async (req, res, next) => {
    try {
      const q = z.object({ branch_id: z.string().uuid().optional() }).safeParse(req.query);
      if (!q.success) throw err.validation(q.error.flatten());
      const rows = await db("dining_tables as t")
        .join("branches as b", "b.id", "t.branch_id")
        .where("b.account_id", req.user!.accountId)
        .modify((qb) => {
          if (q.data.branch_id) qb.where("t.branch_id", q.data.branch_id);
        })
        .select("t.*", "b.name as branch_name")
        .orderBy("t.name_ar", "asc");
      res.json({ data: rows });
    } catch (e) {
      next(e);
    }
  });

  r.post("/", requirePermission("tables.manage"), async (req, res, next) => {
    try {
      const body = z
        .object({
          branch_id: z.string().uuid(),
          name_ar: z.string().min(1),
          seats: z.number().int().min(1).default(4),
        })
        .safeParse(req.body);
      if (!body.success) throw err.validation(body.error.flatten());
      const branch = await db("branches")
        .where({ id: body.data.branch_id, account_id: req.user!.accountId })
        .first();
      if (!branch) throw err.notFound();
      const id = newId();
      await db("dining_tables").insert({ id, ...body.data });
      res.status(201).json({ data: await db("dining_tables").where({ id }).first(), message: ar.messages.created });
    } catch (e) {
      next(e);
    }
  });

  r.patch("/:id", requirePermission("tables.manage"), async (req, res, next) => {
    try {
      const body = z
        .object({
          name_ar: z.string().min(1).optional(),
          seats: z.number().int().min(1).optional(),
          status: z.enum(TABLE_STATUSES).optional(),
          is_active: z.boolean().optional(),
        })
        .safeParse(req.body);
      if (!body.success) throw err.validation(body.error.flatten());
      const row = await db("dining_tables as t")
        .join("branches as b", "b.id", "t.branch_id")
        .where("t.id", req.params.id)
        .where("b.account_id", req.user!.accountId)
        .select("t.*")
        .first();
      if (!row) throw err.notFound();
      await db("dining_tables").where({ id: row.id }).update({ ...body.data, updated_at: db.fn.now() });
      res.json({ data: await db("dining_tables").where({ id: row.id }).first(), message: ar.messages.updated });
    } catch (e) {
      next(e);
    }
  });

  return r;
}

export function customerRoutes(db: Knex): Router {
  const r = Router();
  r.use(requireUser(db));

  // مخطط مشترك للحقول القابلة للتعديل (كلها اختيارية للـ patch)
  const customerFields = {
    name: z.string().min(1),
    phone: z.string().optional().nullable(),
    alt_phone: z.string().optional().nullable(),
    email: z.string().email().optional().nullable().or(z.literal("")),
    address: z.string().optional().nullable(),
    addresses: z.array(z.object({
      label: z.string().optional().nullable(),
      area: z.string().optional().nullable(),
      landmark: z.string().optional().nullable(),
      floor: z.string().optional().nullable(),
      notes: z.string().optional().nullable(),
      is_default: z.boolean().optional(),
    })).optional().nullable(),
    birthday: z.string().optional().nullable(),
    gender: z.enum(["male", "female"]).optional().nullable(),
    preferred_language: z.string().optional().nullable(),
    preferred_order_type: z.enum(["takeaway", "delivery"]).optional().nullable(),
    preferred_payment_method: z.enum(["cash", "card", "wallet"]).optional().nullable(),
    marketing_opt_in: z.boolean().optional(),
    sms_opt_in: z.boolean().optional(),
    whatsapp_opt_in: z.boolean().optional(),
    is_blocked: z.boolean().optional(),
    block_reason: z.string().optional().nullable(),
    is_vip: z.boolean().optional(),
    tags: z.string().optional().nullable(),
    allergy_note: z.string().optional().nullable(),
    delivery_instructions: z.string().optional().nullable(),
    notes: z.string().optional().nullable(),
  };

  function normalize(data: Record<string, unknown>): Record<string, unknown> {
    const out = { ...data };
    if (out.email === "") out.email = null;
    if (out.addresses != null) out.addresses = JSON.stringify(out.addresses);
    return out;
  }

  // Minimal POS lookup. Full CRM fields remain protected by customers.manage.
  r.get("/lookup", requirePermission("customers.lookup"), async (req, res, next) => {
    try {
      const q = z.object({ search: z.string().optional() }).safeParse(req.query);
      if (!q.success) throw err.validation(q.error.flatten());
      const page = parseCursorPage(req.query, customerLookupCursor);
      const rows: CustomerLookupRow[] = await db("customers")
        .where({ account_id: req.user!.accountId })
        .modify((qb) => {
          if (q.data.search) {
            qb.where((w) =>
              w
                .where("name", "ilike", `%${q.data.search}%`)
                .orWhere("phone", "ilike", `%${q.data.search}%`)
                .orWhere("alt_phone", "ilike", `%${q.data.search}%`)
            );
          }
          applyCreatedAtCursor(qb, page.cursor);
        })
        .select("id", "name", "phone", "alt_phone", "address", "addresses", "created_at")
        .orderBy("created_at", "desc")
        .orderBy("id", "desc")
        .limit(page.limit + 1);
      const result = createCursorPage(rows, page.limit, customerLookupCursor, (row) => ({
        created_at: cursorTimestamp(row.created_at),
        id: row.id,
      }));
      res.json({
        ...result,
        data: result.data.map(({ created_at: _createdAt, ...row }) => row),
      });
    } catch (e) {
      next(e);
    }
  });

  r.get("/", requirePermission("customers.manage"), async (req, res, next) => {
    try {
      const q = z.object({ search: z.string().optional() }).safeParse(req.query);
      const page = parseCursorPage(req.query, customerListCursor);
      // DTO خفيف للقائمة — بلا تحليلات ثقيلة لكل صف
      const rows: CreatedAtRow[] = await db("customers")
        .where({ account_id: req.user!.accountId })
        .modify((qb) => {
          if (q.success && q.data.search) {
            qb.where((w) =>
              w
                .where("name", "ilike", `%${q.data.search}%`)
                .orWhere("phone", "ilike", `%${q.data.search}%`)
                .orWhere("alt_phone", "ilike", `%${q.data.search}%`)
            );
          }
          applyCreatedAtCursor(qb, page.cursor);
        })
        .orderBy("created_at", "desc")
        .orderBy("id", "desc")
        .limit(page.limit + 1);
      res.json(createCursorPage(rows, page.limit, customerListCursor, (row) => ({
        created_at: cursorTimestamp(row.created_at),
        id: row.id,
      })));
    } catch (e) {
      next(e);
    }
  });

  // YKMS-02G-D — ملف العميل الكامل مع تحليلات مجمّعة (استعلام واحد للإجماليات).
  r.get("/:id", requirePermission("customers.manage"), async (req, res, next) => {
    try {
      const accountId = req.user!.accountId;
      const customer = await db("customers").where({ id: req.params.id, account_id: accountId }).first();
      if (!customer) throw err.notFound();

      // تحليلات مجمّعة (لا حساب لكل صف): إجماليات الطلبات المكتملة
      const agg = await db("orders")
        .where({ account_id: accountId, customer_id: customer.id })
        .select(
          db.raw("count(*)::int as total_orders"),
          db.raw("count(*) filter (where status = 'completed')::int as completed_orders"),
          db.raw("count(*) filter (where status = 'cancelled')::int as cancelled_orders"),
          db.raw("coalesce(sum(total) filter (where status = 'completed'), 0) as total_spend"),
          db.raw("min(created_at) as first_order_at"),
          db.raw("max(created_at) as last_order_at")
        )
        .first();

      const totalSpend = Number(agg?.total_spend ?? 0);
      const completedOrders = Number(agg?.completed_orders ?? 0);
      const avgOrderValue = completedOrders ? Math.round((totalSpend / completedOrders) * 100) / 100 : null;

      // الصنف المفضّل: الأكثر تكرارًا في بنود طلبات هذا العميل
      const favProduct = (await db("order_items as oi")
        .join("orders as o", "o.id", "oi.order_id")
        .where({ "o.account_id": accountId, "o.customer_id": customer.id })
        .whereNotIn("o.status", ["cancelled"])
        .select("oi.name_ar")
        .sum({ qty: "oi.qty" })
        .groupBy("oi.name_ar")
        .orderBy("qty", "desc")
        .first()) as { name_ar?: string } | undefined;

      // نوع الطلب المفضّل الفعلي
      const favType = (await db("orders")
        .where({ account_id: accountId, customer_id: customer.id })
        .whereNotIn("status", ["cancelled"])
        .select("order_type")
        .count({ c: "*" })
        .groupBy("order_type")
        .orderBy("c", "desc")
        .first()) as { order_type?: string } | undefined;

      // آخر الأصناف المطلوبة
      const recentItems = await db("order_items as oi")
        .join("orders as o", "o.id", "oi.order_id")
        .where({ "o.account_id": accountId, "o.customer_id": customer.id })
        .orderBy("oi.created_at", "desc")
        .limit(8)
        .select("oi.name_ar", "oi.variant_name_ar", "oi.qty", "oi.created_at");

      const daysSinceLast = agg?.last_order_at
        ? Math.floor((Date.now() - new Date(agg.last_order_at as string).getTime()) / 86400000)
        : null;

      res.json({
        data: {
          ...customer,
          addresses: customer.addresses ?? null,
          analytics: {
            total_orders: Number(agg?.total_orders ?? 0),
            completed_orders: completedOrders,
            cancelled_orders: Number(agg?.cancelled_orders ?? 0),
            total_spend: totalSpend,
            avg_order_value: avgOrderValue,
            first_order_at: agg?.first_order_at ?? null,
            last_order_at: agg?.last_order_at ?? null,
            days_since_last_order: daysSinceLast,
            favourite_product: favProduct?.name_ar ?? null,
            preferred_order_type_actual: favType?.order_type ?? null,
            recent_items: recentItems,
          },
        },
      });
    } catch (e) {
      next(e);
    }
  });

  // YKMS-02G-D — سجل طلبات العميل (مصفح، DTO خفيف)
  r.get("/:id/orders", requirePermission("customers.manage"), async (req, res, next) => {
    try {
      const accountId = req.user!.accountId;
      const customer = await db("customers").where({ id: req.params.id, account_id: accountId }).first();
      if (!customer) throw err.notFound();
      const page = parseCursorPage(req.query, customerOrdersCursor, { defaultLimit: 20, maximumLimit: 50 });
      const orders: CustomerOrderRow[] = await db("orders")
        .where({ account_id: accountId, customer_id: customer.id })
        .modify((qb) => applyCreatedAtCursor(qb, page.cursor))
        .orderBy("created_at", "desc")
        .orderBy("id", "desc")
        .limit(page.limit + 1)
        .select("id", "order_no", "order_prefix", "order_type", "status", "total", "created_at");
      res.json(createCursorPage(orders, page.limit, customerOrdersCursor, (row) => ({
        created_at: cursorTimestamp(row.created_at),
        id: row.id,
      })));
    } catch (e) {
      next(e);
    }
  });

  r.post("/", requirePermission("customers.manage"), async (req, res, next) => {
    try {
      const body = z.object(customerFields).safeParse(req.body);
      if (!body.success) throw err.validation(body.error.flatten());
      const id = newId();
      await db("customers").insert({ id, account_id: req.user!.accountId, ...normalize(body.data) });
      res.status(201).json({ data: await db("customers").where({ id }).first(), message: ar.messages.created });
    } catch (e) {
      next(e);
    }
  });

  r.patch("/:id", requirePermission("customers.manage"), async (req, res, next) => {
    try {
      const partial = z.object(customerFields).partial();
      const body = partial.safeParse(req.body);
      if (!body.success) throw err.validation(body.error.flatten());
      const row = await db("customers").where({ id: req.params.id, account_id: req.user!.accountId }).first();
      if (!row) throw err.notFound();
      await db("customers").where({ id: row.id }).update({ ...normalize(body.data), updated_at: db.fn.now() });
      res.json({ data: await db("customers").where({ id: row.id }).first(), message: ar.messages.updated });
    } catch (e) {
      next(e);
    }
  });

  return r;
}

export function reportRoutes(db: Knex): Router {
  const r = Router();
  r.use(requireUser(db));
  r.use(requirePermission("reports.view"));

  const startOfToday = () => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  };

  // GET /summary — dashboard numbers
  r.get("/summary", async (req, res, next) => {
    try {
      const acc = req.user!.accountId;
      const today = startOfToday();
      const [sales] = await db("payments as p")
        .join("orders as o", "o.id", "p.order_id")
        .where("o.account_id", acc)
        .where("p.created_at", ">=", today)
        .whereNot("p.method", "unpaid")
        .sum("p.amount as total");
      const [ordersToday] = await db("orders")
        .where({ account_id: acc })
        .where("created_at", ">=", today)
        .count("id as c");
      const [openOrders] = await db("orders")
        .where({ account_id: acc })
        .whereIn("status", ["submitted", "in_kitchen", "ready"])
        .count("id as c");
      const [kitchenPending] = await db("orders")
        .where({ account_id: acc })
        .whereIn("status", ["submitted", "in_kitchen"])
        .count("id as c");
      const [cancelled] = await db("orders")
        .where({ account_id: acc, status: "cancelled" })
        .where("created_at", ">=", today)
        .count("id as c");
      const [openShifts] = await db("shifts")
        .where({ account_id: acc, status: "open" })
        .count("id as c");
      const [cashExpected] = await db("shifts as s")
        .leftJoin("payments as p", function () {
          this.on("p.shift_id", "=", "s.id").andOn("p.method", "=", db.raw("?", ["cash"]));
        })
        .where("s.account_id", acc)
        .where("s.status", "open")
        .sum("p.amount as cash_sales");
      res.json({
        data: {
          sales_today: Number(sales.total ?? 0),
          orders_today: Number(ordersToday.c),
          open_orders: Number(openOrders.c),
          kitchen_pending: Number(kitchenPending.c),
          cancelled_today: Number(cancelled.c),
          open_shifts: Number(openShifts.c),
          open_shift_cash_sales: Number(cashExpected.cash_sales ?? 0),
        },
      });
    } catch (e) {
      next(e);
    }
  });

  // GET /sales?days=7 — sales by day and by branch
  r.get("/sales", async (req, res, next) => {
    try {
      const q = z.object({ days: z.coerce.number().int().min(1).max(90).default(7) }).safeParse(req.query);
      if (!q.success) throw err.validation(q.error.flatten());
      const since = new Date();
      since.setDate(since.getDate() - q.data.days);
      since.setHours(0, 0, 0, 0);
      const byDay = await db("payments as p")
        .join("orders as o", "o.id", "p.order_id")
        .where("o.account_id", req.user!.accountId)
        .where("p.created_at", ">=", since)
        .whereNot("p.method", "unpaid")
        .select(db.raw("date(p.created_at) as day"))
        .sum("p.amount as total")
        .groupByRaw("date(p.created_at)")
        .orderBy("day", "asc");
      const byBranch = await db("payments as p")
        .join("orders as o", "o.id", "p.order_id")
        .join("branches as b", "b.id", "o.branch_id")
        .where("o.account_id", req.user!.accountId)
        .where("p.created_at", ">=", since)
        .whereNot("p.method", "unpaid")
        .select("b.name as branch")
        .sum("p.amount as total")
        .groupBy("b.name");
      res.json({ data: { by_day: byDay, by_branch: byBranch } });
    } catch (e) {
      next(e);
    }
  });

  // GET /top-products
  r.get("/top-products", async (req, res, next) => {
    try {
      const rows = await db("order_items as i")
        .join("orders as o", "o.id", "i.order_id")
        .where("o.account_id", req.user!.accountId)
        .whereNot("o.status", "cancelled")
        .select("i.name_ar")
        .sum("i.qty as qty")
        .sum("i.line_total as total")
        .groupBy("i.name_ar")
        .orderBy("qty", "desc")
        .limit(10);
      res.json({ data: rows });
    } catch (e) {
      next(e);
    }
  });

  // GET /payment-methods
  r.get("/payment-methods", async (req, res, next) => {
    try {
      const rows = await db("payments as p")
        .join("orders as o", "o.id", "p.order_id")
        .where("o.account_id", req.user!.accountId)
        .select("p.method")
        .sum("p.amount as total")
        .count("p.id as count")
        .groupBy("p.method");
      res.json({ data: rows });
    } catch (e) {
      next(e);
    }
  });

  return r;
}
