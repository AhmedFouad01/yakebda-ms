# Inventory and Accounting Migration Review

## Review identity

- Base: `782024d595e01c41e67fe3d0971f0fd6689775cc`
- Implementation head: `0bf0bf0f36f86f4358c25c9e93d9065187d1a625`
- Migrations reviewed: 021 through 025
- PostgreSQL: local PostgreSQL 16 container
- Isolated audit database: `ykms_inventory_review`
- Test database: `ykms_inventory_review_tests`
- No production or shared P3 database was used.

## Execution evidence

| Gate | Result |
| --- | --- |
| Fresh migration 001 -> 025 | PASS |
| Second `latest` | PASS; no pending migration |
| Down/up 025 | PASS |
| Nested down/up 024, 023, 022, 021 | PASS |
| Final restore to latest | PASS |
| `knex_migrations` registry | 25 names present, 021-025 registered exactly once |
| Existing-object loss during down/up | None observed in isolated fresh database |

The later batch numbers for 021-025 in the audit database are expected evidence of the deliberate down/up cycle, not duplicate migration names.

## 021 - Inventory foundation

**Objects:** `inventory_locations`, `inventory_units`, `inventory_unit_conversions`, `inventory_items`, `inventory_suppliers`, `stock_movements`; inventory permissions; default location seed; append-only trigger.

**Accepted controls**

- Nonzero movement quantity and nonnegative cost checks.
- Movement type/value-direction checks.
- Unique account-scoped idempotency key.
- Balance/source/reversal indexes.
- Update/delete of posted stock movements is rejected by trigger.
- One default location per account/branch.

**Findings**

- Independent `account_id`, `branch_id`, `location_id`, `item_id`, unit, supplier, actor, and reversal references are not protected by composite tenant FKs. PostgreSQL accepted a cross-account location/branch relation in a rolled-back audit transaction (IA-004).
- `reorder_level` has no nonnegative database check.
- No invariant proves `total_value` equals the approved rounded product of quantity and cost.
- Conversion endpoints enforce positive direct factors and distinct units, but no semantic consistency exists for contradictory reciprocal conversions.
- `down()` deletes permission keys/grants even when `up()` may have ignored pre-existing rows (IA-021).
- Default-location backfill is unconditional for every existing branch and has no preflight collision report beyond the unique index.

## 022 - Recipes and consumption

**Objects:** `inventory_recipes`, `inventory_recipe_items`, `inventory_consumption_events`, `inventory_consumption_event_items`.

**Accepted controls**

- Positive recipe version and item quantity checks.
- One active recipe per account/product/variant.
- Unique recipe version per account/product/variant.
- Account-scoped event idempotency.
- Event payload version/status checks.

**Findings**

- Recipe/product/variant/item relationships are not composite tenant FKs (IA-004).
- Recipe and recipe-item rows are not database-immutable after activation. The current API lacks edit routes, but the schema does not enforce the documented immutable-version claim.
- Event source/payload fields and event items are mutable at the database layer.
- `reverses_event_id` has no unique partial index in this migration; the later one-reversal protection is applied to stock movements, not directly to consumption events.
- Processing events have no lease/claim columns, making stale recovery impossible without schema work (IA-007).

## 023 - Inventory operations

**Objects:** `inventory_stock_counts`; one-reversal unique index for stock movements.

**Accepted controls**

- Nonnegative counted quantity.
- Account-scoped count idempotency.
- Only one stock movement can reference a given original movement as its reversal.

**Findings**

- No draft/approved/posted lifecycle, approver, approval timestamp, or location lock exists, contrary to SRS FR-103 (IA-009).
- No check proves `difference_quantity = counted_quantity - expected_quantity`.
- Count account/branch/location/item/movement relationships lack composite tenant FKs (IA-004).
- Count rows are mutable and have no reversal/correction linkage of their own.

## 024 - Financial event outbox

**Objects:** `financial_events`; accounting permissions.

**Accepted controls**

- Account-scoped idempotency key.
- Explicit pending/processing/posted/failed/dead status set.
- Nonnegative attempts and positive payload version.
- Claim, source, and scope indexes.

**Findings**

- Event source identity, payload, version, account, and branch are mutable; direct payload update was accepted by PostgreSQL in a rolled-back audit transaction (IA-012).
- Branch/account consistency is not protected by a composite FK (IA-004).
- The schema supports claims, but runtime has no production worker or scheduled stale recovery (IA-006/IA-023).
- `down()` has the same pre-existing permission deletion risk as 021 (IA-021).
- Error field redaction is application-only; length is bounded in code but no structured error metadata/version exists.

## 025 - Accounting ledger

**Objects:** `accounting_accounts`, `accounting_mappings`, `accounting_periods`, `journal_entries`, `journal_lines`; default system accounts/mappings; balance, period, and immutability triggers.

**Accepted controls**

- Composite account FKs for mapping accounts and journal-line entry/account references.
- One journal per financial event and one reversal per journal.
- Journal lines require exactly one positive debit/credit side.
- Deferred transaction checks enforce entry debit equals credit.
- Posted entries and lines reject update/delete.
- Period insert trigger rejects an already locked period.

**Findings**

- Journal account can disagree with referenced financial event, branch, order, payment, original payment, actor, or reversal entry because those links are not tenant-composite (IA-004).
- Accounting periods may overlap. Exact tuple uniqueness does not prevent overlapping ranges.
- Period lock and journal posting are not serialized. A journal committed after a covering lock in the reproduced race (IA-005).
- UTC date derivation is outside the migration, but makes the period trigger evaluate the wrong business date near local midnight (IA-015).
- Financial-event/source/payment-specific lookup indexes are limited; production query plans were not claimed because no EXPLAIN benchmark was part of this audit.
- Default mappings are inserted only for accounts existing at migration time. No account-provisioning or mapping-management API was found for future accounts.

## Decimal and timestamp review

- Quantity: decimal `(18,6)`; inventory cost/value: `(18,4)`; journal debit/credit: `(18,2)`.
- The precision transition is not reconciled, causing IA-003 and contributing to IA-011.
- Knex `timestamp` columns materialized as PostgreSQL `timestamp with time zone` in the audit database.
- Accounting periods and entry dates use `date`, but runtime derives them from UTC rather than an approved business timezone.

## Actual index review

The audit queried `pg_indexes`; 57 relevant indexes were present. Key indexes matched source definitions:

- `stock_movements_balance_idx (account_id, location_id, item_id, created_at, id)`
- `stock_movements_source_idx (account_id, source_type, source_id)`
- `financial_events_claim_idx (status, next_attempt_at, created_at, id)`
- `financial_events_source_idx (account_id, source_type, source_id)`
- `journal_entries_scope_idx (account_id, entry_date, id)`
- `journal_entries_order_idx (account_id, order_id, event_type)`

No claim is made that PostgreSQL will choose these indexes under production cardinalities; that requires representative `EXPLAIN (ANALYZE, BUFFERS)` evidence.

## Down migration safety

- Table/function/index removal was scoped to objects introduced by each migration in the clean audit database.
- Permission rollback ownership is unsafe when keys could predate the migration (IA-021).
- Down migrations are destructive to all data in the new tables by design; they are development rollback tools, not production data rollback procedures.
- Production rollback should disable writers, preserve tables, and deploy forward corrective migrations rather than execute destructive down migrations after data exists.

## Migration verdict

**BLOCKED for production.** Fresh and reversible execution succeeds, but tenant relational invariants, outbox immutability, count approval, overlapping/locking period controls, and precision reconciliation require forward migrations and tests before production deployment.
