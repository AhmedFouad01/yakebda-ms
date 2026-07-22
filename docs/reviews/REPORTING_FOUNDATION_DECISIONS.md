# Reporting Foundation Decisions

- Reporting work is based directly on `main` and does not stack on Inventory PRs.
- Report definitions are code-owned; runtime users cannot provide SQL, JavaScript, HTML or CSS.
- Definitions declare typed filters, dimensions, measures, output capabilities, default template keys, query versions and required permissions.
- Current HTTP responses use `ReportResponseMeta`; they are not represented as persisted or immutable Report Runs.
- Sales trend, branch and source are separate report definitions and separate endpoints.
- Branch-scoped users remain restricted by the existing branch-access policy.
- A selected branch uses its configured timezone. An all-branches run uses the explicit account-default reporting timezone (`Africa/Cairo`) and declares `timezone_policy=account_default`.
- Order-source history uses the snapshot captured on the order before the current source name.
- Top products are grouped by stable product ID. Their value is named `gross_item_sales`; refund allocation and net product revenue remain future work.
- Payment reports exclude `unpaid` markers and include immutable negative refund rows in the net collected amount.
- The Admin clears prior results before a new run; a failed filtered run must never leave old numbers presented under new controls.
- Catalog/branch bootstrap and report-run retry paths are independent.
- Apache ECharts 6.1.0 is isolated behind one adapter, uses the SVG renderer, semantic theme tokens and visible table alternatives.
- The current connector-only branch pins the ECharts CDN asset. Production must vendor it or add it through the normal npm lockfile workflow before deployment.
- Templates, durable runs/snapshots, exports and printing remain later focused scopes.
