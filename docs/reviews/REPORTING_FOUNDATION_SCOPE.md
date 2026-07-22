# Reporting Foundation Scope

## Implemented in this branch

- Code-defined report registry with typed filters, dimensions, measures, outputs, template keys and query versions.
- Per-report permission declarations; planned Inventory reports require both `reports.view` and `inventory.view`.
- Request-scoped response metadata with request identity, query version, generating user, effective account/branch scope and timezone policy.
- Distinct report endpoints/runs for sales trend, sales by branch and sales by source.
- Account scope and existing branch-access enforcement on every report query.
- Explicit timezone policy:
  - selected/branch-bound report users use the branch timezone;
  - all-branches reports use the account-default reporting timezone (`Africa/Cairo`) and declare that policy in metadata.
- Historical source labels prefer the order snapshot and group by stable source ID.
- Top products group by stable product ID and explicitly expose Gross item-line value, not net collected revenue.
- Payment reports exclude `unpaid` markers and naturally include immutable negative refund rows.
- Arabic RTL reporting center with one shared filter state.
- Separate bootstrap and report-run error/retry paths.
- Previous data is cleared before a new run, preventing stale results under new filters.
- Shared number, money, date and effective-timezone formatting.
- Apache ECharts 6.1.0 loaded behind one isolated SVG-rendering adapter with semantic theme tokens and an accessible table fallback.
- Loading, empty, error, retry and responsive states.
- Focused API/Admin tests and a mandatory local visual QA matrix.

## Deliberate terminology

The response envelope is `ReportResponseMeta`, not a persisted `ReportRun`. Durable report runs/snapshots are a later capability and must introduce their own persistent identity, status and data/template version references.

## Boundaries

- No Inventory operational dependency.
- No persisted report runs or snapshot tables.
- No report template designer.
- No PDF, CSV or XLSX export.
- No printing integration.
- No Finance or Accounting UI.
- No deployment.

## Production follow-up

The ECharts adapter is pinned to version 6.1.0, but this Draft PR loads the ESM artifact from a fixed CDN URL to avoid an unvalidated lockfile rewrite through the connector-only workflow. Before production/deployment, vendor the pinned asset or add it through the normal npm lockfile workflow, then rerun CI and the complete visual QA matrix.
