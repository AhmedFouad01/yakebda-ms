import { Router } from "express";
import { z } from "zod";
import { Knex } from "knex";
import { err } from "../lib/errors";
import { newId } from "../lib/ids";
import { requirePermission, requireUser } from "../middleware/auth";
import { ar } from "../i18n/ar";

/** YKMS-02 — Tables (light), Customers (light), Reports. Account-scoped throughout. */

const TABLE_STATUSES = ["available", "occupied", "reserved", "cleaning"] as const;

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

  r.get("/", async (req, res, next) => {
    try {
      const q = z.object({ search: z.string().optional() }).safeParse(req.query);
      const rows = await db("customers")
        .where({ account_id: req.user!.accountId })
        .modify((qb) => {
          if (q.success && q.data.search) {
            qb.where((w) =>
              w.where("name", "ilike", `%${q.data.search}%`).orWhere("phone", "ilike", `%${q.data.search}%`)
            );
          }
        })
        .orderBy("created_at", "desc")
        .limit(200);
      res.json({ data: rows });
    } catch (e) {
      next(e);
    }
  });

  r.post("/", requirePermission("customers.manage"), async (req, res, next) => {
    try {
      const body = z
        .object({
          name: z.string().min(1),
          phone: z.string().optional().nullable(),
          address: z.string().optional().nullable(),
          notes: z.string().optional().nullable(),
        })
        .safeParse(req.body);
      if (!body.success) throw err.validation(body.error.flatten());
      const id = newId();
      await db("customers").insert({ id, account_id: req.user!.accountId, ...body.data });
      res.status(201).json({ data: await db("customers").where({ id }).first(), message: ar.messages.created });
    } catch (e) {
      next(e);
    }
  });

  r.patch("/:id", requirePermission("customers.manage"), async (req, res, next) => {
    try {
      const body = z
        .object({
          name: z.string().min(1).optional(),
          phone: z.string().optional().nullable(),
          address: z.string().optional().nullable(),
          notes: z.string().optional().nullable(),
        })
        .safeParse(req.body);
      if (!body.success) throw err.validation(body.error.flatten());
      const row = await db("customers").where({ id: req.params.id, account_id: req.user!.accountId }).first();
      if (!row) throw err.notFound();
      await db("customers").where({ id: row.id }).update({ ...body.data, updated_at: db.fn.now() });
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
