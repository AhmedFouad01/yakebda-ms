# DESIGN-SYS-01 Visual Contract

Status: **Gate A merged and documented; decision: CONTINUE; DS3 remains local-only and unpublished**.

This document records the repository-safe implementation contract and token
adoption state. It contains engineering facts only; visual reference material
and review rationale remain outside the repository.

## Baseline

- Exact `origin/main` SHA at rollout start:
  `b3f93116b4c02b0c8a1333c05fee227d4c52fab0`.
- Baseline screens: Reports, Dashboard, and POS.
- Themes: Light and Dark.
- Viewports: `1920x1080`, `1366x768`, and `390x844`.
- All 18 baseline states had `document.documentElement.scrollWidth <= window.innerWidth`.
- Screenshots are local QA artifacts under `/tmp/yakebda-ds01-baseline` and are
  intentionally not committed.
- The real Admin and API applications used the isolated `ykms_ds01_qa`
  database. The `ykms` database was not used.

| Screen | Light 1920 | Dark 1920 | Light 1366 | Dark 1366 | Light 390 | Dark 390 |
|---|---|---|---|---|---|---|
| Reports | Captured | Captured | Captured | Captured | Captured | Captured |
| Dashboard | Captured | Captured | Captured | Captured | Captured | Captured |
| POS | Captured | Captured | Captured | Captured | Captured | Captured |

## Scope Rules

- Global-safe: semantic color roles, tabular numbers, one-pixel structural
  dividers, the approved radius hierarchy, and responsive containment.
- Reading screens: hero numbers, reading-section spacing, flat KPI blocks, and
  restrained chart presentation.
- Operational screens: dense spacing and operational emphasis remain owned by
  each operational screen.
- Target-only rules are not propagated outside an explicitly opened screen.
- Shared primitives remain unchanged unless opened as a separate reviewed
  scope.
- Screen-owned CSS must use the approved `--ds-*` tokens when that screen is
  migrated. Raw colors remain prohibited.

## Protected Geometry

The following remain outside the completed DS0-DS2 scope:

- AppShell layout, navigation, and identity.
- POS grid, search position, cart behavior, interaction count, keyboard and
  pointer behavior, and product-option flow.
- API contracts, report aggregation, permissions, and error isolation.
- Shared `.card`, `.panel`, `button`, `table`, and heading selectors.

## Additive Tokens

The additive block in `apps/admin/src/theme.css` defines:

- Reading and operational section spacing plus content spacing.
- Hero, page-title, section-title, body, and label type sizes.
- Card radius, control height, and structural divider width.

The block does not change existing selectors. `global-colors.css` remains the
final color authority.

## Token Adoption Ledger

| Screen | Status | Tokens used | Legacy remaining | Decision |
|---|---|---|---|---|
| Reports | DS1 done / merged | Reading spacing, content spacing, hero/page/section/body/label type, card radius, control height, divider width | Chart canvas sizing, Chart.js geometry, responsive breakpoints, grid minimums, pill geometry, and the visually-hidden accessibility utility remain approved screen-owned exceptions | Gate A: CONTINUE / Closed |
| Dashboard | DS2 done / merged | Reading spacing, content spacing, hero/page/section/body/label type, card radius, divider width | Existing 30px logo geometry, 640px table minimum, responsive breakpoints, and 150px KPI grid minimum remain approved screen-owned exceptions | Gate A: CONTINUE / Closed |
| POS | DS3 locally validated / not published | Operational spacing/type roles, tabular numbers, card radius, and divider width on the frozen local branch only | Accepted AppShell/POS geometry, responsive density rules, product media sizing, cart width/position, search order, and 390px containment remain local-only evidence | Gate B: CONTINUE locally |
| Accounting | Not started | — | Existing tab CSS | Wait for DS4 |
| Inventory | Not started | — | Existing screen CSS | Wait for DS5 |
| Orders | Not started | — | Existing screen CSS | Wait for DS5 |
| KDS | Not started | — | Existing screen CSS | Wait for DS5 |
| Settings | Not started | — | Existing screen CSS | Wait for DS6 |
| Users | Not started | — | Existing screen CSS | Wait for DS6 |

## Adopted Token Detail

### Reports

- Implementation: **Done**.
- Validation: **Done**.
- Merge Status: **Merged**.
- Rollout Stage: **DS1 complete**.

| Token | Verified selectors or use |
|---|---|
| `--ds-space-reading-section` | `.rpt-page` and `.rpt-grid` gaps |
| `--ds-space-content` | Report card padding, grids, filters, chart/table metadata, and internal gaps |
| `--ds-type-hero` | `.rpt-metric dd` |
| `--ds-type-page-title` | `.rpt-page .uif-pagehead h1` |
| `--ds-type-section-title` | Report section and catalog headings |
| `--ds-type-body` | `.rpt-page` |
| `--ds-type-label` | Filter labels, period controls, metric labels, and metadata |
| `--ds-radius-card` | Report cards, catalog cards, and chart canvas |
| `--ds-control-height` | Page actions, filter action, and period controls |
| `--ds-divider-width` | Report cards, catalog cards, warnings, chart data, and metadata borders |

#### Approved Reports raw-value exceptions

- Value / Selector: `.rpt-chart-canvas` uses `280px`/`220px`; at `720px` it uses `240px`/`200px`; at `440px` it uses `220px`.
- Category: Chart-specific / Responsive.
- Reason: Preserve readable chart plotting height while containing the chart at narrow widths.
- Owner: Reports screen (`reports.css`).
- Review condition: Revisit when a shared chart-sizing primitive is justified by another migrated chart screen.
- Status: Approved exception.

- Value / Selector: `ReportChart` uses line tension `0.25`, one-row point radius `4` (otherwise `0`), hover radius `4`, bar radius `6`, and maximum bar thickness `28`.
- Category: Chart-specific.
- Reason: Chart.js rendering geometry is dataset-specific; the one-point marker prevents a valid single-value line series from becoming invisible.
- Owner: Reports chart adapter (`ReportChart.tsx`).
- Review condition: Revisit if chart behavior becomes shared across another screen or the chart adapter changes.
- Status: Approved exception.

- Value / Selector: Reports breakpoints are `1280px`, `980px`, `720px`, and `440px`.
- Category: Responsive.
- Reason: They correspond to catalog, two-column report, filter, KPI, and chart containment transitions owned by the Reports screen.
- Owner: Reports screen (`reports.css`).
- Review condition: Replace only if the repository adopts reviewed global breakpoint tokens without changing the verified layouts.
- Status: Approved exception.

- Value / Selector: Filter columns use `minmax(280px, 1fr)` and `minmax(220px, 1fr)`; KPI columns use `minmax(150px, 1fr)`; report tables use a `480px` minimum inline size.
- Category: Layout.
- Reason: These minimums protect label/control readability and local table scrolling without changing AppShell geometry.
- Owner: Reports screen (`reports.css`).
- Review condition: Revisit after a shared responsive filter, metric-grid, or data-table primitive is proven.
- Status: Approved exception.

- Value / Selector: `.rpt-period-pills button` uses a `999px` radius.
- Category: Geometry.
- Reason: The raw radius is intrinsic to the pressed-state pill affordance rather than the card-radius hierarchy.
- Owner: Reports screen (`reports.css`).
- Review condition: Revisit if a shared segmented/pill control is introduced through a separately reviewed scope.
- Status: Approved exception.

- Value / Selector: `.rpt-visually-hidden` uses `1px` dimensions, `-1px` margin, and `clip: rect(0, 0, 0, 0)`.
- Category: Accessibility.
- Reason: The standard visually-hidden geometry exposes chart names and descriptions to assistive technology without adding visible layout.
- Owner: Reports screen (`reports.css`).
- Review condition: Replace only when an equivalent shared accessibility utility is reviewed and proven.
- Status: Approved exception.

### Dashboard

- Implementation: **Done**.
- Validation: **Done**.
- Merge Status: **Merged**.
- Rollout Stage: **DS2 complete**.

| Token | Verified selectors or use |
|---|---|
| `--ds-space-reading-section` | `.dash-page` gap and dashboard empty-state padding |
| `--ds-space-content` | Metric, heading, audit, and table spacing |
| `--ds-type-hero` | `.dash-metric dd` |
| `--ds-type-page-title` | `.dash-page-head h1` |
| `--ds-type-section-title` | `.dash-section-head h2` |
| `--ds-type-body` | `.dash-page` and audit table |
| `--ds-type-label` | Supporting copy, metric labels, and table headings |
| `--ds-radius-card` | Audit table surface |
| `--ds-divider-width` | Audit table surface, rows, and cells |

#### Approved Dashboard raw-value exceptions

- Value / Selector: `.dash-page-head .brand-logo` uses `30px` inline and block size.
- Category: Geometry.
- Reason: Preserve the verified brand-mark geometry without changing AppShell or shared brand primitives.
- Owner: Dashboard screen (`dashboard.css`).
- Review condition: Revisit only with an approved shared brand-size contract.
- Status: Approved exception.

- Value / Selector: `.dash-table-wrap table` uses a `640px` minimum inline size.
- Category: Layout.
- Reason: Preserve audit-column readability while the screen-owned wrapper provides local horizontal scrolling.
- Owner: Dashboard screen (`dashboard.css`).
- Review condition: Revisit after a shared responsive data-table primitive is proven.
- Status: Approved exception.

- Value / Selector: `.dash-metrics` uses `minmax(150px, 1fr)`.
- Category: Layout.
- Reason: Keep hero metrics readable before the screen switches to its explicit narrow layouts.
- Owner: Dashboard screen (`dashboard.css`).
- Review condition: Revisit after a third migrated metric grid proves shared geometry.
- Status: Approved exception.

- Value / Selector: Dashboard breakpoints are `720px` and `440px`.
- Category: Responsive.
- Reason: They control the verified two-column and one-column KPI transitions without changing global navigation geometry.
- Owner: Dashboard screen (`dashboard.css`).
- Review condition: Replace only under a reviewed global breakpoint contract that preserves the accepted layouts.
- Status: Approved exception.

## DS1 Reports Pilot

The Reports pilot is visual-only:

- Operational summary KPIs use flat definition-list metric blocks.
- Displayed numbers use tabular numerals; KPI values use the hero type token.
- The three fixed period choices render as accessible pressed-state pills.
- Catalog cards, report charts, tables, filters, and metadata retain explicit
  surfaces.
- Chart.js line and bar presentation follows the DS1 target while preserving
  the accessible text description and table fallback. A one-point line series
  retains a visible marker; longer line series hide persistent points.
- No report request, response, calculation, permission, or retry behavior is
  changed.

## Acceptance

Before DS1 can be marked complete:

```bash
npm run check
git diff --check
```

The exact candidate head must also pass Light/Dark browser review at 1920,
1366, and 390 widths, keyboard focus inspection, RTL inspection, console and
network checks, and page-level overflow checks.

### DS1 Local Validation

Completed on 2026-07-23 against the working tree based on the recorded
baseline SHA:

| Gate | Result |
|---|---|
| `npm run check` | Pass |
| Contracts tests | 13/13 |
| API tests | 314/314 |
| Admin tests | 73/73 |
| API TypeScript build | Pass |
| Admin production build | Pass |
| Semantic color contract | Pass |
| `git diff --check` | Pass |
| Light/Dark at 1920, 1366, and 390 | Pass |
| Page and main-content horizontal overflow | None |
| Keyboard focus | Visible |
| RTL | Pass |
| Browser console errors | None |
| Report requests | 200/304; no 500 responses |

Candidate screenshots are local QA artifacts under
`/tmp/yakebda-ds01-candidate` and are intentionally not committed.

## DS2 Dashboard Pilot

The Dashboard pilot is visual-only:

- The summary KPIs use a flat definition-list structure without card surfaces.
- Displayed values use tabular numerals and the hero type token.
- Page and section headings, supporting text, and reading-screen spacing use
  the approved hierarchy and spacing tokens.
- The recent-audit table remains an explicit contained surface with horizontal
  scrolling at narrow widths.
- Existing request paths, permission guards, calculations, data slicing,
  navigation, and error behavior are unchanged.
- Reports and Dashboard now prove a repeated metric structure, but the markup
  remains small and the grids and semantics are screen-owned. No shared
  component is extracted; reconsider after a third real use or shared behavior.

### DS2 Local Validation

Completed on 2026-07-23 on the same pilot branch and against the same isolated
`ykms_ds01_qa` database:

| Gate | Result |
|---|---|
| `npm run check` | Pass |
| Contracts tests | 13/13 |
| API tests | 314/314 |
| Admin tests | 74/74 |
| API TypeScript build | Pass |
| Admin production build | Pass |
| Semantic color contract | Pass |
| `git diff --check` | Pass |
| Dashboard Light/Dark at 1920, 1366, and 390 | Pass |
| Reports Light/Dark regression check at 1366 | Pass |
| Page and main-content horizontal overflow | None |
| Narrow audit-table containment | Pass; local horizontal scroll only |
| Screen-owned keyboard interactions | None introduced |
| RTL | Pass |
| Browser console errors | None |
| Dashboard requests | 200/304; no 500 responses |

Candidate screenshots are local QA artifacts under
`/tmp/yakebda-ds02-candidate` and are intentionally not committed.

## Gate A

- Gate A Decision: **CONTINUE**.
- Status: **Merged and documented**.
- PR: [#49](https://github.com/AhmedFouad01/yakebda-ms/pull/49).
- Reviewed Head: `a9b8a769b8e17006f113f3580da0f83104dc4b8e`.
- Merge Commit: `d90b3916f731dc566e4d283732b31fbc9658a30a`.
- Merged Into Main: `d90b3916f731dc566e4d283732b31fbc9658a30a`.
- Merged At: `2026-07-23T13:28:36Z`.

- The Reports and Dashboard pilots preserve the intended visual direction in
  both themes and all required viewport widths.
- The additive token set covers both reading screens without raw colors,
  global selector changes, or screen-to-screen overrides.
- Repetition is now visible in the metric structure, but it does not yet
  justify a shared component because the markup is small and behavior is not
  shared.
- The remaining geometry exceptions are explicit and screen-owned rather than
  new cross-screen CSS debt.

## Gate A Rollout Summary

| Stage | State |
|---|---|
| DS0 | Done |
| DS1 Reports | Done / Merged |
| DS2 Dashboard | Done / Merged |
| Gate A | CONTINUE / Closed |
| DS3 POS | Locally validated / Not published |
| Gate B | CONTINUE locally |
| DS4 Accounting | Not started |

## DS3 Frozen Local State

- Implementation: **Locally validated**.
- Merge Status: **Not published**.
- Remote Branch: **Absent**.
- PR: **None**.
- Local Branch: `codex/design-sys-pos-pilot`.
- Local HEAD: `0b8a40ffe1d3b5011f61dd53daff477ed7b09e6a`.
- Unique commit: `feat(pos): apply visual design system pilot`.
- Gate B Recommendation: **CONTINUE**.
- DS3 must be re-established over the new `main` in a separate explicitly
  authorized task; it is not merged into or published from this closeout.
