# Inventory and Accounting Execution Status

Date: 2026-07-16
Branch: `feature/inventory-accounting-v2`
Stacked base: P3 head `782024d595e01c41e67fe3d0971f0fd6689775cc`

## Phase 0 revalidation

The SRS names inventory items, recipes, stock movements, split payments,
counts, waste, and inventory alerts. The inventory diagram expects order
completion to produce recipe-based stock deductions. ADR-003 requires stable
inventory valuation before COGS/profitability accounting.

### Legacy/WIP evidence

| Area | Classification | Evidence and disposition |
| --- | --- | --- |
| Current P3 tree | Not implemented | No Inventory or Accounting migrations, routes, or modules exist after migration 020 cursor indexes. |
| Legacy foundation commit `358da60` | WIP salvageable as reference | Useful route shapes and permission names, but migration number 020 conflicts with P3; branch/location modeling, append-only enforcement, concurrency, valuation, journal immutability, and period locks are incomplete. Do not cherry-pick. |
| Legacy shift report `b06ffd7` | Existing but incomplete | Renderer and enqueue route are useful. End-to-end bridge type handling must be proven before salvage. |
| Dirty legacy recipe prototype | Must be redesigned | Best-effort `try/catch` silently discards failures, reads mutable recipes at completion, has no durable event/retry, and conflicts with the foundation negative-stock rule. |
| Dirty legacy payment journal prototype | Must be redesigned | Best-effort posting can lose financial events, missing mappings silently skip entries, posting is not atomic with an outbox, and proportional VAT has no approved allocation contract. |
| Branch `wip/inventory-accounting-p2-p3-unvalidated` | Not present | No local ref exists. Uncommitted files in the user-owned `yakebda-feature` worktree were inspected read-only and remain untouched. |

The old worktree is dirty and user-owned. No reset, restore, checkout,
cherry-pick, or write was performed there.

## Approved runtime contracts

### Inventory location scope

- Every inventory record is scoped by authenticated `account_id`.
- Physical stock belongs to an `inventory_location` tied to an account and a
  branch. Each branch receives one default operational location; future
  warehouses remain explicit locations, not synthetic branches.
- Caller-supplied account scope is never trusted. Branch/location access uses
  the existing authorization model.

### Movement ledger authority

- `stock_movements` is append-only and is the quantity/value source of truth.
- Corrections use linked reversal movements; posted movements are never edited
  or deleted.
- Quantity on hand is derived from signed movement quantities by
  account/location/item.
- Movement idempotency keys prevent duplicate operational effects.
- Concurrent negative-stock checks serialize on the inventory item before
  calculating the location balance.

### Negative-stock policy

- Initial policy is **block**. Any movement that would make on-hand negative is
  rejected and recorded as an operational exception where an outbox exists.
- No hidden allow-negative fallback is permitted.

### Units and rounding

- Items own one base unit. Explicit conversion rows map supported input units
  to the base unit using positive decimal factors.
- Movement quantities are stored in base units with 6-decimal precision.
- Money/valuation is stored with 4-decimal unit-cost precision and 2-decimal
  journal precision. Decimal strings are converted deliberately; binary float
  is not the persistence authority.

### Recipe version and snapshot

- Recipes are versioned per product and optional variant.
- Activating a new recipe version never mutates an old version.
- Order completion creates one idempotent consumption event containing the
  exact order quantities, recipe versions, base-unit requirements, and cost
  context needed for replay.
- Later recipe edits cannot alter an existing event snapshot.

### Completion and reversal semantics

- The single shared order-status transition owner creates the consumption event
  atomically when an order first becomes `completed`.
- Order completion is not coupled to a best-effort stock write. The durable
  event is processed synchronously when possible and remains retryable on
  failure; failures are visible and never swallowed.
- A cancellation after posted consumption creates linked reversal events.
- A monetary refund alone does **not** imply physical stock return. Restock
  requires an explicit approved return/reversal instruction linked to the
  refund/order; this prevents automatic phantom stock.

### Valuation

- Initial valuation is perpetual moving weighted average by
  account/location/item.
- Receipts carry acquisition unit cost. Issues snapshot the current weighted
  average. Transfers carry the same cost from source to destination.
- Quantity and value remain derivable from movements; item master data does not
  own mutable average cost.
- COGS events are prohibited until valuation tests pass.

### Financial event outbox

- Operational transactions create immutable, versioned financial-event
  snapshots atomically.
- Events have pending/processing/posted/failed/dead states, attempts,
  retry timing, safe error metadata, and unique idempotency keys.
- Missing mappings or posting failures remain visible/retryable; no silent
  best-effort journal path is allowed.

### Accounting posting

- Posted journals are immutable and balanced; corrections use reversal entries.
- Posting is idempotent per financial event.
- Account, branch, source, payment method, and source record remain explicit
  dimensions.
- Locked periods reject new or back-dated posting and reversal.
- Initial revenue recognition is payment-capture based. Each payment debits its
  tender asset and credits revenue/VAT using the order's final server snapshot.
- Partial/multi-tender allocations use minor-unit proportional allocation;
  the final payment absorbs the documented rounding remainder.
- Refunds reverse the original payment allocation through lineage. Cancelled
  paid orders use the same refund events, not independent negative revenue.
- Inventory consumption posts COGS/inventory only after valuation completion.

### Backfill

- Backfill is dry-run by default and produces missing-mapping, unbalanced-event,
  reconciliation, and preview reports.
- Write mode requires an explicit flag and is exercised only against a test
  database in this track.

## Migration sequence

P3 owns migration 020. Inventory/Accounting starts at the next free number,
021. Legacy migrations numbered 020-022 must be recreated with non-conflicting
numbers and redesigned contracts; they are not cherry-picked.

## Phase plan

1. Foundation: locations, units/conversions, items, suppliers, immutable
   movement ledger, derived balances, concurrency, rounding, and audit.
2. Recipes: versioned recipes, durable consumption snapshots, processing,
   retry, and linked reversal.
3. Operations/valuation: receipts, transfers, waste, counts, adjustments, and
   weighted-average value.
4. Financial outbox: durable event capture/claim/retry/dead-letter.
5. Journals: mappings, immutable balanced postings, period locks, reversals,
   payment/refund/multi-tender/VAT/COGS policies.
6. Backfill: dry-run reconciliation and explicit test-only write mode.

No Inventory/Accounting branch push or PR is authorized in this run.
