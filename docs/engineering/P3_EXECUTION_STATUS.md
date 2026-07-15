# P3 Platform Hardening Execution Status

## Scope

P3 starts from merge commit `17413499288a458224d874a24e61561ca9fb90a3` on branch
`chore/audit-p3-platform-hardening`. Inventory and Accounting remain frozen and
outside this track. This document records the post-merge baseline before R11
observability work.

## Post-merge baseline

Date: 2026-07-15

| Gate | Result | Evidence |
| --- | --- | --- |
| Dependency install | PASS | `npm ci --no-audit --no-fund` completed without lockfile changes. npm warned that the existing esbuild install script was not approved. |
| Admin tests | PASS | 3 files, 11 tests. |
| Admin production build | PASS | Vite production build completed. |
| UI color contract | PASS | `npm run ui:colors:check`. |
| API TypeScript check | BASELINE FAIL | Three existing implicit-`any` errors: `orderSources.ts:130`, `shifts.ts:62`, and `shifts.ts:68`. The same errors reproduce with Node 20 and Node 24. |
| API tests, isolated database | BASELINE FAIL | 17 files passed; 1 file failed. 124 tests passed; one existing `read-permissions.test.ts` expectation conflicts with the seeded manager `branches.manage` permission and current `canAccessBranch` contract. |
| API migrations | PASS | Migrations completed against an isolated local P3 database. |
| API seed | PASS | Seed completed against the isolated local P3 database. |
| API operational smoke | PASS | Health, login, branches, menu, KDS, and quote requests succeeded on isolated port 3011. No order was submitted. |
| Admin operational smoke | PASS | Login, AppShell, POS, and KDS loaded through an isolated Vite server on port 5199 with no blocking browser errors. |
| Repository integrity | PASS | Working tree clean and `git diff --check` passed before this document. |

## Baseline discrepancies

The default shared test database contained an Inventory/Accounting migration
record that is intentionally absent from this branch. That contaminated result
was discarded; API tests were rerun against the isolated database
`ykms_p3_1741349_test`.

The remaining TypeScript and authorization-test failures are not P2
regressions:

- There is no API source diff between validated P2 commit
  `44c0d9a90e1179bff5153bbe62d4646b54c41578` and merge commit
  `17413499288a458224d874a24e61561ca9fb90a3`.
- The affected API code predates P2.
- The permission test expects a cross-branch denial while the seeded manager
  has `branches.manage`, which the current authorization helper explicitly
  accepts for cross-branch access.

These discrepancies were retained as visible baseline blockers during R11 and
were closed in the P3.1 exit-gate work recorded below. Neither was caused by P2.

## Runtime isolation

- PostgreSQL databases used: `ykms_p3_1741349_dev` and
  `ykms_p3_1741349_test`.
- API verification origin: `http://127.0.0.1:3011`.
- Admin verification origin: `http://127.0.0.1:5199`.
- Migration and seed logs were written outside the repository under
  `C:\Users\10\Downloads`.
- No production data, API business logic, migrations, Inventory, or Accounting
  files were modified.

## Milestone boundary

P3.1 R11 and its exit gate are complete. R12 and R13 remain deferred and no
work for either milestone is included in this branch state.

## R11 revalidation

The requested files `YKMS-P3-PLATFORM-FIXES.md`,
`EXECUTION_PLAN__YAKEBDA_MS__AUDIT_REMEDIATION_P0_P4`, and
`docs/engineering/AUDIT_REMEDIATION_LEDGER.md` are not present in the merged
repository or its local Git history. The revalidation therefore used the
merged source, CI workflow, `RUNTIME_RELIABILITY_AUDIT.md`, and current
implementation documentation as authoritative evidence.

| R11 area | Pre-change classification | Evidence | Result |
| --- | --- | --- | --- |
| Request correlation | Confirmed | No request middleware or `x-request-id` handling existed. | Implemented with bounded incoming IDs, UUID replacement, response propagation, and error correlation. |
| Structured request logs | Confirmed | Runtime used `console.error`; no normalized access event existed. | Implemented JSON events with method, normalized route, status, duration, request ID, and authenticated identity when available. |
| Secret redaction | Partially fixed | Auth audit events excluded attempted credentials, but runtime errors were raw and the seed command printed a password and PIN. | Implemented recursive key/value redaction; request headers/bodies are not logged; seed output no longer prints credentials. |
| Safe error handling | Partially fixed | Client 500 responses were generic, but server output contained raw errors and no correlation ID. | Unexpected errors emit safe structured metadata and return the request ID. Expected API and integrity responses remain separate from server-failure events. |
| Liveness/readiness | Partially fixed | `/api/v1/health` existed as a process-only check; no database readiness signal existed. | Preserved `/health`, added `/health/live`, and added timeout-bounded `/health/ready`. |
| Business audit logging | Already fixed | Sensitive state changes use the database-backed audit log. | Preserved unchanged and separate from operational logs. |
| Logging dependency | Already fixed | No logging package was required for the bounded local implementation. | No dependency or lockfile change. |

## R11 implementation

Commits:

- `0da16b8` - request correlation, structured access/error events, route
  normalization, authoritative identity metadata, and redaction tests.
- `7fca88a` - liveness/readiness, readiness timeout, safe readiness failures,
  additional payment-data redaction, safe seed output, and tests.

Runtime contract:

- A valid incoming `x-request-id` is accepted only when it is 1-128 characters
  and uses the bounded identifier character set. Other values are replaced by
  a UUID.
- `x-request-id` is returned on every response and exposed through CORS.
- Access logs never include request bodies, query strings, authorization,
  cookies, passwords, PINs, tokens, API keys, or payment-sensitive fields.
- Account, branch, and user metadata comes only from authenticated request
  context, never caller-supplied identity headers.
- Unexpected client responses contain no stack, SQL, connection details, or
  secret values.
- `/api/v1/health/live` does not query PostgreSQL.
- `/api/v1/health/ready` runs `select 1` with the configured
  `READINESS_DB_TIMEOUT_MS` (default 1500 ms) and returns a safe 503 when the
  database is unavailable or slow.

## R11 validation

Date: 2026-07-15

| Gate | Result |
| --- | --- |
| R11 focused tests | PASS - 11/11. |
| Existing foundation and order-integrity tests | PASS - 19/19. |
| Complete isolated API suite | PASS - 19/19 files and 138/138 tests. No skipped tests were added. |
| API TypeScript check | PASS - zero errors. |
| Migration run 1 | PASS - no pending migrations. |
| Migration run 2 | PASS - no pending migrations. |
| Admin tests | PASS - 11/11. |
| Admin build | PASS. |
| UI color contract | PASS. |
| Live liveness check | PASS on isolated API port 3011. |
| Live readiness check | PASS on isolated API port 3011. |
| `git diff --check` | PASS. |

No UI, API business workflow, migration, Inventory, Accounting, R12, or R13
change is included. No push or pull-request update was performed.

## Exit-gate discrepancy closure

### TypeScript baseline

The implicit-`any` errors came from lost Knex result inference after query
composition. `orderSources.ts` now declares the existing result as
`OrderSourceRow[]`; `shifts.ts` defines the selected `ShiftOrderRow` shape and
types the result array. SQL, calculations, callbacks, and runtime behavior are
unchanged. Commit: `91e9a80`.

### Manager branch-scope coverage

Classification: stale test expectation.

The seeded manager is assigned to the first branch but deliberately holds
`branches.manage`. The existing authorization contract, branch listing, and
`canAccessBranch` helper all treat this permission as account-wide branch
management. The failing test incorrectly expected that manager to receive 403
for the second branch in the same account.

Production authorization code and permission keys were not changed. Regression
coverage now proves both sides of the existing contract:

- A manager with `branches.manage` may read settings for another branch in the
  same account.
- A branch-bound user with `settings.view` but without `branches.manage` may
  read the assigned branch and receives 403 for another branch.
- Every branch lookup remains constrained by the authenticated `account_id`,
  so account isolation is unchanged.

Commit: `3669756`.

### Exit validation

- API TypeScript: PASS, zero errors.
- API tests: PASS, 19 files and 138 tests.
- Admin tests: PASS, 11 tests.
- Admin production build: PASS.
- UI color contract: PASS.
- `git diff --check`: PASS.
- Migrations: NOT REQUIRED - no schema or production database behavior changed.

Files changed for the discrepancy closure:

- `apps/api/src/modules/orderSources.ts`
- `apps/api/src/modules/shifts.ts`
- `apps/api/tests/read-permissions.test.ts`

No dependencies, migrations, UI, Inventory, Accounting, R12, or R13 changes
were made.

## Remaining risks

- Review production log transport/retention before deployment. The current
  implementation emits local JSON lines and intentionally adds no external
  service or logging dependency.

## R12 cursor pagination revalidation

Date: 2026-07-15

The requested `docs/engineering/AUDIT_REMEDIATION_LEDGER.md` is not present in
the repository or local Git history. R12 revalidation therefore used the
current API queries, migrations, tests, Admin consumers, and this execution
status as the authoritative evidence. No endpoint is paginated merely because
it returns a collection.

| Endpoint | Current query and ordering | Current limit | Filters and consumer | Risk | Classification |
| --- | --- | --- | --- | --- | --- |
| `GET /api/v1/customers/lookup` | Account-scoped customer lookup ordered by `created_at DESC`. | 200 | Optional name/phone search; POS delivery customer selector loads the complete response. | Silent truncation once an account has more than 200 matching customers; ordering has no ID tie-breaker. | Confirmed. Add cursor pagination and preserve complete POS lookup behavior through bounded client traversal. |
| `GET /api/v1/customers` | Account-scoped customer list ordered by `created_at DESC`. | 200 | Optional name/phone search; Customers screen filters and renders the complete response. | Silent truncation and nondeterministic rows when timestamps tie. | Confirmed. Add cursor pagination and preserve the full Admin list through bounded client traversal. |
| `GET /api/v1/customers/:id/orders` | Account- and customer-scoped orders ordered by `created_at DESC`. | Default 20, maximum 50 | Customer profile order history. The customer itself is first verified inside the authenticated account. | The endpoint calls itself paginated but exposes no continuation token; duplicate timestamps are not deterministic. | Confirmed. Add cursor pagination and preserve the complete profile history through bounded client traversal. |
| `GET /api/v1/products` | Account-scoped products ordered by `sort_order ASC`. | None | Optional category filter; Menu and Settings consumers require the complete product list. | Unbounded response, nested variant/link fan-out, and nondeterministic equal sort values. | Confirmed. Add cursor pagination and preserve complete Admin consumers through bounded client traversal. |
| `GET /api/v1/tables` | Account/authorized-branch rows ordered by `name_ar ASC`. | None | Optional authorized branch filter; POS operational table lookup. | Small configuration lookup; paginating it would complicate a required complete selector without proven scale pressure. | Invalid for this R12 slice. Keep complete. |
| `GET /api/v1/categories`, `GET /api/v1/modifier-groups`, `GET /api/v1/branches/:id/menu` | Configuration and operational menu payloads use their existing sort orders. | None | Menu configuration and POS runtime require complete bounded structures. | Pagination would change the operational lookup contract and split nested configuration. | Invalid for this R12 slice. Keep complete. |
| Product Excel export/import-template routes | Dedicated complete file responses. | Not applicable | Export/import workflows. | Cursor pagination is not an export contract. | Invalid. Keep separate. |
| Restaurant report aggregates and top-products | Aggregate SQL; top-products intentionally returns top 10. | Intentional top 10 where applicable | Reports screen. | Bounded aggregate is deliberate, not silent pagination. | Already fixed by its bounded reporting contract. |
| `GET /api/v1/orders`, `GET /api/v1/orders/current-shift` | Account/branch/permission scoped rows ordered by `created_at DESC`. | 200 | Orders screen and POS shift history. | Same silent-truncation and tie-breaker debt exists. | Partially fixed by a hard bound, but deferred from this prescribed restaurant/menu R12 slice to avoid broad collection conversion. |

Confirmed endpoints will use deterministic keyset ordering:

- Customers and customer orders: `created_at DESC, id DESC`.
- Products: `sort_order ASC, id ASC`.
- Existing account, branch, permission, search, category, and customer filters
  remain authoritative and are applied before the keyset predicate.

The response will retain `data` and add `next_cursor` plus `has_more`. Default
page size is 50 and maximum page size is 100, except customer order history,
which retains its existing default of 20 and maximum of 50. Admin consumers
that currently require complete lists must explicitly traverse cursor pages;
no UI may silently display only the first page.

R12 remains non-snapshot pagination. New rows inserted ahead of a descending
cursor after page one are not repeated on later pages, but rows whose sort
values change during traversal can move between pages. Dedicated exports and
the deferred order-list endpoints require separate follow-up decisions.

## R12 implementation and validation

Date: 2026-07-16

R12 is complete for the four confirmed restaurant/menu collection contracts.
No R11 behavior, R13/shared contract work, Inventory, Accounting, CSS, or UI
layout was changed.

### Endpoint contracts

| Endpoint | Previous behavior | Final ordering | Page limits | Compatibility |
| --- | --- | --- | --- | --- |
| `GET /api/v1/customers/lookup` | `created_at DESC`, hard limit 200. | `created_at DESC, id DESC`. | Default 50, maximum 100. | Minimal POS DTO is unchanged; internal `created_at` cursor material is removed from each returned row. POS explicitly traverses all pages. |
| `GET /api/v1/customers` | `created_at DESC`, hard limit 200. | `created_at DESC, id DESC`. | Default 50, maximum 100. | Full read gate still accepts `customers.view` or `customers.manage`; Customers explicitly traverses all pages. |
| `GET /api/v1/customers/:id/orders` | `created_at DESC`, default 20, maximum 50, no continuation. | `created_at DESC, id DESC`. | Existing default 20 and maximum 50 retained. | Order DTO is unchanged; Customer Profile explicitly traverses all pages. |
| `GET /api/v1/products` | `sort_order ASC`, unbounded. | `sort_order ASC, id ASC`. | Default 50, maximum 100. | Product, variant, and modifier-group DTO fields are unchanged. Menu and Settings explicitly traverse all pages. |

Revalidation tests exposed that `customerReadRoutes` is the authoritative
`GET /customers` handler because it is mounted before `customerRoutes`. The
cursor contract was moved to that read-permission owner, and the unreachable
duplicate root handler was removed. The `customers.view` / `customers.manage`
authorization contract remains unchanged.

Every response retains `data` and now always adds:

```json
{
  "next_cursor": null,
  "has_more": false
}
```

The server fetches `limit + 1`, removes the lookahead row, and performs no
`COUNT(*)`, offset, or page-number query. Admin compatibility uses a bounded
cursor traversal helper with repeated-cursor detection; the browser never
decodes cursor contents.

### Cursor contract

- Encoding: base64url-encoded JSON envelope.
- Version: `1`.
- Binding: explicit endpoint and sort identifiers.
- Values: only the ordered values and final UUID ID tie-breaker.
- Maximum encoded length: 1024 characters.
- Invalid, oversized, unsupported-version, wrong-endpoint, wrong-sort, and
  malformed cursors return HTTP 400 with a safe Arabic validation response.
- Limits must be positive decimal integers within the endpoint maximum;
  invalid values return HTTP 400.
- Cursor data never supplies account, branch, customer, permission, or tenant
  scope. Existing authenticated filters remain authoritative and run before
  the keyset predicate.

### Index migration

Migration `20260716_020_cursor_pagination_indexes` adds only these proven
query indexes:

- `customers_account_created_id_cursor_idx` on
  `(account_id, created_at, id)`.
- `orders_account_customer_created_id_cursor_idx` on
  `(account_id, customer_id, created_at, id)`.
- `products_account_sort_id_cursor_idx` on
  `(account_id, sort_order, id)`.
- `products_account_category_sort_id_cursor_idx` on
  `(account_id, category_id, sort_order, id)`.

A fresh isolated database migrated from zero through 020. A second latest run
had no pending migrations. The 020 down migration removed all four new indexes
and left the four sampled pre-existing customer/order/product indexes intact;
the up migration recreated all four exact definitions. No representative
production-sized dataset was available, so actual planner index selection is
not claimed without separate `EXPLAIN` evidence.

### Security and traversal semantics

- Account isolation remains sourced from authenticated user context.
- Reusing a valid same-endpoint cursor under another authenticated account
  cannot expose rows from the first account.
- Customer lookup-only permission still cannot access the full CRM list.
- These confirmed collections are account-level resources and add no branch
  parameter; existing manager and branch permission semantics are unchanged.
- Search, category, customer, account, and permission filters remain active on
  every page.
- Duplicate sort values are resolved by UUID ID ordering.
- Inserting a newer row after a descending first page does not duplicate or
  backfill that row into later pages.
- Pagination is not snapshot isolation. A row whose ordered value changes
  during traversal may move across the cursor boundary.

### R12 validation

| Gate | Result |
| --- | --- |
| Cursor pagination focused tests | PASS - 6/6. |
| Existing customer read-permission tests | PASS - 7/7. |
| Complete isolated API suite | PASS - 20/20 files and 144/144 tests. No skipped tests were added. |
| API TypeScript check | PASS - zero errors. |
| Admin tests | PASS - 3 files and 11/11 tests. |
| Admin production build | PASS. |
| UI color contract | PASS. |
| Fresh migrations 001-020 | PASS. |
| Second migrate-latest run | PASS - no pending migrations. |
| Migration 020 down/up | PASS - new indexes 4 -> 0 -> 4; sampled old indexes remained 4. |
| `git diff --check` | PASS. |

### R12 commits

- `1f0e42a` - endpoint and consumer revalidation.
- `fd1c823` - validated opaque cursor utility.
- `61cb14d` - restaurant collection pagination and complete-list consumers.
- `9ef7277` - product pagination and complete-list consumers.
- `88af514` - query-aligned cursor indexes.
- `9757ae1` - authoritative customer read-route wiring and duplicate removal.
- `f7889b5` - pagination, validation, isolation, and mutation coverage.

### Deferred and remaining risks

- `GET /orders` and `GET /orders/current-shift` still have a hard limit of 200
  and require a separately bounded compatibility decision.
- Dedicated exports remain full-file contracts and were not cursor-paginated.
- Tables, categories, modifier groups, and branch menu remain deliberate
  complete configuration/operational payloads.
- Rows that change `created_at` or `sort_order` during traversal can move
  between pages because this is keyset pagination, not snapshot pagination.
- Large exports may need a dedicated streaming/export path later.

## R13 Node 22 and shared-contract revalidation

Date: 2026-07-16

| Area | Evidence | Classification | R13 action |
| --- | --- | --- | --- |
| Workspace support | Root `package.json` already includes `apps/*` and `packages/*`; `@ykms/bridge-contract` is an existing independent package. | Already fixed. | Reuse the existing npm workspace model. |
| Node runtime declaration | `.nvmrc` and GitHub Actions both select Node 20; root package has no engine contract. | Confirmed. | Standardize on `node >=22 <23` with one `.nvmrc` and the existing CI setup-node mechanism. |
| Node type declarations | API already uses `@types/node` 22. | Already fixed. | Preserve. |
| Admin tests in CI | CI already runs Admin tests before the Admin build. | Already fixed. | Do not duplicate the step. |
| Shared runtime contracts | No general API/Admin contract package exists. Bridge types are device-specific and intentionally side-effect free. | Confirmed. | Add a separate `@ykms/contracts` Zod workspace; do not expand bridge-contract. |
| Pagination response | API `CursorPage<T>` and Admin `CursorResponse<T>` duplicate `data`, `next_cursor`, and `has_more`. | Confirmed. | Share schema and inferred generic response type without changing R12 wire output. |
| Customer DTOs | Customer list/lookup/order-summary fields are repeated in API route types and the Customers/POS Admin code. | Confirmed. | Share only wire DTOs, preserving nullable historical fields. |
| Order status and summary DTOs | Status literals and bounded order-summary fields are repeated across API and Admin; full order/domain models include workflow-specific fields. | Partially fixed. | Share status, monetary wire values, list summary, and customer-order summary only. Keep full order, quote, receipt, KDS, and POS domain models local. |
| API Zod usage | API already validates request contracts with Zod. | Already fixed. | Reuse the installed major version. |
| Admin Zod usage | Admin currently consumes handwritten response types and has no direct Zod dependency. | Confirmed for shared contract tests, invalid for broad runtime parsing in this milestone. | Use shared inferred types in production and validate schemas in the contracts package tests; do not add page-level parsing churn. |
| Standalone app lockfiles | Root `package-lock.json` is the workspace install source; historical app lockfiles are not used by root CI. | Invalid for R13 modification. | Update only the authoritative root lock through npm. |

R13 will not move Express, Knex, React, environment access, database rows,
order workflow commands, quote logic, receipts, or full product/order domain
models into the shared package. No wire format, SQL, permission, UI, migration,
or business behavior change is authorized by this revalidation.

## R13 implementation and validation

Date: 2026-07-16

R13 is complete. The root runtime contract is `node >=22 <23`; `.nvmrc` and
GitHub Actions select Node 22. The existing Admin test step remains singular in
CI. A clean lockfile install and every R13 gate ran under official Node
`v22.23.1` with npm `10.9.8`.

The new `@ykms/contracts` workspace is a strict, side-effect-free CommonJS
package built before API and Admin compilation. It contains no Express, Knex,
React, environment, database, or server-only imports. Its bounded contract
scope is:

- generic cursor response metadata: `data`, `next_cursor`, and `has_more`;
- customer address, lookup, and full list wire DTOs;
- order status literals, numeric/string money wire values, order list summary,
  and customer-order summary DTOs.

The API cursor helper and Admin all-pages helper now share the pagination type.
Customer route rows, the Customers screen, and POS lookup use the customer
contracts. API order status validation, the Orders screen, and POS shift-order
summary use the bounded order contracts. Existing runtime parsing, SQL,
permission checks, response fields, Arabic messages, and UI behavior remain
unchanged.

Full order details, command/request payloads, quotes, receipts, KDS models,
payment models, product/menu domains, analytics, and database row models remain
local by design. Moving them without a proven drift boundary is deferred.

### R13 validation

| Gate | Result |
| --- | --- |
| Node runtime | PASS - official Node `v22.23.1`, npm `10.9.8`. |
| Clean lockfile install | PASS - `npm ci --no-audit --no-fund`. |
| Contracts build | PASS - strict TypeScript declaration build. |
| Contracts tests | PASS - 1 file, 13/13 tests. |
| API TypeScript check | PASS - zero errors. |
| Complete isolated API suite | PASS - 20/20 files, 144/144 tests. |
| Admin tests | PASS - 3 files, 11/11 tests. |
| Admin production build | PASS. |
| UI color contract | PASS. |
| R12 response compatibility | PASS - existing pagination suite remained green. |
| Migrations | NOT REQUIRED - no schema changes in R13. |
| `git diff --check` | PASS. |

### R13 commits

- `7bc6679` - Node and shared-contract revalidation.
- `0227141` - Node 22 project and CI declarations.
- `9c72b3a` - shared Zod contracts workspace.
- `c77e3a3` - shared pagination and customer contracts.
- `784991e` - POS customer lookup contract.
- `5b20a29` - bounded order DTO contracts.
- `b44cf77` - schema and cross-workspace compile coverage.
