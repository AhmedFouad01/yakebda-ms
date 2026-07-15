# P3 Platform Hardening Final Report

Date: 2026-07-16
Branch: `chore/audit-p3-platform-hardening`
Base: `17413499288a458224d874a24e61561ca9fb90a3`

## Scope

P3 is a bounded platform-hardening release candidate:

- R11: operational observability and safe health behavior.
- R12: validated cursor pagination for confirmed collection endpoints.
- R13: Node 22 and shared API/Admin wire contracts.
- P3.4: documentation truth reconciliation.

Inventory, Accounting, UI redesign, deployment, and complete OpenAPI coverage
are outside this branch.

## Findings and delivered behavior

### R11 Observability

- Every request receives a bounded request ID, returned as `x-request-id`.
- Access and unexpected-error events are structured JSON with authenticated
  identity metadata and normalized routes.
- Secret-like keys and embedded credential values are recursively redacted.
- Request bodies, authorization headers, cookies, and raw credentials are not
  logged.
- `/api/v1/health/live` checks process liveness.
- `/api/v1/health/ready` performs a timeout-bounded database readiness check.
- Existing business audit records remain separate and unchanged.

### R12 Cursor pagination

The following endpoints retain their `data` DTO and add `next_cursor` plus
`has_more`:

- `GET /api/v1/customers/lookup`
- `GET /api/v1/customers`
- `GET /api/v1/customers/:id/orders`
- `GET /api/v1/products`

The opaque base64url cursor is versioned and bound to the endpoint and sort.
Ordering is deterministic with an ID tie-breaker. Default page size is 50 and
maximum is 100; customer order history retains default 20 and maximum 50.
Authenticated account/permission scope and existing filters remain
authoritative and never come from cursor contents.

### R13 Node and contracts

- Supported runtime: `node >=22 <23`; `.nvmrc` and CI select Node 22.
- `@ykms/contracts` provides strict Zod schemas and inferred types for
  pagination, customer reads, order statuses, and bounded order summaries.
- API and Admin consume the shared types without changing response parsing or
  wire values.
- Full order, quote, receipt, KDS, POS workflow, database, and command models
  remain local to their owning layers.

## Files changed

- Runtime/API: observability, health, cursor utility, confirmed restaurant/menu
  routes, and narrow baseline type fixes.
- Admin: cursor traversal and shared customer/order type consumers.
- Contracts: `packages/contracts/` schemas, declarations, and tests.
- Tooling: Node 22 declarations, workspace dependencies, lockfile, and CI gate.
- Database: migration 020 cursor indexes only.
- Documentation: P3 status, implementation status, roadmap/status, milestone
  log, audit ledger, README, and this report.

No Inventory or Accounting source file is changed by P3.

## Migration

`20260716_020_cursor_pagination_indexes` adds four query-aligned indexes:

- `customers_account_created_id_cursor_idx`
- `orders_account_customer_created_id_cursor_idx`
- `products_account_sort_id_cursor_idx`
- `products_account_category_sort_id_cursor_idx`

The migration changes no table, column, data, permission, or business rule.
Its down path removes only these indexes.

## Security and compatibility

- Account/branch isolation remains derived from authenticated context.
- Manager account-wide branch access still requires `branches.manage`.
- Branch-bound users remain restricted to their assigned branch.
- Malformed, oversized, wrong-version, wrong-endpoint, and wrong-sort cursors
  return safe HTTP 400 validation responses.
- Complete-list Admin consumers explicitly traverse cursor pages; no silent
  first-page truncation was introduced.
- Refunds remain linked offsetting transactions with server and database
  enforcement; they are not a no-op feature flag.

## Final local validation

All commands ran under official Node `v22.23.1` and npm `10.9.8`.

| Gate | Result |
| --- | --- |
| Clean lockfile install | PASS - `npm ci --no-audit --no-fund`. |
| Contracts build/tests | PASS - 1 file, 13/13 tests. |
| API TypeScript | PASS - zero errors. |
| Focused observability/security/pagination/financial tests | PASS - 7 files, 38/38 tests. |
| Full API suite | PASS - 20 files, 144/144 tests. |
| Admin tests | PASS - 3 files, 11/11 tests. |
| Admin production build | PASS. |
| UI color contract | PASS. |
| Fresh migrations 001-020 | PASS. |
| Second migrate-latest | PASS - no pending migrations. |
| Migration 020 down/up | PASS - 4 new indexes removed/recreated; 14 sampled pre-existing indexes remained. |
| `git diff --check` | PASS. |

No skipped test was added. No production database or credential was used.

## CI expectations

The Draft PR CI must run on the exact pushed P3 head with Node 22, clean npm
install, contracts build/tests, API build/migrations/tests, color contract,
Admin tests, and Admin build. Local success is not represented as remote CI
success until that exact-SHA workflow completes.

## Known waivers

P3 introduces no new test or security waiver. Two historical P2 visual states
remain explicitly user-waived, not PASS: Settings hover in Light mode and
keyboard focus-visible in Light/Dark mode. P3 changes no CSS or interaction
behavior covered by those waivers.

## Remaining risks

- Cursor pagination is not snapshot isolation. Rows whose ordered values change
  during traversal can move between pages.
- `GET /orders`, current-shift history, and large exports retain separate
  pagination/scaling debt.
- Production log transport, retention, rotation, aggregation, and alerting are
  not implemented.
- Complete OpenAPI/Swagger documentation is not implemented.
- Historical `YKMS-02H` versus external `YKMS-11` naming remains documented
  debt; history is not renamed.

## Rollback notes

- Migration 020 may be rolled down independently; it removes only its four
  indexes.
- Shared-contract consumer changes and the workspace dependency should be
  reverted together if rollback is required.
- Node/CI declarations and documentation are configuration-only changes.
- R11 rollback would remove operational visibility and should be treated as a
  safety regression, not a routine deployment toggle.

## Deferred work

- Order-list/current-shift pagination and export scaling.
- Production observability transport and retention.
- Complete API documentation/OpenAPI.
- Inventory and Accounting, on a separate feature branch after P3 publication.
