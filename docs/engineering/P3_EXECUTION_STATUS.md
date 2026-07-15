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

These discrepancies remain visible baseline blockers and must not be hidden or
silently changed inside R11. Because neither is caused by P2, the requested P3.1
observability revalidation may proceed.

## Runtime isolation

- PostgreSQL databases used: `ykms_p3_1741349_dev` and
  `ykms_p3_1741349_test`.
- API verification origin: `http://127.0.0.1:3011`.
- Admin verification origin: `http://127.0.0.1:5199`.
- Migration and seed logs were written outside the repository under
  `C:\Users\10\Downloads`.
- No production data, API business logic, migrations, Inventory, or Accounting
  files were modified.

## Next bounded milestone

Revalidate the P3 audit against the merged tree, then implement only P3.1 R11:
request correlation, structured safe logging, redaction, and separate liveness
and readiness checks. R12 and R13 remain deferred.
