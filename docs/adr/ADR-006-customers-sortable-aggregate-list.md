# ADR-006 — Customers Sortable Aggregate List (W4f)

**Status:** Accepted for local implementation — **Not Production Ready**
**Branch:** `feature/customers-rich-sort-table` (base: P3 `782024d595e01c41e67fe3d0971f0fd6689775cc`)
**Scope:** `GET /customers` (the full CRM list gate in `readScope.ts`) + Admin Customers table.

## Context

The admin customers page loads every page via `apiAllPages` and renders a
4-column table with no sorting. Operations need a rich 9-column table sorted
server-side (spend, order counts, recency) over the **existing** P3 cursor
pagination — not a rebuild of it.

A latent P3 defect is also in scope: in `customerReadRoutes` the keyset cursor
filter sits after `if (!search) return;` inside the query modifier, so
**unsearched pagination never applies the cursor** (page 2 repeats page 1 when
`apiAllPages` follows `next_cursor`). The rework fixes this.

## Columns and definitions (documented choices)

| # | Column | Source | Definition |
|---|---|---|---|
| 1 | name | customers.name | as-is |
| 2 | phone | customers.phone | nullable |
| 3 | orders_count | orders aggregate | `count(*)` of the customer's non-cancelled orders in the account scope |
| 4 | last_order_at | orders aggregate | `max(created_at)` of non-cancelled orders — **created_at**, matching the existing profile analytics (`/customers/:id` uses `max(created_at)`), not submitted_at |
| 5 | total_spent | orders aggregate | `sum(total) filter (where status = 'completed')` — identical policy to profile analytics: only completed orders count financially; cancelled excluded; refunds are recorded as payments and do not change `orders.total` in the current system |
| 6 | avg_order | derived | `total_spent / completed_count`, `null` when `completed_count = 0` (no divide-by-zero; rendered as «غير متاح») |
| 7 | branch | orders aggregate → branches | name of the branch of the customer's **most recent non-cancelled order** (customers have no home branch column; this is the only truthful branch signal). `null` for zero-order customers |
| 8 | status | customers.is_blocked | actual stored status: محظور / نشط. No invented activity status |
| 9 | created_at | customers.created_at | as-is |

## Sorting contract

- **Server-side only.** Whitelist (400 `validation` otherwise):
  `name | phone | orders_count | last_order_at | total_spent | avg_order | branch | status | created_at`
- Directions: `asc | desc`. Default: `created_at desc` then `id desc` (unchanged P3 default).
- Secondary tie-breaker is **always `id`**, same direction as the primary sort.
- **Null ordering is deterministic: `NULLS LAST` in both directions** (Postgres
  `order by <expr> asc|desc nulls last, id asc|desc`), and the keyset filter
  implements the same rule so no rows duplicate or vanish across pages.
- Limit default/max stay P3 values (50/100) via `parseCursorPage`.

## Cursor binding (existing envelope, version 1 — reused, not rebuilt)

The P3 envelope `{version: 1, endpoint, sort, values}` already binds endpoint +
sort. W4f sets `sort = "<field>_<direction>"` (e.g. `total_spent_desc`) and
`values = { v: <primary sort value | null>, id }`:

- cursor from another endpoint or another sort/direction → 400 «مؤشر الصفحة لا يطابق هذا المسار أو الترتيب» (existing check).
- malformed/oversized/unknown-version cursors → existing 400 paths untouched.
- `v` carries the primary sort value of the last row (ISO string for dates,
  number for aggregates, string for text, boolean for status, `null` when the
  row's sort value is null) — plus `id` as tie-breaker. This satisfies the
  binding requirement: endpoint + field + direction + primary value + id + version.

### Keyset predicate with nulls (desc example)

For `order by X desc nulls last, id desc`, after cursor `(v, id)`:

- `v ≠ null`: `X < v` OR (`X = v` AND `id < id₀`) OR `X IS NULL`
- `v = null`: `X IS NULL` AND `id < id₀`

Ascending mirrors with `>` (nulls still last). `created_at`/`name`/`status`/
`orders_count`/`total_spent` are non-null (aggregates coalesce to 0), so the
null branches only matter for `phone`, `last_order_at`, `avg_order`, `branch`.

## Query architecture (no N+1)

One query: `customers` LEFT JOIN a single **aggregate subquery** grouped by
`customer_id` (account-scoped inside the subquery), LEFT JOIN `branches` for
the last-order branch name:

```sql
select c.*, coalesce(agg.orders_count,0) …, b.name as branch_name
from customers c
left join (
  select customer_id,
         count(*)::int                                   as orders_count,
         max(created_at)                                 as last_order_at,
         coalesce(sum(total) filter (where status='completed'),0) as total_spent,
         count(*) filter (where status='completed')::int as completed_count,
         (array_agg(branch_id order by created_at desc))[1] as last_branch_id
  from orders
  where account_id = :account and status <> 'cancelled' and customer_id is not null
  group by customer_id
) agg on agg.customer_id = c.id
left join branches b on b.id = agg.last_branch_id
where c.account_id = :account
order by <expr> <dir> nulls last, c.id <dir>
limit :limit + 1
```

Chosen over LATERAL because sorting by aggregates needs the aggregate for
*every* candidate row anyway; one grouped pass over the customer's orders via
the existing index is the cheapest testable plan. Search (`ilike` on
name/phone/alt_phone) and the keyset predicate apply on the outer query.

## Indexes — EXPLAIN-driven decision

Existing (P3 migration `20260716_020`):
- `customers(account_id, created_at, id)` — serves the default sort.
- `orders(account_id, customer_id, created_at, id)` — serves the aggregate
  subquery (`where account_id … group by customer_id`) as an index-only-ish
  scan ordered by customer_id.

**No new index is added.** EXPLAIN on the seeded dataset shows the aggregate
subquery using `orders_account_customer_created_id_cursor_idx` and the outer
scan using the customers cursor index for the default sort; aggregate-sorted
variants necessarily sort computed values (no btree can serve
`order by sum(total)`), so a per-sort-field index would be dead weight —
exactly the blind indexing the audit forbids. Plan output is recorded in the
final report.

## Permissions & scope (unchanged)

`customers.view | customers.manage` gate the list (existing). Account scope on
both the outer query and the aggregate subquery. Branch scope: customers are
account-level entities in the current model (no branch column); order
aggregates are account-scoped like the existing profile analytics endpoint.

## Admin table

Rich table on the existing page: 9 columns, `aria-sort` on headers, keyboard
activation (button-in-th), direction toggle, loading/empty/error states,
cursor **reset on sort change**, «تحميل المزيد» per the cursor contract (no
load-all-then-sort), server-side search preserved (debounced), tabular
numerals, existing formatters (`ج.م`, `ar-EG` dates), RTL, internal horizontal
scroll at narrow widths only (no viewport overflow), no new `!important`, no
raw colors.

## Consequences

- Shared contract gains an extended row schema (`customerListRowSchema`)
  additive to `customerListSchema`; existing consumers keep parsing.
- `apiAllPages` remains for other callers; the customers page moves to
  explicit page fetches.
- The latent unsearched-cursor bug is fixed and regression-tested.
