# Reporting Foundation Validation

Validation is performed in two independent gates.

## Gate A — exact-head repository CI

Required on the exact final Draft PR head:

- shared contracts build and tests;
- API TypeScript build;
- migration idempotency;
- full API tests;
- global color contract;
- Admin tests;
- Admin production build;
- zero skipped tests.

The final workflow run ID, conclusion and exact head SHA must be recorded in the PR description and remediation report.

## Gate B — local real-browser review

Required before Ready-for-Review or merge:

- complete `REPORTING_FOUNDATION_MANUAL_QA.md` against the same exact head;
- verify Apache ECharts SVG rendering and semantic colors in Light/Dark;
- verify the accessible table fallback;
- verify account-wide and branch-scoped users;
- verify loading, empty, bootstrap error/retry, report error/retry and stale-result prevention;
- verify desktop and narrow RTL layouts;
- verify no page-level horizontal overflow and no console errors.

CI success does not satisfy Gate B. Manual visual QA must not be claimed from code inspection or component tests.

## Production dependency gate

This branch pins ECharts 6.1.0 through a fixed ESM URL. Before deployment, vendor the asset or add it through the normal npm/package-lock workflow and rerun both gates.
