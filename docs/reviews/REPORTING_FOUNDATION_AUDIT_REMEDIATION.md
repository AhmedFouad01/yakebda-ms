# Reporting Foundation — Audit Remediation Report

**PR:** #44 — Reporting Foundation  
**Branch:** `feature/reporting-foundation`  
**Base:** `main` at `58d60152d4b0eba43a0a4c3a521b9a2a44f16f7a`  
**Status:** Draft; local real-browser review pending; no merge authorized.

## Audit disposition

The initial audit returned **REQUEST CHANGES**. The nine authorized corrective items have been implemented in code/contracts/tests/documentation. CI must pass on the exact commit containing this report. Real-browser visual acceptance remains a separate local user gate and is not claimed here.

## Corrective items

| # | Audit correction | Remediation |
|---|---|---|
| 1 | Expand `ReportDefinition`/Registry | Typed filters, dimensions, measures, outputs, template keys, query versions and per-report permissions added. Planned Inventory definitions require `inventory.view` in addition to `reports.view`. |
| 2 | Correct Report Run semantics | Current envelope renamed to `ReportResponseMeta`; it carries request identity, query version, generating user, effective account/branch scope and timezone policy. It does not claim durable persistence or snapshot identity. |
| 3 | Align catalog and API | Sales trend, sales by branch and sales by source are distinct definitions and distinct endpoints with their own report IDs and metadata. |
| 4 | Historical source and product semantics | Source display prefers the order-time snapshot and groups by source ID. Top products group by product ID and expose explicit `gross_item_sales`, not ambiguous net sales. |
| 5 | All-branches timezone policy | Selected/branch-bound reports use branch timezone. All-branches runs use the explicit account-default reporting timezone and return `timezone_policy=account_default`. |
| 6 | Stale UI and retry behavior | Previous result bundle is cleared before a new run. Bootstrap/catalog/branches errors and report-run errors have independent retry paths. |
| 7 | Missing tests | Added API/Admin coverage for definitions, response metadata, distinct endpoints, branch denial, effective scope/timezone, outside-account branches, source rename snapshots, duplicate product names, refunds/unpaid, stale result clearing, bootstrap retry and ECharts fallback/lifecycle. |
| 8 | Duplicate legacy routes | Removed obsolete `reportRoutes` from `restaurant.ts`; the dedicated `reports.ts` module is the single report-route implementation. |
| 9 | Visualization and visual gate | Added an isolated Apache ECharts 6.1.0 SVG adapter with semantic theme tokens, axes, labels, tooltips, ARIA and visible table fallback. Added an exact-head local visual QA matrix. Local browser acceptance remains pending. |

## Corrective commit ledger

| Commit | Message | Main purpose |
|---|---|---|
| `3a6c8fe092a88c43ed92eda5a6ffb1fd377cd5d6` | `fix(reports): expand registry and response metadata contracts` | Registry and response contract foundation. |
| `bc586790c71d3f68970323d1e3551080f1fda4a4` | `fix(reports): define typed catalog permissions dimensions and measures` | Typed code-owned report definitions and permission declarations. |
| `f7c92e8ab16073e772ad6ed458f74f9f99d79d7e` | `fix(reports): split runs and enforce scoped report semantics` | Distinct endpoints, scope, timezone, snapshot and numeric semantics. |
| `ac18b1cdb91ff0d9699ae03d5bdc2c247de44699` | `fix(reports): call distinct report endpoints` | Admin API client alignment. |
| `04891a3af54cfb1326b08465c7328f316e32dc3d` | `fix(reports): prevent stale results and retry bootstrap separately` | UI state correctness and retry separation. |
| `76a75fdbff928be3816c1821a97e125d6398b0f4` | `fix(reports): format generated timestamps in effective timezone` | Timezone-correct response timestamp display. |
| `0f15c5d32cd50adf23e944e5019c1e071ef8a6ee` | `fix(reports): clarify reporting labels and run metadata` | Explicit UI semantics for gross/net, timezone and request metadata. |
| `c5d10302e251ddaf616b7a61a43a1f319fae78af` | `test(reports): cover scoped runs snapshots refunds and stable product identity` | Expanded API correctness/isolation tests. |
| `32350b55ff26b4394d16b89e504350c778ab275f` | `test(reports): cover split endpoints bootstrap retry and stale-state clearing` | Expanded Admin behavior tests. |
| `fc82b98d75ed61b53f64142efcb17972d365d663` | `refactor(reports): remove obsolete restaurant report routes` | Single route authority. |
| `f403a8dc0dcefb6598af18136088346332bb0848` | `feat(reports): add isolated Apache ECharts SVG adapter` | Pinned visualization adapter boundary. |
| `806bd643a657d7388de47c295e2ad29b3d955148` | `feat(reports): render report charts through ECharts SVG` | ECharts-based chart rendering. |
| `dd7fd0ffb6739e80a11b54bf38cf01ab17bf54a8` | `feat(reports): add visualization fallback copy` | Explicit fallback state. |
| `5a91f7607e8caff2281bd6cd94e0c497392ae99f` | `feat(reports): style ECharts host and accessible fallback states` | Responsive semantic CSS and focus behavior. |
| `3dd4043bbe4a1367838700de756c7f0ce7b5afaa` | `docs(reports): define exact local visual QA acceptance gate` | Local review matrix. |
| `ef3e05eefbf02490f95a00050345fb5f6590da30` | `docs(reports): align scope with corrected report contracts and ECharts gate` | Scope truth and deployment dependency. |
| `e6f6aaa11c6c38ffa0e366525f0b8ada5192c666` | `docs(reports): document distinct scoped reporting endpoints` | Updated API matrix. |
| `a7db0694d59ee9dfeb96af2ad5d7a22078a7fb37` | `docs(reports): record corrected reporting architecture decisions` | Durable architecture decisions. |
| `d0322e2a081743db98aabcb79786f278e072d98a` | `docs(reports): separate CI evidence from local visual acceptance` | CI vs browser acceptance boundary. |
| `bb6a540b0ef92f6670c2bc9895cc831bc8b9d9f6` | `fix(reports): make ECharts resize and teardown lifecycle safe` | Observer/listener cleanup and safe chart lifecycle. |
| `989b9e6cfbe24da8d0501f546062384eb8fef345` | `test(reports): verify ECharts SVG adapter and table fallback lifecycle` | Adapter initialization, fallback and disposal tests. |

## Validation boundary

The normal repository CI must pass on the exact final head after this report commit:

- contracts build/tests;
- API TypeScript;
- migration idempotency;
- full API tests;
- global color contract;
- Admin tests;
- Admin production build.

The local browser matrix in `REPORTING_FOUNDATION_MANUAL_QA.md` remains required before Ready-for-Review or merge.

## Known production gate

The ECharts adapter pins version 6.1.0 through a fixed ESM URL. Before deployment, vendor the asset or add it through the normal npm/package-lock workflow, then rerun CI and browser QA. This Draft PR is not deployment evidence.

## Safety confirmation

- No merge.
- No Ready-for-Review transition.
- No deployment.
- No rebase or force push.
- No Legacy Inventory work.
- No production or protected database changes.
