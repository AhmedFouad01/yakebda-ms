# Legacy UI Cascade Audit

## Scope

This audit covers the Admin/POS style cascade loaded by `apps/admin/src/main.tsx` after the PR #14 merge. It was triggered by repeated visual regressions: browser-looking buttons, weak selected states, inconsistent list actions, and settings controls that changed appearance between screens.

## Finding

The screenshots were not isolated component defects. The primary cause is an accumulated CSS cascade with several generations of shared control rules loaded together:

1. `styles.css` — original global page, table, form, button, POS, and modal rules.
2. `ykms-02d.css` — additional operational/POS and legacy control rules.
3. `ykms-02f.css` — a second UI framework layer with its own controls, tabs, drawers, and shell rules.
4. `pos-operational.css`, `pos-final.css`, `pos-card-layout-fix.css` — specialized POS corrections.
5. `ui-cleanup.css` — semantic control normalization.
6. `theme.css` and `theme-interactions.css` — theme and interaction authority.
7. `ui-polish.css`, `ui-polish-final.css`, `final-closure.css` — later geometry and visual overrides.

Several files target the same raw selectors (`button`, `select`, `input`, `table`, `.seg button`, `.form-row`) with different specificity. Components that use explicit UI primitives are generally stable; raw legacy elements can fall through to an older rule or receive geometry from one layer and color from another.

## Confirmed failure modes

- Unclassed table and modal buttons retained browser-like geometry.
- Selected tabs depended on `.active` styling that could be visually neutralized by later generic button rules.
- Order list action cells had no shared action-button contract.
- Settings document rows, embedded CRUD tables, selects, and numeric controls used different layout rules.
- Modal form footers inherited the legacy `.form-row` panel treatment.
- Similar lists used different wrappers, so table spacing and action alignment varied by page.

## Decision for this patch

`final-closure.css` remains the last imported compatibility contract and now owns:

- raw back-office button normalization;
- semantic success/secondary/danger interactions;
- explicit selected and active states;
- shared table/list geometry and action cells;
- modal form/footer geometry;
- Orders list and Order Detail action layout;
- Settings row and embedded CRUD-table alignment;
- responsive behavior for the same patterns.

The patch also adds explicit semantic classes and accessibility states to `Orders.tsx` rather than relying only on inherited selectors.

## Approved visual review follow-up

The approved follow-up is deliberately scoped and does not alter the accepted POS product-card or KDS presentation.

- Settings now use the available viewport, and the product-operation table has explicit responsive column geometry instead of being clipped.
- Reports use responsive summary and report grids; desktop report tables no longer sit inside horizontally scrolling frames.
- RTL selects share one arrow, padding, alignment, focus, and text-size contract.
- Typography tokens define consistent page-title, section, body, table, badge, helper, input, and button sizes for administration screens, modals, and drawers.
- The redundant POS `الإدارة` shortcut was removed without deleting the underlying administration routes.
- Shift order history is collapsed by default, searchable by order number, shows one total-orders KPI, and expands one order at a time before opening full details.

## Retirement plan

The legacy files are not deleted in this patch because they still contain screen-specific layout rules. Safe retirement should be incremental:

1. Move remaining raw buttons, fields, tabs, and table actions to `components/ui/primitives.tsx`.
2. Add page-level visual regression coverage for Orders, Menu, Settings, Users, Customers, and hardware pages.
3. Extract screen-specific rules from `styles.css`, `ykms-02d.css`, and `ykms-02f.css`.
4. Remove duplicate global selectors only after their dependent screens are migrated.
5. Consolidate `ui-polish.css`, `ui-polish-final.css`, and `final-closure.css` after regression coverage exists.

## Non-goals

- No API, database, pricing, order workflow, payment, permission, or audit behavior changes.
- No KDS redesign changes; the accepted KDS presentation remains unchanged.
