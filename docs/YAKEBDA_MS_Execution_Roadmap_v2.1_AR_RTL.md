<div dir="rtl" align="right">

# YAKEBDA MS — Execution Roadmap v2.1

**التاريخ:** 2026-07-12  
**الحالة:** Canonical Planning Baseline  
**Baseline:** PR #14 مدموجة في `main` عند `4df57964ef0dacddbbaca2b723849dd4afe055c0`

## YKMS-11 — Order Sources & Pricing Context

### 11A — Domain
- Source taxonomy.
- فصل source عن order type/payment/delivery provider.
- Price precedence وsnapshot contract.
- ADR/API/permission/test plan.

### 11B — Schema
- `order_sources`
- `source_branch_configs`
- `price_lists`
- `price_list_rules`
- snapshots على orders/order items
- seed: POS/phone/website/manual

### 11C — Backend Quote
- توسيع `/orders/quote`.
- deterministic resolver.
- variant/modifier pricing.
- reject invalid or missing price.
- idempotent context.

### 11D — POS
- Source selector.
- default source per branch/device.
- confirmation عند تغيير المصدر.
- requote وعرض الفروقات والأصناف غير المتاحة.

### 11E — Reports
- orders/sales/AOV/discounts/pricing delta by source.

### Gate
- migrations up/down.
- pricing matrix tests.
- no frontend pricing authority.
- tenant/branch scope.
- manual POS QA.

---

## YKMS-12 — Channel Menus & External Mappings

- Channel menu schema.
- source/branch binding.
- product/variant/modifier availability.
- draft/published versioning.
- publish validation.
- external store/product mappings.
- sync logs and exceptions.
- admin editor and preview.

### Gate
- no duplicate master products.
- published snapshot reproducible.
- mapping uniqueness and availability tests.

---

## YKMS-13 — Inventory & Recipes

### Foundations
- inventory items.
- UOM and conversions.
- locations and opening balances.
- negative stock policy.

### Recipes
- product/variant recipes.
- yield, rounding, version snapshots.

### Movements
- purchase receipts.
- transfers.
- waste.
- counts and adjustments.
- reversal rules.

### Sales Deduction
- idempotent operational event.
- recipe snapshot.
- stock movement ledger.

### Gate
- no direct balance mutation.
- movement ledger balances.
- recipe, reversal, and transfer tests.

---

## YKMS-14 — Delivery & Driver Operations

- delivery provider/ownership.
- dispatch queue and assignment.
- queued→assigned→picked_up→delivered/failed.
- timestamps and reasons.
- internal COD custody.
- expected/received/difference approval.
- zones, fees, availability, performance.

### Gate
- state transition tests.
- exact COD reconciliation.
- driver/dispatcher/branch permissions.

---

## YKMS-15 — Finance Control

- daily finance dashboard.
- shift cash and cash in/out.
- expenses and approvals.
- card/wallet/bank reconciliation.
- source/platform commission settlements.
- driver settlements.
- daily close, lock date, exceptions, export.

### Gate
- expected values reconcile to operational records.
- actual settlements are traceable.
- every difference has reason/approval.
- idempotency and audit tests.

---

## YKMS-16 — Accounting Bridge, COGS & Profitability

- financial event outbox.
- chart/journal mappings.
- balanced immutable entries.
- reversals and period locks.
- inventory valuation and COGS.
- product/source/branch profitability.
- external accounting adapter and dry-run/backfill.

### Gate
- debit = credit.
- retries create no duplicates.
- P&L reconciles with operations.
- accountant approval.

---

## YKMS-17 — Online / QR / Platform Connectors

- website/QR consume published Channel Menus.
- required source context on incoming orders.
- adapters, webhooks, retry, deduplication, logs.

---

## YKMS-18 — Egyptian e-Receipt & Compliance

- isolated compliance adapter.
- device/branch mapping.
- versioned receipt payload.
- submission/retry/status logs.
- legal and accountant validation.

---

## Branches

```text
feature/ykms-11-order-sources
feature/ykms-12-channel-menus
feature/ykms-13-inventory
feature/ykms-14-delivery-drivers
feature/ykms-15-finance-control
feature/ykms-16-accounting-bridge
```

كل مرحلة تبدأ من `main` بعد دمج المرحلة السابقة.

## Definition of Done

- Scope مغلق.
- ADR وERD وSequences محدثة.
- Migrations وbackfill وrollback مراجعة.
- Tests/build/security/RTL QA ناجحة.
- Docs وMilestone Log وMemory checkpoint محدثة.
- موافقة Merge صريحة.

</div>
