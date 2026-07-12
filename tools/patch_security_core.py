from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected one match, found {count}")
    return text.replace(old, new, 1)


def replace_expected(text: str, old: str, new: str, expected: int, label: str) -> str:
    count = text.count(old)
    if count != expected:
        raise SystemExit(f"{label}: expected {expected} matches, found {count}")
    return text.replace(old, new)


def edit(path: str, transform) -> None:
    file = Path(path)
    text = file.read_text(encoding="utf-8")
    file.write_text(transform(text), encoding="utf-8")


def patch_auth(text: str) -> str:
    old = '''export function requirePermission(...keys: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const u = req.user;
    if (!u) return next(err.unauthorized());
    const ok = keys.every((k) => u.permissions.includes(k));
    if (!ok) return next(err.forbidden());
    next();
  };
}
'''
    new = old + '''
/** Branch access for operational users. Global users and branch managers may cross branches. */
export function canAccessBranch(user: AuthUser, branchId: string): boolean {
  return user.branchId == null || user.branchId === branchId || user.permissions.includes("branches.manage");
}
'''
    return replace_once(text, old, new, "auth branch helper")


def patch_branches(text: str) -> str:
    old = '''      const rows = await db("branches")
        .where({ account_id: req.user!.accountId })
        .orderBy("created_at", "asc");
'''
    new = '''      const rows = await db("branches")
        .where({ account_id: req.user!.accountId })
        .modify((qb) => {
          if (req.user!.branchId && !req.user!.permissions.includes("branches.manage")) {
            qb.where("id", req.user!.branchId);
          }
        })
        .orderBy("created_at", "asc");
'''
    return replace_once(text, old, new, "branch list scope")


def patch_seed(text: str) -> str:
    text = replace_once(
        text,
        '  { key: "customers.manage", name_ar: "إدارة العملاء", group: "العملاء" },\n',
        '  { key: "customers.lookup", name_ar: "البحث عن العملاء من نقطة البيع", group: "العملاء" },\n'
        '  { key: "customers.manage", name_ar: "إدارة العملاء", group: "العملاء" },\n',
        "customer lookup permission",
    )
    text = replace_once(
        text,
        '      "customers.manage",\n      "reports.view",',
        '      "customers.lookup",\n      "customers.manage",\n      "reports.view",',
        "manager customer lookup",
    )
    text = replace_once(
        text,
        '    perms: ["print_jobs.create", "orders.create", "orders.manage", "payments.record", "shifts.manage", "customers.manage", "reports.view"],',
        '    perms: ["print_jobs.create", "orders.create", "orders.manage", "payments.record", "shifts.manage", "customers.lookup", "reports.view"],',
        "cashier least privilege",
    )
    return text


def patch_me(text: str) -> str:
    text = replace_once(
        text,
        'import { useEffect, useState } from "react";',
        'import { useCallback, useEffect, useState } from "react";',
        "me useCallback import",
    )
    return replace_once(
        text,
        '''  return { me, ready, can: (p: string) => can(me, p) };
}
''',
        '''  const canPermission = useCallback((p: string) => can(me, p), [me]);
  return { me, ready, can: canPermission };
}
''',
        "stable can callback",
    )


def patch_customers(text: str) -> str:
    marker = '''  r.get("/", async (req, res, next) => {
'''
    lookup = '''  // Minimal POS lookup. Full CRM fields remain protected by customers.manage.
  r.get("/lookup", requirePermission("customers.lookup"), async (req, res, next) => {
    try {
      const q = z.object({ search: z.string().optional() }).safeParse(req.query);
      if (!q.success) throw err.validation(q.error.flatten());
      const rows = await db("customers")
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
        })
        .select("id", "name", "phone", "address")
        .orderBy("created_at", "desc")
        .limit(200);
      res.json({ data: rows });
    } catch (e) {
      next(e);
    }
  });

  r.get("/", requirePermission("customers.manage"), async (req, res, next) => {
'''
    text = replace_once(text, marker, lookup, "customer lookup route")
    text = replace_once(
        text,
        '  r.get("/:id", async (req, res, next) => {',
        '  r.get("/:id", requirePermission("customers.manage"), async (req, res, next) => {',
        "customer detail permission",
    )
    text = replace_once(
        text,
        '  r.get("/:id/orders", async (req, res, next) => {',
        '  r.get("/:id/orders", requirePermission("customers.manage"), async (req, res, next) => {',
        "customer order history permission",
    )
    return text


def patch_pos(text: str) -> str:
    old = '''    if (can("customers.manage")) {
      api<{ data: typeof customers }>("/customers")
        .then((response) => setCustomers(response.data))
        .catch(() => {});
    }
'''
    new = '''    if (can("customers.lookup") || can("customers.manage")) {
      api<{ data: typeof customers }>("/customers/lookup")
        .then((response) => setCustomers(response.data))
        .catch(() => {});
    }
'''
    return replace_once(text, old, new, "POS customer lookup")


def patch_menu(text: str) -> str:
    text = replace_once(
        text,
        'import { requirePermission, requireUser } from "../middleware/auth";',
        'import { canAccessBranch, requirePermission, requireUser } from "../middleware/auth";',
        "menu branch helper import",
    )
    old = '''      const branch = await ownBranch(db, req.user!.accountId, req.params.branchId);
      if (!branch) throw err.notFound();
'''
    new = '''      const branch = await ownBranch(db, req.user!.accountId, req.params.branchId);
      if (!branch) throw err.notFound();
      if (!canAccessBranch(req.user!, branch.id)) throw err.forbidden();
'''
    return replace_once(text, old, new, "branch menu scope")


def patch_shifts(text: str) -> str:
    text = replace_once(
        text,
        'import { requirePermission, requireUser } from "../middleware/auth";',
        'import { canAccessBranch, requirePermission, requireUser } from "../middleware/auth";',
        "shift branch helper import",
    )
    text = replace_once(
        text,
        '''      if (!q.success) throw err.validation(q.error.flatten());
      const row = await db("shifts")
''',
        '''      if (!q.success) throw err.validation(q.error.flatten());
      if (q.data.branch_id && !canAccessBranch(req.user!, q.data.branch_id)) throw err.forbidden();
      const row = await db("shifts")
''',
        "current shift scope",
    )
    text = replace_once(
        text,
        '''      if (!body.success) throw err.validation(body.error.flatten());
      const branch = await db("branches").where({ id: body.data.branch_id, account_id: req.user!.accountId, is_active: true }).first();
''',
        '''      if (!body.success) throw err.validation(body.error.flatten());
      if (!canAccessBranch(req.user!, body.data.branch_id)) throw err.forbidden();
      const branch = await db("branches").where({ id: body.data.branch_id, account_id: req.user!.accountId, is_active: true }).first();
''',
        "open shift scope",
    )
    old_movement = '''      const shift = await db("shifts").where({ id: req.params.id, account_id: req.user!.accountId, status: "open" }).first();
      if (!shift) throw err.notFound();
      await db("shift_cash_movements").insert'''
    new_movement = '''      const shift = await db("shifts").where({ id: req.params.id, account_id: req.user!.accountId, status: "open" }).first();
      if (!shift) throw err.notFound();
      if (!canAccessBranch(req.user!, shift.branch_id)) throw err.forbidden();
      await db("shift_cash_movements").insert'''
    text = replace_expected(text, old_movement, new_movement, 2, "cash movement scope")
    text = replace_once(
        text,
        '''      const summary = await summarizeShift(db, req.params.id);
      if (!summary || summary.account_id !== req.user!.accountId || summary.status !== "open") throw err.notFound();
      await db("shifts").where({ id: summary.id }).update''',
        '''      const summary = await summarizeShift(db, req.params.id);
      if (!summary || summary.account_id !== req.user!.accountId || summary.status !== "open") throw err.notFound();
      if (!canAccessBranch(req.user!, summary.branch_id)) throw err.forbidden();
      await db("shifts").where({ id: summary.id }).update''',
        "close shift scope",
    )
    text = replace_once(
        text,
        '''      const summary = await summarizeShift(db, req.params.id);
      if (!summary || summary.account_id !== req.user!.accountId) throw err.notFound();
      res.json({ data: summary });''',
        '''      const summary = await summarizeShift(db, req.params.id);
      if (!summary || summary.account_id !== req.user!.accountId) throw err.notFound();
      if (!canAccessBranch(req.user!, summary.branch_id)) throw err.forbidden();
      res.json({ data: summary });''',
        "shift summary scope",
    )
    return text


edit("apps/api/src/middleware/auth.ts", patch_auth)
edit("apps/api/src/modules/branches.ts", patch_branches)
edit("apps/api/src/db/seedData.ts", patch_seed)
edit("apps/admin/src/lib/me.ts", patch_me)
edit("apps/api/src/modules/restaurant.ts", patch_customers)
edit("apps/admin/src/pages/Pos.tsx", patch_pos)
edit("apps/api/src/modules/menu.ts", patch_menu)
edit("apps/api/src/modules/shifts.ts", patch_shifts)

print("Applied security core patches")
