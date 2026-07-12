from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected one match, found {count}")
    return text.replace(old, new, 1)


path = Path("apps/api/src/modules/restaurant.ts")
text = path.read_text(encoding="utf-8")
start = text.index("export function customerRoutes")
end = text.index("export function reportRoutes", start)
before = text[:start]
section = text[start:end]
after = text[end:]

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
section = replace_once(section, marker, lookup, "customer lookup route")
section = replace_once(
    section,
    '  r.get("/:id", async (req, res, next) => {',
    '  r.get("/:id", requirePermission("customers.manage"), async (req, res, next) => {',
    "customer detail permission",
)
section = replace_once(
    section,
    '  r.get("/:id/orders", async (req, res, next) => {',
    '  r.get("/:id/orders", requirePermission("customers.manage"), async (req, res, next) => {',
    "customer order history permission",
)

path.write_text(before + section + after, encoding="utf-8")
print("Applied customer security patch")
