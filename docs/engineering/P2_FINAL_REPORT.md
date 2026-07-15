# YAKEBDA MS P2 Maintainability - Final Local Report

## Scope and identity

- Branch: `recovery/p2-ui-regression`
- Recovery start: `583cab74f9968241af444a4f5eb1037202118adc`
- Validated CSS head: `20d02c611997738182c9991895934be2ea11f2ab`
- Visual baseline: `8c56f91`
- Vite: `127.0.0.1:5197`, served from the verified P2 worktree
- API: `127.0.0.1:3001`
- PR #34 status: Draft; not merged or marked Ready

## R8 CSS consolidation

| Metric | Baseline | Final |
|---|---:|---:|
| Direct CSS imports | 18 | 2 |
| Imported CSS LOC | 9,501 | 9,832 |
| `!important` declarations | 1,483 | 6 |
| `!important` reduction | - | 99.60% |
| Physical directional declarations | 11 | 11 |
| `.posx-head` exact definitions | 7 occurrences | 0 |
| `.posx-grid` definitions involving the exact class | 22 occurrences | 11 |
| `.posx-card` exact definitions | 6 occurrences | 0 |

Current import order:

1. `apps/admin/src/theme.css`
2. `apps/admin/src/global-colors.css`

`global-colors.css` is the final color authority. Its declaration inventory is limited to semantic variables and color-bearing properties (`background`, color/border color roles, color-bearing shadows, and scrollbar colors). It contains zero `!important` declarations and no raw color literals.

The 16 former imported CSS files were deleted after their rules were consolidated:

`styles.css`, `ykms-02d.css`, `ykms-02f.css`, `pos-operational.css`, `pos-final.css`, `pos-card-layout-fix.css`, `ui-cleanup.css`, `theme-interactions.css`, `ui-polish.css`, `ui-polish-final.css`, `final-closure.css`, `select-rendering-fix.css`, `pos-1920-density.css`, `pos-delivery-checkout.css`, `pos-fast-rail.css`, and `pos-fast-rail-final.css`.

The `.posx-grid` result consists of one authoritative base rule, responsive media-query overrides, and two child-card sizing rules. It is not multiple competing base definitions. A raw normalized-selector audit still finds 280 repeated selector groups across the consolidated 9,832 LOC; these are primarily responsive variants and property-partitioned legacy groups and remain documented debt rather than a P2 acceptance blocker.

### Intentional `!important` exceptions

The six remaining declarations are safeguards rather than cascade overrides:

1. Reduced-motion transition suppression.
2. Legacy shell visibility guard.
3. Global keyboard focus outline.
4. Native picker child visibility guard.
5. Native picker icon rotation reset.
6. Native picker icon transition suppression.

### Physical-direction exceptions

Eleven declarations remain, matching the original baseline count:

- Fixed POS price and quantity badge corners, including compact responsive positions.
- The accepted left-side POS cart position in the Arabic cashier layout.
- Full-viewport POS cart backdrop edge coverage.
- A legacy position reset that preserves accepted card geometry.

No physical margin, padding, or border declarations were reintroduced. General directional layout uses logical properties.

## R9 POS structure

`apps/admin/src/pages/Pos.tsx` is 7 LOC. `usePosController.ts` is 404 LOC and is accepted as the orchestration/composition facade rather than another workflow owner.

| File | LOC |
|---|---:|
| `PosCart.tsx` | 231 |
| `PosHistory.tsx` | 110 |
| `PosModals.tsx` | 105 |
| `PosWorkspace.tsx` | 143 |
| `ProductCard.tsx` | 177 |
| `ShiftPanel.tsx` | 68 |
| `types.ts` | 160 |
| `usePosCart.ts` | 67 |
| `usePosCatalog.ts` | 79 |
| `usePosController.ts` | 404 |
| `usePosDelivery.ts` | 293 |
| `usePosHistory.ts` | 117 |
| `usePosQuote.ts` | 112 |
| `usePosShift.ts` | 61 |
| `usePosSubmission.ts` | 123 |
| `utils.ts` | 40 |
| `logic.ts` | 158 |

Other production TS/TSX files above 300 LOC remain outside the accepted POS decomposition scope: `Menu.tsx` (556), `menu/ProductEditor.tsx` (535), `Kitchen.tsx` (480), `settings/SourcesSection.tsx` (358), `settings/crudSections.tsx` (325), `Customers.tsx` (319), and `lib/t.ts` (316).

## R10 tests and validation

- `components/ui/overlays.test.tsx`: 3 tests.
- `lib/api.test.ts`: 2 tests.
- `pages/pos/logic.test.ts`: 6 tests.
- Total: 3 files, 11 tests.

Final commands:

- `npm run admin:test`: PASS, 11/11.
- `npm run admin:build`: PASS.
- `npm run ui:colors:check`: PASS.
- `git diff --check`: PASS.

## Visual acceptance

Evidence root:

`C:\Users\10\Downloads\yakebda-p2-reverify-evidence-583cab7\round-26-final-4e-matrix-20d02c6`

- Base matrix: 24 captures (6 screens x 2 viewports x 2 themes).
- Operational matrix: 32 captures (8 states x 2 viewports x 2 themes).
- Measured viewport mismatches: 0.
- Browser page errors: 0.
- Manual review: PASS WITH INTENTIONAL DIFFERENCES.

Reviewed states include POS closed and history-expanded states, KDS, Orders detail modal, Menu and product drawer, Customers and detail drawer, Users and create drawer, AppShell navigation drawer, Settings active state, and Print Jobs.

Drawers open from the right/logical end in RTL. Backdrops cover the application content. Sticky headers/footers, internal scrolling, Light/Dark contrast, and responsive geometry remain operational. Fixture records and approved POS presentation changes differ from the original baseline, but no unexpected P2 regression was found.

Known stored product-image failures remain a fixture/data defect. They were not hidden or replaced by CSS.

The repository capture script requires Playwright but the package is not currently declared in the repository dependency tree. Final evidence used the existing approved script behavior with a temporary, untracked local Playwright/Edge runtime shim outside the repository. This should be normalized in a separate tooling change if repeatable capture is required on a clean machine.

## Waivers

These remain explicitly not verified and must not be reported as PASS:

- Settings hover - Light: `NOT VERIFIED / USER-WAIVED`.
- Keyboard focus-visible - Light/Dark: `NOT VERIFIED / USER-WAIVED`.

## Acceptance

| Requirement | Result |
|---|---|
| R8 CSS consolidation | PASS WITH DOCUMENTED EXCEPTIONS |
| R9 POS decomposition | PASS |
| R10 frontend tests | PASS |
| 24-image base matrix | PASS WITH INTENTIONAL DIFFERENCES |
| 32-image operational matrix | PASS WITH INTENTIONAL DIFFERENCES |
| PR #34 merged/Ready | NO - remains Draft |

No push, merge, rebase, API change, or migration change was performed by this final local gate.
