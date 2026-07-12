from pathlib import Path


path = Path("apps/api/src/modules/menu.ts")
text = path.read_text(encoding="utf-8")

old_import = 'import { requirePermission, requireUser } from "../middleware/auth";'
new_import = 'import { canAccessBranch, requirePermission, requireUser } from "../middleware/auth";'
if text.count(old_import) != 1:
    raise SystemExit(f"menu auth import: expected one match, found {text.count(old_import)}")
text = text.replace(old_import, new_import, 1)

old = '''      const branch = await ownBranch(db, req.user!.accountId, req.params.branchId);
      if (!branch) throw err.notFound();
'''
new = '''      const branch = await ownBranch(db, req.user!.accountId, req.params.branchId);
      if (!branch) throw err.notFound();
      if (!canAccessBranch(req.user!, branch.id)) throw err.forbidden();
'''
if text.count(old) != 3:
    raise SystemExit(f"menu branch scope: expected three matches, found {text.count(old)}")
text = text.replace(old, new)

path.write_text(text, encoding="utf-8")
print("Applied menu branch scope")
