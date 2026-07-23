<div dir="rtl" align="right">

# CURRENT STATUS — YAKEBDA_MS

**التاريخ:** 2026-07-18  
**الحالة:** `main` مستقر عند consolidation base؛ Inventory Admin وReporting في Draft PR stack؛ لا Deployment

## 1. GitHub Live Anchor

```text
Repository: AhmedFouad01/yakebda-ms
Default branch: main
main: 58d60152d4b0eba43a0a4c3a521b9a2a44f16f7a
Commit: merge: consolidate commercial-completeness base
Deployment: none verified
```

## 2. Pull Requests المفتوحة

| PR | الفرع | Base | Head | الحالة | التصنيف |
|---|---|---|---|---|---|
| #42 | `feature/inventory-admin-readonly` | `main` | `8600a1a1...` | Open / Draft / Mergeable | Inventory Admin Sprint 1 — قراءة فقط |
| #43 | `feature/inventory-admin-master-data` | PR #42 | `e8d355741...` | Open / Draft / Mergeable | Sprint 2 — إنشاء Master Data فقط |
| #44 | `feature/reporting-foundation` | `main` | `c723e858...` | Open / Draft / Mergeable | Reporting Foundation مستقلة |
| #46 | `review/inventory-reporting-integration` | PR #43 | `8b504ef3...` | Open / Draft / Mergeable | Integration Review فقط — لا يُدمج |

PR #45 أُغلق بدون دمج وتم استبداله بـPR #46.

## 3. CI المثبت

| Scope | CI |
|---|---|
| PR #42 | Run #376 — Success |
| PR #43 | Run #377 — Success |
| PR #44 | Runs #404 و#405 — Success على الـhead الحالي |
| PR #46 | Run #406 — Success |

نجاح CI لا يساوي قبولًا بصريًا ولا Merge ولا Production readiness.

## 4. الموجود على `main`

### Platform/Foundation

- حسابات، فروع، مستخدمون، أدوار، صلاحيات، Audit.
- أجهزة، Hardware endpoints، Print jobs، API clients/tokens.
- Node 22 contract، structured/redacted logs، request IDs، health endpoints.
- Shared contracts محدودة ومقصودة، وcursor pagination لبعض collections.

### التشغيل

- Menu/Product/Variants/Modifiers/Branch availability.
- POS/Orders/Payments/Shifts/Receipts.
- KDS، Kitchen Pause/Resume، Order Hold/Resume.
- CRM/Customers، Settings، Users/RBAC.
- Order Sources + source-level product availability/price override slice.
- Semantic Light/Dark color authority وAppShell المعتمد.

### Inventory Backend

- Migrations 021–023.
- Locations، units، conversions، items، suppliers.
- Append-only stock movements، derived quantity/value، block-negative policy.
- Recipes/version snapshots، durable consumption events، retry/reversal.
- Receipts، waste، transfers، stock counts، moving weighted-average valuation.

### Accounting Backend — Pilot

- Migrations 024–026.
- Financial event outbox، idempotency، retry/dead states.
- Chart mappings، balanced immutable journals، reversals، period locks.
- Payment/refund/VAT/multi-tender integrity controls.
- Four-decimal inventory source value مقابل two-decimal journal + residual reconciliation.
- Dry-run reconciliation/backfill tooling.

## 5. غير الموجود على `main`

- `/inventory` route/navigation/Admin page: موجودة في PR #42 فقط.
- Inventory master-data create UI: موجودة في PR #43 فقط.
- Inventory stock operations UI: ليست في PR #42/#43؛ أي Sprint 3 مذكور في الذاكرة غير متحقق كـPR مفتوحة وقت الحفظ.
- Accounting operational Admin UI.
- Reporting Foundation الجديدة من PR #44.
- Full Channel Menu/Versioned Publish/External mappings workflow.
- Full delivery dispatch/COD custody/settlements.
- Finance Control operational UI.
- Production-approved accounting policy.
- Online/QR/platform adapters الكاملة وEgyptian e-Receipt production adapter.

## 6. Inventory Admin Draft Truth

### PR #42 — Read-only

- Route + navigation + `inventory.view` guard.
- Location selector، levels/valuation، movements.
- القيم تُعرض من الخادم؛ لا React balance/valuation authority.
- View-only behavior واختبارات RTL/Light/Dark/keyboard.

**Gaps:** no pagination، no movement date/type filters، no server `location_id` filter للـlevels.

### PR #43 — Master Data

- إنشاء وعرض units/items/suppliers، وإنشاء conversions.
- `inventory.manage` على API + UI.
- لا Edit/Disable/Archive/Delete لأن العقود غير موجودة.
- لا GET لعرض unit conversions.
- API constraint errors عربية 409/422.

**Gaps:** no audit writes على create routes، no pagination، no correction workflow بعد الإنشاء.

## 7. Reporting Draft Truth

PR #44 يضيف:

- Typed code-owned Report Registry.
- Catalog وتعريف filters/dimensions/measures/outputs/query versions/permissions.
- Daily summary، trend، by-branch، by-source، top-products، payment-methods.
- Historical source snapshot semantics، timezone policy، account/branch scope.
- Section-isolated failures وtable fallback.
- ECharts SVG adapter.

**Release blockers:** real-browser QA، واعتماد ECharts عبر npm/package-lock أو vendored asset بدل الاعتماد الإنتاجي على pinned CDN.

## 8. PR #46 Boundary

PR #46 تجميعة مراجعة محلية للـInventory + Reporting فقط:

- لا يُدمج.
- لا يُعلّم Ready.
- لا يُستخدم لدمج #42/#43/#44.
- الـmerge ref هو سطح الـQA، وليس دليلًا أن الفروع الأصلية مدموجة.

## 9. Legacy Database Boundary

تم إلغاء نطاق العمل التالي بقرار Memory لاحق:

- Old Inventory UI recovery.
- Rescue UI reuse.
- Legacy partial-019 schema adoption/repair.
- العمل على `ykms_main_qa_clone`.
- تعديل قاعدة `ykms` الأصلية.

**التفسير الهندسي الإلزامي:** الإلغاء لا يحوّل الـpartial legacy schema إلى قاعدة مدعومة. يجب في الإصدار التجاري إعلان واحد من اثنين بوضوح:

1. baseline مدعوم مع upgrade path مختبر؛ أو
2. اعتبار partial-019 schema غير مدعومة مع سياسة migration/export/onboarding منفصلة.

Fresh `001→027` success لا يثبت ترقية أي قاعدة legacy جزئية.

## 10. Readiness Matrix

| المجال | الحالة |
|---|---|
| Core POS/KDS/Menu/CRM | Merged / Operational baseline |
| P0–P3 hardening | Merged |
| Inventory backend | Merged |
| Inventory Admin read-only/master data | Draft PRs |
| Inventory operations Admin | Not verified / Not on main |
| Accounting backend | Merged / Pilot |
| Accounting Admin | Missing |
| Reporting Foundation | Draft PR |
| Legacy partial-019 support | Cancelled scope / Unsupported unless re-approved |
| Deployment | None |
| Paid Pilot Ready | Blocked by UI/policy/support gates |

## 11. Immediate Gate

1. Finish local/browser QA for #42/#43/#44 via their exact heads and #46 integration review.
2. Keep all PRs Draft until user acceptance.
3. Do not merge #46.
4. Decide merge order for #42/#43 and #44 separately.
5. Define Inventory Sprint 3 and Accounting Admin scopes only after current gates.
6. Keep ADR-004 provisional until accountant approval.

</div>
