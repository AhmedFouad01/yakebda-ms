# R8 Wave 4 — Preparatory Inventory (4A)

**Generated:** 2026-07-16 (wave 4A, no CSS changes)
**Head:** `bf506f6` (wave 3B)
**Counter:** frozen baseline 1483 → **356** (theme.css 256 + global-colors.css 100) = 76.0% removed. Target ≤148 (remove ≥208 more).

## Proof status (computed-style parity harness)

| Wave | Scope | 1366×768 | 1920×1080 |
|---|---|---|---|
| 1 | POS (789) | ✅ 8 states | ✅ (same pass) |
| 2 | KDS (150 + group fixes) | ✅ | ✅ (4 states) |
| 3A | Settings (107) | ✅ 24 states | ✅ 24 states (retro, this wave) |
| 3B | Menu/CRM/Orders/Reports (47) | ✅ 18 states | ✅ 18 states (retro, this wave) |

Retro-verification method: pre-3A `theme.css` blob checked out from `8c56f91`,
42 baselines captured at 1920 (both themes), HEAD blob restored, all states
re-measured: **42/42 zero diffs**. Working tree returned byte-identical to HEAD.

## Baseline matrix now live (128 states total, distributed across both widths and themes)

- Settings: 12 sections × 2 themes × 2 widths = 48 states
- Menu (list/editor/cats/mods), CRM (list/profile), Orders (list/modal), Reports: 9 × 2 × 2 = 36 states
- Generic pages (pre-4B baselines, HEAD code): dashboard, users, branches,
  devices, hardware, print-jobs, api-clients, audit, KDS, POS closed,
  POS history drawer = 11 × 2 themes × 2 widths = 44 states

**SUPERSEDED — incorrectly captured at 1180×910:** the original wave-3A/3B
baselines labelled "1366" were captured while the browser pane measured
1180×910. Their zero-diff comparisons remain valid as *internal parity*
(same environment before/after each strip) but are NOT true-viewport proof.
They were re-captured at the real 1366×768 during wave 4B and those 42
recaptures are the official 1366 reference from `a70cd3b` onward.

Element counts are identical across themes and widths per page — structural
determinism holds. Baselines live in the browser session; if the session dies
they are recaptured at the start of the consuming batch.

## Remote state (as of wave 4B)

All R8 wave commits (`7ffc96f`…`a70cd3b`) are **local only** — no push has
been made. GitHub PR #34 still points at `3862b673` and remains
Open / Draft / Unmerged. Pushing requires explicit authorization.

## Classification of the remaining 256 (theme.css)

| Batch | Bucket | Count | Top selectors | Risk |
|---|---|---|---|---|
| 4B | B1 select geometry | 30 | `.app2 select` (27), `:focus` variants (3) | shared — every page with a select |
| 4B | B2 steppers | 8 | `.uif-number-stepper` (6), stepper buttons (2) | settings-owned in practice |
| 4B | B3 buttons | 40 | `.seg > button` (12), `.uif-btn.primary/ghost/danger` (9), `button.sm/secondary` | shared — all pages |
| 4B | B4 inputs | 6 | `.app2 :is(input…)` groups | shared |
| 4C | dialogs/forms/tables | 60 | `.modal > .form-row` (10), `.table-action` (5), `.receipt` (4), `.order-actions` (4), report/table `th` | shared; `.receipt` needs print-view eyeball |
| 4D | mixed/legacy-other | 105 | `:is(button…)` typography groups, `.uif-card-head`, `.alert/.ok`, print-jobs `.stub.*` (9) | mixed groups → split/exclude/bump tools |
| X | picker/pseudo | 5 | `select::picker-icon` (2), `*::-webkit-scrollbar-*` (3) | **eyeball-only** — invisible to the harness |
| 4E | global-colors.css | 100 | enforcement blankets | separate checkpoints; never in a theme.css commit |

## Execution rules for 4B–4E

1. Sub-batch strips (one bucket or less at a time), full 128-state re-measure
   after each, conflicts resolved with the proven tools: group splitting,
   `:not()` exclusion, documented specificity bump — never new `!important`.
2. Picker/scrollbar rules verified by opening real pickers and scrolling.
3. `global-colors.css` (4E) is its own checkpoint series (per-blanket), kept
   out of every theme.css commit.
4. Gates per checkpoint: `admin:build`, `ui:colors:check`, admin vitest,
   zero-diff parity, no push without explicit authorization.
