<div dir="rtl" align="right">

# YAKEBDA MS — Source Evidence Matrix

**التاريخ:** 2026-07-18

| الادعاء | المصدر | الثقة/التصنيف |
|---|---|---|
| `main=58d60152d4b0eba43a0a4c3a521b9a2a44f16f7a` | GitHub live commit search | High / Mutable |
| PRs #42/#43/#44/#46 Draft | GitHub live PR search | High / Mutable |
| CI #376/#377/#404/#405/#406 success | GitHub workflow runs | High / Mutable |
| Inventory backend migrations 021–023 | GitHub main migration files | High / Merged |
| Accounting backend 024–026 | GitHub main migration files | High / Merged/Pilot |
| Kitchen pause/hold migration 027 | GitHub main | High / Merged |
| Inventory UI absent on main but Draft in #42/#43 | GitHub PR base/head + prior status | High |
| Reporting Foundation Draft | PR #44 | High |
| #46 never merge | PR #46 body | High / Explicit rule |
| Legacy adoption/old UI rescue cancelled | Full Chat Sync 2026-07-17 | High user-memory scope |
| Accounting approval pending | ADR-004 + PR39/41 boundaries | High |
| No deployment | Current status/PR boundaries; no deployment evidence found | High at save point |
| Sprint 3 branch mentioned | Full Chat Sync only، not verified as open PR | Medium / Unverified |

## Source Quality Rules

- PR body is evidence of intended scope and reported tests، but exact code review may still be needed.
- CI proves automated gates only، not manual visual acceptance.
- Memory can cancel scope، but cannot prove code merge/state.
- SRS and Roadmap are normative، not implementation evidence.

## Stale Sources Identified

- Master v1.4: pre-merge PR stack.
- SRS v2: lacks current UI/reporting/upgrade truth.
- Roadmap v2.2: pre-consolidation sequence.
- Diagrams v2.2: PR19-era diagrams.
- repo `PROJECT_STATUS.md`/`ROADMAP.md`/`CURRENT_IMPLEMENTATION.md`: still contain pre-Inventory/Accounting statements and require a documentation PR.

</div>
