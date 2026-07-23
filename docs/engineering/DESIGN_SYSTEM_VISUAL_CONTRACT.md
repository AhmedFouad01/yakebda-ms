# DESIGN-SYS-01 Visual Contract

Status: **DS1 Reports pilot implemented and locally validated**.

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

The following are outside DS0 and DS1:

- AppShell layout, navigation, and identity.
- POS grid, search position, cart behavior, interaction count, keyboard and
  pointer behavior, and product-option flow.
- Dashboard layout and component extraction.
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
| Reports | DS1 locally validated | Reading spacing, content spacing, hero/page/section/body/label type, card radius, control height, divider width | Chart canvas heights, responsive breakpoints, grid minimums, the visually-hidden accessibility utility, and a visible marker for a one-point line series remain approved screen/accessibility exceptions | Proceed to DS2 before Gate A |
| Dashboard | Not started | — | Existing screen CSS | Wait for DS2 |
| POS | Not started | — | Existing operational CSS | Wait for DS3 and Gate B |
| Accounting | Not started | — | Existing tab CSS | Wait for DS4 |
| Inventory | Not started | — | Existing screen CSS | Wait for DS5 |
| Orders | Not started | — | Existing screen CSS | Wait for DS5 |
| KDS | Not started | — | Existing screen CSS | Wait for DS5 |
| Settings | Not started | — | Existing screen CSS | Wait for DS6 |
| Users | Not started | — | Existing screen CSS | Wait for DS6 |

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
