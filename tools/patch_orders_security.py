from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected one match, found {count}")
    return text.replace(old, new, 1)


path = Path("apps/api/src/modules/orders.ts")
text = path.read_text(encoding="utf-8")

text = replace_once(
    text,
    'import { requirePermission, requireUser } from "../middleware/auth";',
    'import { AuthUser, canAccessBranch, requirePermission, requireUser } from "../middleware/auth";',
    "orders auth imports",
)

text = replace_once(
    text,
    '''  return prefix || null;
}

export function orderRoutes(db: Knex): Router {
''',
    '''  return prefix || null;
}

function canReadOrder(user: AuthUser, order: { branch_id: string; created_by?: string | null }): boolean {
  if (!canAccessBranch(user, order.branch_id)) return false;
  if (user.permissions.includes("orders.manage")) return true;
  return user.permissions.includes("orders.create") && order.created_by === user.id;
}

export function orderRoutes(db: Knex): Router {
''',
    "order access helper",
)

old_list = '''  r.get("/", async (req, res, next) => {
    try {
      const q = z
        .object({
          branch_id: z.string().uuid().optional(),
          status: z.enum(ORDER_STATUSES).optional(),
        })
        .safeParse(req.query);
      if (!q.success) throw err.validation(q.error.flatten());
      const rows = await db("orders")
        .where({ account_id: req.user!.accountId })
        .modify((qb) => {
          if (q.data.branch_id) qb.where("branch_id", q.data.branch_id);
          if (q.data.status) qb.where("status", q.data.status);
        })
        .orderBy("created_at", "desc")
        .limit(200);
      res.json({ data: rows });
    } catch (e) {
      next(e);
    }
  });
'''
new_list = '''  r.get("/", async (req, res, next) => {
    try {
      const q = z
        .object({
          branch_id: z.string().uuid().optional(),
          status: z.enum(ORDER_STATUSES).optional(),
        })
        .safeParse(req.query);
      if (!q.success) throw err.validation(q.error.flatten());

      const canManage = req.user!.permissions.includes("orders.manage");
      const canCreate = req.user!.permissions.includes("orders.create");
      if (!canManage && !canCreate) throw err.forbidden();
      if (q.data.branch_id && !canAccessBranch(req.user!, q.data.branch_id)) throw err.forbidden();

      const rows = await db("orders")
        .where({ account_id: req.user!.accountId })
        .modify((qb) => {
          if (q.data.branch_id) qb.where("branch_id", q.data.branch_id);
          else if (req.user!.branchId && !req.user!.permissions.includes("branches.manage")) {
            qb.where("branch_id", req.user!.branchId);
          }
          if (!canManage) qb.where("created_by", req.user!.id);
          if (q.data.status) qb.where("status", q.data.status);
        })
        .orderBy("created_at", "desc")
        .limit(200);
      res.json({ data: rows });
    } catch (e) {
      next(e);
    }
  });
'''
text = replace_once(text, old_list, new_list, "order list access")

text = replace_once(
    text,
    '''      const branchId = q.data.branch_id ?? req.user!.branchId;
      if (!branchId) throw err.validation({ branch_id: "الفرع مطلوب" });

      const branch = await db("branches")
''',
    '''      const branchId = q.data.branch_id ?? req.user!.branchId;
      if (!branchId) throw err.validation({ branch_id: "الفرع مطلوب" });
      if (!canAccessBranch(req.user!, branchId)) throw err.forbidden();

      const branch = await db("branches")
''',
    "current shift branch access",
)

text = replace_once(
    text,
    '''  r.get("/:id", async (req, res, next) => {
    try {
      const order = await loadFullOrder(db, req.user!.accountId, req.params.id);
      if (!order) throw err.notFound();
      res.json({ data: order });
    } catch (e) {
      next(e);
    }
  });
''',
    '''  r.get("/:id", async (req, res, next) => {
    try {
      const order = await loadFullOrder(db, req.user!.accountId, req.params.id);
      if (!order) throw err.notFound();
      if (!canReadOrder(req.user!, order)) throw err.forbidden();
      res.json({ data: order });
    } catch (e) {
      next(e);
    }
  });
''',
    "order detail access",
)

text = replace_once(
    text,
    '''      const d = body.data;
      const accountId = req.user!.accountId;

      const branch = await db("branches").where({ id: d.branch_id, account_id: accountId }).first();
      if (!branch) throw err.notFound();
''',
    '''      const d = body.data;
      const accountId = req.user!.accountId;
      if (d.payment_method && d.payment_method !== "unpaid" && !req.user!.permissions.includes("payments.record")) {
        throw err.forbidden();
      }

      const branch = await db("branches").where({ id: d.branch_id, account_id: accountId }).first();
      if (!branch) throw err.notFound();
      if (!canAccessBranch(req.user!, branch.id)) throw err.forbidden();
''',
    "order create payment and branch access",
)

text = replace_once(
    text,
    '''      const order = await db("orders").where({ id: req.params.id, account_id: req.user!.accountId }).first();
      if (!order) throw err.notFound();
      // YKMS-02E: إلغاء الطلب قد يتطلب صلاحية مدير حسب الإعدادات
''',
    '''      const order = await db("orders").where({ id: req.params.id, account_id: req.user!.accountId }).first();
      if (!order) throw err.notFound();
      if (!canAccessBranch(req.user!, order.branch_id)) throw err.forbidden();
      // YKMS-02E: إلغاء الطلب قد يتطلب صلاحية مدير حسب الإعدادات
''',
    "order status branch scope",
)

text = replace_once(
    text,
    '''      const order = await db("orders").where({ id: req.params.id, account_id: req.user!.accountId }).first();
      if (!order) throw err.notFound();
      if (order.status === "cancelled") throw err.validation({ status: ar.errors.bad_status_transition });
''',
    '''      const order = await db("orders").where({ id: req.params.id, account_id: req.user!.accountId }).first();
      if (!order) throw err.notFound();
      if (!canAccessBranch(req.user!, order.branch_id)) throw err.forbidden();
      if (order.status === "cancelled") throw err.validation({ status: ar.errors.bad_status_transition });
''',
    "payment branch scope",
)

text = replace_once(
    text,
    '''      const order = await loadFullOrder(db, req.user!.accountId, req.params.id);
      if (!order) throw err.notFound();
      const settings = await getSettings(db, req.user!.accountId, order.branch_id);
''',
    '''      const order = await loadFullOrder(db, req.user!.accountId, req.params.id);
      if (!order) throw err.notFound();
      if (!canAccessBranch(req.user!, order.branch_id)) throw err.forbidden();
      const settings = await getSettings(db, req.user!.accountId, order.branch_id);
''',
    "print branch scope",
)

text = replace_once(
    text,
    '''      const order = await db("orders").where({ id: req.params.id, account_id: req.user!.accountId }).first();
      if (!order) throw err.notFound();
      if (order.order_type !== "delivery") throw err.validation({ order_type: ar.errors.order_type_disabled });
''',
    '''      const order = await db("orders").where({ id: req.params.id, account_id: req.user!.accountId }).first();
      if (!order) throw err.notFound();
      if (!canAccessBranch(req.user!, order.branch_id)) throw err.forbidden();
      if (order.order_type !== "delivery") throw err.validation({ order_type: ar.errors.order_type_disabled });
''',
    "driver assignment branch scope",
)

path.write_text(text, encoding="utf-8")
print("Applied order security patches")
