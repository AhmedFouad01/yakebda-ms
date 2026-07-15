# CSS Consolidation Plan — P2 Baseline

**Generated:** 2026-07-13T14:43:31.937Z  
**Branch:** refactor/p2-maintainability  
**Source:** apps/admin/src/main.tsx import order  

## Frozen baseline metrics

- Imported CSS files: **18**
- CSS lines: **9501**
- `!important` occurrences: **1483**
- `.posx-head` selector occurrences: **7**
- `.posx-grid` selector occurrences: **22**
- `.posx-card` selector occurrences: **6**
- Physical directional declarations: **11**
- `apps/admin/src/pages/Pos.tsx`: **1503 lines**
- Shared overlay focus trap present: **no**

## Imported CSS inventory

| # | File | Lines | !important | posx-head | posx-grid | posx-card | physical RTL props |
|---:|---|---:|---:|---:|---:|---:|---:|
| 1 | `apps/admin/src/styles.css` | 370 | 1 | 2 | 1 | 3 | 0 |
| 2 | `apps/admin/src/ykms-02d.css` | 135 | 1 | 4 | 2 | 3 | 0 |
| 3 | `apps/admin/src/ykms-02f.css` | 582 | 7 | 1 | 6 | 0 | 0 |
| 4 | `apps/admin/src/pos-operational.css` | 237 | 43 | 0 | 4 | 0 | 0 |
| 5 | `apps/admin/src/pos-final.css` | 512 | 123 | 0 | 2 | 0 | 5 |
| 6 | `apps/admin/src/pos-card-layout-fix.css` | 86 | 41 | 0 | 2 | 0 | 0 |
| 7 | `apps/admin/src/ui-cleanup.css` | 2276 | 43 | 0 | 1 | 0 | 4 |
| 8 | `apps/admin/src/theme.css` | 745 | 231 | 0 | 0 | 0 | 0 |
| 9 | `apps/admin/src/theme-interactions.css` | 96 | 22 | 0 | 0 | 0 | 0 |
| 10 | `apps/admin/src/ui-polish.css` | 500 | 93 | 0 | 0 | 0 | 0 |
| 11 | `apps/admin/src/ui-polish-final.css` | 841 | 142 | 0 | 0 | 0 | 0 |
| 12 | `apps/admin/src/final-closure.css` | 1550 | 241 | 0 | 0 | 0 | 0 |
| 13 | `apps/admin/src/select-rendering-fix.css` | 71 | 19 | 0 | 0 | 0 | 0 |
| 14 | `apps/admin/src/pos-1920-density.css` | 154 | 63 | 0 | 3 | 0 | 2 |
| 15 | `apps/admin/src/pos-delivery-checkout.css` | 115 | 19 | 0 | 0 | 0 | 0 |
| 16 | `apps/admin/src/pos-fast-rail.css` | 481 | 90 | 0 | 1 | 0 | 0 |
| 17 | `apps/admin/src/pos-fast-rail-final.css` | 415 | 204 | 0 | 0 | 0 | 0 |
| 18 | `apps/admin/src/global-colors.css` | 335 | 100 | 0 | 0 | 0 | 0 |

## Import order contract

1. `apps/admin/src/styles.css`
2. `apps/admin/src/ykms-02d.css`
3. `apps/admin/src/ykms-02f.css`
4. `apps/admin/src/pos-operational.css`
5. `apps/admin/src/pos-final.css`
6. `apps/admin/src/pos-card-layout-fix.css`
7. `apps/admin/src/ui-cleanup.css`
8. `apps/admin/src/theme.css`
9. `apps/admin/src/theme-interactions.css`
10. `apps/admin/src/ui-polish.css`
11. `apps/admin/src/ui-polish-final.css`
12. `apps/admin/src/final-closure.css`
13. `apps/admin/src/select-rendering-fix.css`
14. `apps/admin/src/pos-1920-density.css`
15. `apps/admin/src/pos-delivery-checkout.css`
16. `apps/admin/src/pos-fast-rail.css`
17. `apps/admin/src/pos-fast-rail-final.css`
18. `apps/admin/src/global-colors.css`

## Visual freeze matrix

Reference images must be captured before geometry-changing consolidation. Required screens: POS, KDS, Orders detail, Menu, Customers, Users. Required viewports: 1366×768 and 1920×1080. Capture both Light and Dark where the screen supports both themes.

Expected location: `docs/engineering/visual-baseline/p2-before/`. Naming: `<screen>--<theme>--<width>x<height>.png`.

**Status:** inventory generated; reference screenshots are a hard gate before the first CSS duplicate is removed.

## Execution order

1. Capture and approve the visual baseline pack.
2. Add R10 frontend tests before R9 extraction.
3. Consolidate `.posx-head`, then `.posx-grid`, then `.posx-card`, with build and screenshot parity after each checkpoint.
4. Collapse imported CSS to at most three authoritative layers without redesign.
5. Remove cascade-only `!important` declarations in verified waves.
6. Fix RTL drawer entry direction, add shared focus trapping, and convert physical directional properties to logical properties.
7. Extract POS children after tests are green.

## Risk controls

- No API or migration changes.
- No visual redesign.
- Unknown rules stay in place and are documented rather than deleted.
- `global-colors.css` remains the final color authority until the controlled layer collapse checkpoint.
- Product Grid and KDS geometry are frozen unless a parity defect requires restoration.
