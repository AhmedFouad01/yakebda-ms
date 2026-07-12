# Legacy UI Cascade Audit

## Scope

This audit covers the Admin/POS style cascade after the PR #14 merge. It was triggered by repeated visual regressions: browser-looking buttons, weak selected states, inconsistent list actions, and settings controls that changed appearance between screens.

## Finding

The screenshots were not isolated component defects. The primary cause was an accumulated CSS cascade with several generations of shared control rules loaded together:

1. `styles.css` — original global page, table, form, button, POS, and modal rules.
2. `ykms-02d.css` — additional operational/POS and legacy control rules.
3. `ykms-02f.css` — a second UI framework layer with its own controls, tabs, drawers, and shell rules.
4. `pos-operational.css`, `pos-final.css`, `pos-card-layout-fix.css` — specialized POS corrections.
5. `ui-cleanup.css` — semantic control normalization.
6. `theme.css` and `theme-interactions.css` — theme and interaction authority.
7. `ui-polish.css`, `ui-polish-final.css`, `final-closure.css` — later geometry and visual overrides.

Several files targeted the same raw selectors (`button`, `select`, `input`, `table`, `.seg button`, `.form-row`) with different specificity. Components using explicit UI primitives were generally stable; raw legacy elements could fall through to an older rule or receive geometry from one layer and color from another.

## Confirmed failure modes

- Unclassed table and modal buttons retained browser-like geometry.
- Selected tabs depended on `.active` styling that could be visually neutralized by later generic button rules.
- Order list action cells had no shared action-button contract.
- Settings document rows, embedded CRUD tables, selects, and numeric controls used different layout rules.
- Modal form footers inherited the legacy `.form-row` panel treatment.
- Similar lists used different wrappers, so table spacing and action alignment varied by page.
- POS product cards used an interactive article containing nested option buttons, producing a serious accessibility violation.

## Consolidation implemented

The application now has one stylesheet entry: `apps/admin/src/app.css`.

That entry declares an explicit cascade contract:

- `foundation`
- `legacy`
- `operational`
- `semantic`
- `polish`
- `closure`

This replaces twelve direct imports in `main.tsx`. The files are deliberately not concatenated blindly: screen-specific rules remain in their source files while cascade authority is explicit and testable. Physical retirement of the legacy files can now happen incrementally without changing their effective order by accident.

`final-closure.css` remains the compatibility boundary for:

- raw back-office button normalization;
- semantic success/secondary/danger interactions;
- explicit selected and active states;
- shared table/list geometry and action cells;
- modal form/footer geometry;
- Orders list and Order Detail action layout;
- Settings row and embedded CRUD-table alignment;
- responsive behavior for the same patterns.

The POS product card interaction was also corrected structurally: the primary add action is now a semantic button and option buttons are siblings rather than nested interactive controls.

## Automated QA now protecting the cascade

- `tools/qa/audit-css.mjs` verifies the single CSS entry, layer allocation, import order, missing files, and temporary patch-script removal.
- Vitest + React Testing Library cover shared tab, toggle, label, and button semantics.
- Playwright covers the cashier order flow and Order Detail selected states.
- Axe blocks serious/critical WCAG violations.
- A dedicated color-contrast gate runs on Login, Orders, Settings, KDS, and POS.
- POS and KDS have committed visual regression baselines.
- CI uses deterministic database reset and strict `npm ci`.

## Retirement plan

The legacy files are not deleted in this patch because they still contain screen-specific layout rules. Safe retirement remains incremental:

1. Move remaining raw buttons, fields, tabs, and table actions to `components/ui/primitives.tsx`.
2. Extend page-level visual regression coverage to Menu, Settings, Users, Customers, and hardware pages.
3. Extract screen-specific rules from `styles.css`, `ykms-02d.css`, and `ykms-02f.css`.
4. Remove duplicate global selectors after their dependent screens are migrated.
5. Consolidate `ui-polish.css`, `ui-polish-final.css`, and `final-closure.css` once regression coverage exists for every affected screen.

## Acceptance gate

The PR remains Draft until the strict CI run passes on its final head and the final visual review is accepted explicitly. Automated success alone never implies merge approval.

## Non-goals

- No API, database, pricing, order workflow, payment, permission, or audit behavior changes.
- No KDS redesign changes; the accepted KDS presentation remains unchanged.
