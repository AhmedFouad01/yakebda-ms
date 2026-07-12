<div dir="rtl" align="right">

# YAKEBDA MS — Execution Roadmap v2

**التاريخ:** 2026-07-12  
**الحالة:** Approved Planning Baseline  
**قاعدة التنفيذ:** لا تبدأ مرحلة جديدة قبل Gate المرحلة السابقة.

---

## Gate 0 — إغلاق UI Audit

### المطلوب

- إكمال المراجعة البصرية لـPR #14.
- CI ناجح.
- تحديث PR body.
- قبول المستخدم.
- Merge صريح.

### ممنوع

- بناء Schema جديد على فرع PR #14.
- خلط Core pricing مع CSS/UI cleanup.

---

## YKMS-11 — Order Sources & Pricing Context

### 11A — Domain & Contracts

- ADR-002.
- Source taxonomy.
- Price precedence.
- Snapshot contract.
- Permission map.
- API schemas.

### 11B — Schema

- `order_sources`
- `source_branch_configs`
- `price_lists`
- `price_list_rules`
- أعمدة snapshot على `orders` و`order_items`
- Seed لمصادر POS/phone/website/manual

### 11C — Quote Service

- توسيع `/orders/quote`.
- Deterministic rule resolver.
- Modifier prices.
- Reject invalid price.
- Idempotent request context.

### 11D — POS

- Source selector قبل الإضافة أو أول عنصر.
- Default source.
- Repricing confirmation عند التغيير.
- Ineligible item handling.
- Source badge في الطلب والإيصال.

### 11E — Reporting

- Sales/orders/AOV by source.
- Pricing delta by source.
- Audit source changes.

### Gate

- Migration up/down.
- Pricing matrix tests.
- Existing tests remain green.
- No frontend price authority.
- Manual POS QA.

---

## YKMS-12 — Channel Menus & External Mappings

### 12A — Channel Menu Model

- Menus/categories/items/modifier groups.
- Branch/source binding.
- Availability schedule.

### 12B — Publishing

- Draft/published state.
- Validation for missing prices/mappings.
- Version number and published snapshot.

### 12C — External Mapping

- Platform/store/product/variant/modifier IDs.
- Sync logs and exceptions.

### 12D — Admin UI

- Channel menu editor.
- Availability and ordering.
- Preview by source/branch.

### Gate

- Published menu reproducible.
- No duplicate master products.
- Mapping uniqueness tests.
- Preview and API contract tests.

---

## YKMS-13 — Inventory & Recipes

### 13A — Foundations

- Items, UOM, conversions.
- Locations and opening balances.
- Negative stock policy.

### 13B — Recipes

- Recipe/variant components.
- Versioning.
- Yield and rounding.

### 13C — Movements

- Receipts.
- Transfers.
- Waste.
- Adjustments.
- Counts.

### 13D — Sales Deduction

- Operational event trigger.
- Reversal rules.
- Idempotency.

### 13E — Purchasing & Reports

- Suppliers and POs.
- Stock, movements, waste, low-stock.

### Gate

- Movement ledger balances.
- No direct balance mutation.
- Recipe deduction tests.
- Cross-branch transfer tests.

---

## YKMS-14 — Delivery & Driver Operations

### 14A — Delivery Ownership

- Internal driver vs platform driver.
- Delivery provider and source separation.

### 14B — Dispatch

- Job queue.
- Assignment.
- State machine and timestamps.

### 14C — COD

- Driver custody.
- Expected/received.
- Difference reasons and approval.

### 14D — Reporting

- Delivery times.
- Failures.
- Driver performance.
- Settlement history.

### Gate

- Full state transition tests.
- COD settlement exactness.
- Branch/driver permissions.

---

## YKMS-15 — Finance Control

### 15A — Daily Finance

- Daily summary.
- Shift cash.
- Payment clearing.
- Exceptions.

### 15B — Expenses

- Categories.
- Approval workflow.
- Attachments.
- Payment status.

### 15C — Settlements

- Sources/platforms.
- Cards/wallets.
- Drivers.
- Commission/fees/tax breakdown.

### 15D — Closing

- Day close.
- Lock date.
- Reconciliation.
- Export.

### Gate

- Expected = operational sources.
- Actual = settlement/import.
- Differences explained.
- Idempotency and audit tests.

---

## YKMS-16 — Accounting Bridge, COGS & Profitability

### 16A — Financial Events

- Event outbox.
- Mapping rules.
- Retry/dead-letter.

### 16B — Ledger

- Accounts and journals.
- Balanced entries.
- Immutable posting and reversal.

### 16C — Inventory Accounting

- Valuation policy.
- COGS.
- Waste and adjustment accounting.

### 16D — Profitability

- Product/source/branch gross profit.
- Commission-adjusted margin.

### 16E — External Adapter

- Accounting export/API.
- Dry-run comparison.
- Backfill plan.

### Gate

- Debit = credit.
- Reprocessing creates no duplicates.
- P&L reconciles to operations.
- Accountant approval.

---

## YKMS-17 — Online / QR / Platform Connectors

- Website menu from published Channel Menu.
- Orders with required source context.
- Platform adapters.
- Webhooks and integration logs.
- Retry and deduplication.

---

## YKMS-18 — Egyptian e-Receipt & Compliance

- Separate compliance adapter.
- Device/branch registration mapping.
- Receipt payload versioning.
- Signing/integration configuration.
- Submission/retry/status logs.
- Legal and accountant validation.

---

## Branching Strategy

```text
feature/ykms-11-order-sources
feature/ykms-12-channel-menus
feature/ykms-13-inventory
feature/ykms-14-delivery-drivers
feature/ykms-15-finance-control
feature/ykms-16-accounting-bridge
```

كل فرع يتفرع من Main نظيف بعد دمج المرحلة السابقة.

---

## Definition of Done

- Scope closed.
- ADR accepted.
- ERD and sequences updated.
- Migrations reviewed.
- Tests and build pass.
- Security and branch scope tested.
- Manual RTL QA.
- Docs and Milestone Log updated.
- Memory checkpoint saved.
- Explicit merge approval.

</div>
