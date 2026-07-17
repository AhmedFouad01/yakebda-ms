# Reporting Foundation Manual QA Matrix

Status: **PENDING LOCAL REVIEW**.

This document is a release gate. CI, component tests and code inspection do not count as real-browser visual acceptance.

## Exact branch/head

Record the tested `feature/reporting-foundation` head before starting. Any later commit invalidates the evidence and requires a rerun.

## Environment

- Use an isolated QA database.
- Do not touch `ykms` or `ykms_main_qa_clone`.
- Run the real Admin and API applications.
- Keep the browser console and Network panel visible.
- The pinned Apache ECharts 6.1.0 ESM asset must load successfully; also test the deliberate network-failure fallback.

## Required roles

1. Account-wide user with `reports.view`.
2. Branch-scoped user with `reports.view` and no `branches.manage`.
3. User without `reports.view`.

## Required viewports

| Viewport | Theme | Role | Status |
|---|---|---|---|
| 1920 × 1080 | Light | Account-wide | Pending |
| 1920 × 1080 | Dark | Account-wide | Pending |
| 1366 × 768 | Light | Account-wide | Pending |
| 1366 × 768 | Dark | Account-wide | Pending |
| 728 × 900 | Light | Account-wide | Pending |
| 728 × 900 | Dark | Account-wide | Pending |
| 728 × 900 | Light | Branch-scoped | Pending |

## Required workflows

- Initial catalog and branch bootstrap.
- Initial report run.
- Period changes: 7, 30 and 90 days.
- Account-wide all-branches run.
- Allowed branch run.
- Branch-scoped user default branch run.
- Attempt to request a disallowed branch through the API.
- Manual refresh.
- Report-run failure after a previously successful run; old data must disappear.
- Bootstrap failure and successful retry of catalog/branches.
- Empty datasets.
- Long Arabic branch/source/product names.
- Negative payment totals after refunds.
- ECharts network failure; warning and table fallback remain readable.
- Expand and collapse every chart data table.

## Visual and accessibility checks

- Arabic RTL order is correct.
- Light/Dark semantic contrast is usable.
- ECharts labels, axis values and tooltips are visible and not clipped.
- Chart SVG resizes when the panel or viewport changes.
- The data-table alternative contains the same rows and numeric formatting.
- Keyboard can reach filters, buttons and every `<summary>` control.
- Focus ring is visible.
- No page-level horizontal overflow:

```js
document.documentElement.scrollWidth <= window.innerWidth
```

- Wide tables scroll inside their panel only.
- Request ID and timezone metadata wrap without breaking the layout.
- No console errors.
- No unexplained failed requests.
- No POS, KDS or AppShell regression.

## Evidence

Store local screenshots under:

```text
artifacts/qa/reporting-foundation/
```

Do not commit screenshots unless explicitly requested.

Record for every screenshot:

- exact head SHA;
- viewport;
- theme;
- role;
- workflow/state;
- pass/fail;
- defect fixed, if any.

## Acceptance

PR #44 must remain Draft until this matrix is completed against the exact final head and reviewed locally by the user.
