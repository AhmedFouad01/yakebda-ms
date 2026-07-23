<div dir="rtl" align="right">

# YAKEBDA MS — Execution Roadmap v3.0

**التاريخ:** 2026-07-18  
**الحالة:** Canonical execution plan

## Program Rule

لا يتم قياس التقدم بعدد routes أو commits، بل بإغلاق operational/commercial gates.

## Phase 0 — Current Draft Acceptance

### 0A — PR #42 Inventory Read-only

- exact-head review.
- owner/view-only/no-permission roles.
- levels/movements data correctness.
- location presentation limitation موثقة.
- 1920×1080، 1366×768، narrow، Light/Dark، keyboard، overflow.

### 0B — PR #43 Master Data

- stacked-base verification.
- create flows + server errors + preserved input.
- no fake CRUD.
- cross-account isolation.
- focus trap/restore.

### 0C — PR #44 Reporting

- exact-head browser QA.
- branch/all-branches timezone.
- source snapshots، refunds/unpaid، product identity.
- partial failure/stale-state.
- ECharts/table fallback.
- move dependency to controlled npm/vendor path before deployment.

### 0D — PR #46 Integration

- use merge ref for local combined shell only.
- record conflicts/regressions.
- never merge/Ready.

**Exit:** user accepts evidence and explicitly authorizes merge strategy.

## Phase 1 — Merge Strategy

Recommended dependency-safe order:

1. PR #42 into `main` after revalidation.
2. Rebase/retarget decision for #43 only by explicit approval; verify exact head after any change.
3. PR #43 merge after independent validation.
4. PR #44 remains independent and can be reviewed/merged separately.
5. Close #46 after review; no merge.

No automatic rebase/retarget is authorized by this roadmap.

## Phase 2 — Inventory Admin Operational Completion

### Sprint 3 — Stock Operations

- purchase receipts.
- generic issue/adjustment with policy labels.
- waste.
- transfers.
- counts.
- idempotency key per submission.
- authoritative refresh after success.
- reversal/correction entry points where API supports.

### Sprint 4 — Recipes and Governance

- recipe create/version/activate/retire.
- product/variant mapping.
- consumption event status/retry.
- explicit physical-return reversal.
- low-stock alerts.
- audit trail.
- pagination/date/type/location filters.
- master-data edit/disable/archive contracts.

**Exit:** Inventory Commercial Gate in SRS.

## Phase 3 — Reporting Production Readiness

- package ECharts.
- define export parity.
- performance indexes/budgets.
- report permissions catalog.
- failure/empty/loading/accessibility evidence.
- production logging/monitoring.

## Phase 4 — Accounting Admin Pilot

### 4A Read-only Operations

- financial events queue/status/errors.
- retry/dead controls with `accounting.manage`.
- journals/lines/source lineage.
- reconciliation residuals.
- trial balance.

### 4B Governance

- chart/mapping management.
- periods/open/lock.
- reversal workflow.
- exceptions queue.
- accountant review pack.

### 4C Policy Approval

- revenue recognition.
- VAT treatment.
- source fees/commissions.
- generic issue mapping.
- rounding residual settlement.
- period/date/timezone.

**Exit:** Paid Pilot only; statutory/production label يحتاج evidence منفصل.

## Phase 5 — Delivery + Finance Control

- delivery jobs/dispatch.
- driver availability/state.
- COD custody/settlement.
- expenses/approvals.
- payment/source/driver reconciliation.
- daily close/exceptions.

## Phase 6 — Full Channel Menus/Pricelists

- full rule schema.
- channel versions/publish validation.
- external mappings.
- source settlement rules.
- sync log/retry.

## Phase 7 — Online/QR/Platforms

- adapters.
- webhook dedup/idempotency.
- published menu consumption.
- canonical quote/order.
- operational observability.

## Phase 8 — Egyptian e-Receipt

- isolated compliance adapter.
- versioned payloads.
- submission/retry/status.
- certificate/credential security.
- legal/accountant acceptance.

## Cross-Cutting Gates

### Data Support Gate

- declare supported schema baseline.
- partial legacy 019 remains unsupported/cancelled until re-approved.
- backup/restore and upgrade test for any supported baseline.

### UI Gate

- RTL, Light/Dark, keyboard, responsive, overflow, console/network.

### Security Gate

- permissions in API.
- account/branch scope.
- audit.
- no PII/secrets in logs.

### Financial Gate

- deterministic decimals.
- idempotency.
- immutable evidence/reversal.
- reconciliation.
- policy approval.

## Prioritization Truth

الـunspoken risk: إضافة features جديدة قبل إكمال Inventory operations/Accounting governance هتزود surface area أسرع من قدرة المشروع على دعم البيانات والتسويات. لذلك الأولوية الحالية هي إغلاق الـDraft stack ثم operational completeness، لا فتح online/e-receipt مبكرًا.

</div>
