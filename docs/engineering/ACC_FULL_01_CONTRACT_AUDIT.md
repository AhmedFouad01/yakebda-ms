# ACC-FULL-01 — CP0 Contract Audit (Accounting Module, Single Delivery)

**Date:** 2026-07-21
**Branch:** `feature/accounting-admin-full`
**Verified base:** `main` = `7acab101ad9947c8b9d328eac50660c30b71be3d` (merge of PR #48, verified live against `origin/main` at audit time — supersedes the plan's assumed `58d6015…`)
**Plan reference:** `YAKEBDA_MS_ACCOUNTING_MODULE_EXECUTION_PLAN__SINGLE_DELIVERY__v1_0__2026-07-20` (ACC-FULL-01)

Governing rule (plan §4): everything below that **exists is used as-is and is not rebuilt**; only the items marked **MISSING** or **GAP** are implemented in CP1–CP6. No UI button is shipped without a real API contract behind it.

---

## 1. Existing API surface (mounted at `/api/v1/accounting`)

Mount order in `apps/api/src/app.ts`: `financialEventRoutes` then `accountingRoutes` (both under `/accounting`).

### `apps/api/src/modules/financialEvents.ts`

| Route | Permission | Behavior on `main` |
|---|---|---|
| `GET /accounting/financial-events` | `accounting.view` | Tenant-scoped list; filter: `status` only (`pending/processing/posted/failed/dead`); fixed `limit(200)`; user-branch scoping only; **no cursor pagination, no type/branch/date filters; status enum missing `pending_policy`, `deferred_rounding`, `non_posting`, `reconciled`** (added by migration 026 after this route was written) |
| `POST /accounting/financial-events/:id/retry` | `accounting.manage` | Allowed only from `failed`/`dead` (409 otherwise); resets to `pending`; **no `writeAudit` call** |

### `apps/api/src/modules/accounting.ts`

| Route | Permission | Behavior on `main` |
|---|---|---|
| `GET /accounting/accounts` | `accounting.view` | Active accounts only, ordered by code |
| `GET /accounting/journals` | `accounting.view` | Branch filter + `limit` (max 200); embeds lines with account code/name; **no cursor pagination; no period/source_type/event_type/date filters** |
| `GET /accounting/trial-balance` | `accounting.view` | `branch_id` + `through` date; per-account debit/credit sums; **no period param; response has no explicit totals / debit=credit assertion; no separate residual-balance line** |
| `GET /accounting/rounding-reconciliations` | `accounting.view` | Raw reconciliation rows; filters: branch, status (`open/settled/reversed`); **no aggregation by account/branch, no equation ledger view** |
| `POST /accounting/events/process` | `accounting.manage` | Claims pending/failed events and posts them (in-request worker); audited |
| `POST /accounting/periods/lock` | `accounting.manage` | Lock by `{starts_on, ends_on}` (creates or updates row); audited; residual-zero rule enforced by DB trigger (see §3) |
| `POST /accounting/journals/:id/reverse` | `accounting.manage` | Reason required (3–500); locked-period rejected; idempotent (returns existing reversal); audited |

### Route-naming decision (binding for CP1+)

The plan's §4.2 names the surface `GET /accounting/events`; the existing contract is **`/accounting/financial-events`**. Per the governing rule, the existing name is kept: list/detail/retry/mark-dead all live under `/accounting/financial-events`. `POST /accounting/events/process` stays as-is (already literal, registered before any `/:id` route in its own path space).

---

## 2. Existing services (used as-is)

- **`apps/api/src/modules/financialOutbox.ts`** — `enqueueFinancialEvent` (idempotency-key dedupe + conflict on mismatched source), `enqueuePaymentFinancialEvent` (payment/refund allocation snapshots, minor-unit bigint math), `claimFinancialEvents` (FOR UPDATE SKIP LOCKED), `failFinancialEvent` (failed→dead at 5 attempts), `markFinancialEventPosted`, `recoverStaleFinancialEvents`. Status type includes `pending_policy`, `deferred_rounding`, `non_posting`, `reconciled`.
- **`apps/api/src/modules/accountingLedger.ts`** — `postClaimedFinancialEvent` (drafts payment/refund/mapped/inventory-reversal journals; advisory lock per order allocation; residual reconciliation rows with `source = journal + residual` at 4dp/2dp; `deferred_rounding` when journal rounds to zero), `reverseJournalEntry` (locked-period check, single-reversal idempotency), `ensureAccountingDefaults` (system chart + default mappings), `SYSTEM_ACCOUNTS` (11 accounts, codes 1000–5200 — **no rounding account exists**).
- **`apps/api/src/modules/accountingBackfill.ts`** — dry-run/apply-test-only backfill + reconciliation report tooling.
- **`apps/api/src/modules/inventoryService.ts`** — marks generic issues / policy-blocked reversals as `pending_policy` (existing safe behavior for unapproved policy = the plan's `PENDING VALUE` pattern).
- **`apps/api/src/lib/accountingMath.ts`** — bigint minor-unit helpers, `allocateGross`/`allocateRefund`. **`apps/api/src/lib/inventoryMath.ts`** — 4dp decimal parse/format. **`apps/api/src/lib/cursor.ts`** — versioned cursor pagination contract (used by restaurant/menu/readScope; the pattern for new list endpoints).

---

## 3. Schema & database guards (migrations 024–026, used as-is)

- `financial_events` (024): unique `(account_id, idempotency_key)`; claim index; status check extended by 026 to include `pending_policy/deferred_rounding/non_posting/reconciled`.
- `accounting_accounts`, `accounting_mappings`, `accounting_periods`, `journal_entries`, `journal_lines` (025) with:
  - `journal_entries_period_guard` — insert into locked period rejected (`journal_period_locked`).
  - Deferred balance triggers — unbalanced entries rejected (`journal_entry_unbalanced`).
  - `*_immutable_guard` — UPDATE/DELETE on journals/lines always rejected (correction by reversal only).
  - `journal_entries_one_reversal_idx` — at most one reversal per entry.
- `financial_event_reconciliations` (026): `residual_amount = source_amount - journal_amount` CHECK; one-reverse unique index; `financial_reconciliations_period_guard` (no new residual evidence in locked period); `accounting_periods_residual_guard` — **lock rejected while open residual sum ≥ 0.0001** (`accounting_period_open_residuals`); posted-events-evidence guard (posted requires journal or reconciliation).

ADR-004's stated rules are therefore already DB-enforced; API work only surfaces them.

---

## 4. Permissions (plan §4.1 — already satisfied, confirm only)

- Catalog: `accounting.view` / `accounting.manage` seeded in migration 024 and `apps/api/src/db/seedData.ts` (group "الحسابات").
- Role matrix: `manager` → view; `accountant` → view + manage; `admin` → all. Enforced in API via `requirePermission`.
- CP1 adds nothing here beyond test confirmation (403 matrix).

---

## 5. Existing tests (patterns to follow)

`apps/api/tests/` (vitest + supertest, from `apps/api`, `--fileParallelism false`): `accounting-subcent-reconciliation-p0.test.ts`, `accounting-backfill.test.ts`, `inventory-financial-integrity-p0.test.ts`, `pagination.test.ts`, `security-scope.test.ts`, plus suite. New tests join this directory and reuse `seedFoundation` + bearer-token pattern.

---

## 6. Admin frontend

**No accounting code exists** in `apps/admin` (no route, no nav entry, no pages, zero references). CP5–CP6 are fully greenfield, following `apps/admin/src/pages/inventory` as the structural pattern, with `theme.css` + `global-colors.css` color authority and `ui:colors:check`.

---

## 7. Gap matrix — what CP1–CP6 actually build

| Plan § | Item | Status on `main` | Action |
|---|---|---|---|
| 4.1 | Permissions catalog/seeds/roles | EXISTS | Confirm via tests (CP1) |
| 4.2 | Events list: cursor pagination + status/type/branch/date filters | GAP | Extend `GET /financial-events` (CP1) |
| 4.2 | Events list: full status enum incl. `deferred_rounding`, `pending_policy`, … | GAP | Extend validator (CP1) |
| 4.2 | `GET /financial-events/:id` (detail + last_error + source lineage) | MISSING | Build (CP1) |
| 4.2 | Retry: audit write | GAP | Add `writeAudit` (CP2) |
| 4.2 | `POST /financial-events/:id/mark-dead` (mandatory reason + audit) | MISSING | Build (CP2) |
| 4.3 | Journals list: cursor pagination + period/source_type/event_type/date filters | GAP | Extend (CP1) |
| 4.3 | `GET /journals/:id` (lines + reversal linkage + event lineage) | MISSING | Build (CP1) |
| 4.3 | `POST /journals/:id/reverse` | EXISTS | Use as-is; add rejection tests (CP2) |
| 4.4 | `POST /accounts` + disable | MISSING | Build (CP3) |
| 4.4 | `GET/POST/PUT /mappings` | MISSING (table + service reads exist) | Build (CP3) |
| 4.4 | Rounding account mapping | MISSING + **PENDING VALUE** (no approved account code) | Safe behavior: settlement blocked until a rounding mapping is configured (CP3/CP4) |
| 4.5 | `GET /periods` | MISSING | Build (CP3) |
| 4.5 | Period lock | EXISTS (by date range, DB-guarded) | Use as-is; keep range contract (CP3 tests) |
| 4.5 | `POST /periods/:id/open` | MISSING | Build (CP3) |
| 4.6 | `GET /reconciliation/residuals` (aggregated equation ledger) | MISSING (raw rows only) | Build (CP4) |
| 4.6 | `POST /reconciliation/settle` | MISSING + **PENDING VALUE** (timing/threshold/account) | Build with safe behavior: explicit request-scoped execution, blocked without configured rounding mapping; idempotency key; locked-period rejected; reversible (CP4) |
| 4.7 | Trial balance: period param, explicit matching totals, residual line | GAP | Extend response shape (CP4) |
| 5.x | Entire admin frontend (dashboard/events/journals/mappings/periods/settlement/trial-balance/exceptions/review pack) | MISSING | Build (CP5–CP6) |

---

## 8. Plan-reference discrepancies recorded at CP0

1. **Base SHA:** plan assumed `main = 58d6015…`; verified live head is `7acab10…` (PR #48 merged). Branch is based on the verified head, per plan §10.1.2.
2. **ADR-009 / ADR-007 / ADR-008 are not in this repository** (`docs/adr` ends at ADR-006). The Commercial Completeness Gate (ADR-009) is treated as external governing policy exactly as the plan states; nothing in this delivery claims commercial naming, statutory readiness, or production accounting.
3. **Policy value register (plan §2) arrived with all nine values unfilled.** Per plan §10.1.3, every value is recorded as `PENDING VALUE` in the ADR-004 revision (see that file). No value is invented; safe behaviors: settlement execution requires an explicitly configured rounding mapping; generic-issue events remain `pending_policy`; period lock keeps the DB residual guard as the arbiter.
