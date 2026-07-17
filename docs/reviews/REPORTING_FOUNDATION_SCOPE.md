# Reporting Foundation Scope

## Implemented in this branch

- Code-defined active report catalog.
- Shared report definitions and response/run metadata contracts.
- Account- and permission-scoped report routes.
- Optional branch filter with existing branch-access enforcement.
- Branch-timezone-aware daily and period boundaries.
- Sales trend, branch, source, payment-method and top-product datasets.
- Arabic RTL reporting center with one shared filter state.
- Shared number, money, date and run-time formatting.
- Accessible SVG chart abstraction with a table alternative.
- Loading, empty, error, retry and responsive states.

## Boundaries

- No Inventory operational dependency.
- No report template designer.
- No PDF, CSV or XLSX export.
- No printing integration.
- No report snapshots or persistence tables.
- No Finance or Accounting UI.
- No deployment.

## Known follow-up

Apache ECharts is not added in this branch. The chart surface is an internal accessible SVG abstraction so screen contracts, semantic styling and table alternatives can stabilize without introducing a package-lock change. A later focused adapter can replace the renderer while preserving the report data contract and accessibility fallback.
