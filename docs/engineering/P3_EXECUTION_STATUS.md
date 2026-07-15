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
