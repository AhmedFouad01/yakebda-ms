# P2 Recovery Revalidation Record

**Recorded:** 2026-07-15

**Recovery start:** `583cab74f9968241af444a4f5eb1037202118adc`

**Recovery CSS commit:** `c3043e9076bcc42c8029ebd76fd4ddd98c217b6e`

## Incident and evidence authority

An earlier visual-validation pass was served from the wrong Vite/worktree identity. Evidence from that pass, and any evidence not explicitly listed below, is **INVALID / SUPERSEDED** and must not be used for P2 acceptance.

The revalidation used the verified worktree at `C:\Users\10\Downloads\yakebda-p2-clean`, isolated Vite port `5197`, API port `3001`, and exact source identity checks before measurement.

Authoritative evidence:

- Round 2 computed evidence: `C:\Users\10\Downloads\yakebda-p2-reverify-evidence-583cab7\round-2-exact-viewport`
- Round 2 summary: `C:\Users\10\Downloads\yakebda-p2-reverify-evidence-583cab7\round-2-exact-viewport\validation-summary.json`
- Round 2 matrix: `C:\Users\10\Downloads\yakebda-p2-reverify-evidence-583cab7\round-2-exact-viewport\full-matrix-three-way-comparison.json`
- Round 3 visual evidence: `C:\Users\10\Downloads\yakebda-p2-reverify-evidence-583cab7\round-3-capture-only`
- Round 3 valid manifest: `C:\Users\10\Downloads\yakebda-p2-reverify-evidence-583cab7\round-3-capture-only\valid-evidence-manifest.json`
- Round 3 manual review: `C:\Users\10\Downloads\yakebda-p2-reverify-evidence-583cab7\round-3-capture-only\manual-visual-review.json`

## Computed and visual results

- The computed matrix completed for 128 states per variant across the baseline, clean recovery head, and candidate tree.
- No missing or extra elements were detected.
- No unexpected property or class differences remained outside the approved recovery clusters.
- Three Settings scroll-position artifacts had no computed-property change.
- The Round 3 base pack contains 24 accepted captures: six screens, two viewports, and Light/Dark.
- The Round 3 operational pack contains 32 accepted captures: eight operational states, two viewports, and Light/Dark.

Accepted operational states:

1. POS shift history with an expanded order.
2. Orders detail modal.
3. Menu product drawer.
4. Customer detail drawer.
5. User create drawer.
6. AppShell navigation drawer.
7. Settings active / `aria-current` state.
8. Print jobs form and table.

## User-approved waivers

These states are not PASS results. The user explicitly approved moving forward without recapturing them:

- **Settings hover - Light:** `NOT VERIFIED / USER-WAIVED`
- **Keyboard focus-visible - Light/Dark:** `NOT VERIFIED / USER-WAIVED`

The waived states must not be promoted to PASS in later reports. No CSS change was made to manufacture or bypass their evidence.

## CSS integrity and final source state

- Direct CSS source count: **2**.
  1. `apps/admin/src/theme.css`
  2. `apps/admin/src/global-colors.css` (last import and final color authority)
- Source `!important` count at the recovery commit: **238** (`theme.css`: 138; `global-colors.css`: 100).
- Recovery added no new `!important` declarations.
- Recovery introduced no new raw color values; existing legacy literals that moved with role-rule source ordering remain pre-existing debt.
- Recovery gates passed: Admin tests 11/11, Admin build, UI color contract, and `git diff --check`.

This record closes the visual recovery checkpoint only. It does not declare R8 complete; remaining 4C/4D/4E consolidation work is tracked separately.
