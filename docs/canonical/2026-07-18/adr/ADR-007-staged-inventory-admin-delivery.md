<div dir="rtl" align="right">

# ADR-007 — Staged Inventory Admin Delivery

**الحالة:** Accepted for current Draft program

## السياق

Inventory backend واسع، لكن تقديم كل العمليات في PR واحدة يرفع مخاطر permission/valuation/UX regression.

## القرار

### Sprint 1

Read-only route/navigation/levels/movements، `inventory.view`، no writes.

### Sprint 2

Master data create/list فقط وفق endpoints الحالية، `inventory.manage`، no fake CRUD.

### Sprint 3

Stock operations: receipt/issue/adjustment/waste/transfer/count.

### Sprint 4

Recipes/reversals/alerts/corrections/audit/pagination.

## Invariants

- server values authoritative.
- no opening balance hidden in item create.
- idempotency key per write.
- view-only has zero management affordances.
- UI capability matrix mirrors actual endpoints.
- historical/unsafe delete is not invented client-side.

## Consequences

- أسرع review وأقل blast radius.
- الموديول يظل غير مكتمل تجاريًا بين السبرنتات.
- docs must show Draft vs main.

</div>
