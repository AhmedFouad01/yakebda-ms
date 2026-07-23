<div dir="rtl" align="right">

# YAKEBDA MS — ADR Index v2.0

**التاريخ:** 2026-07-18  
**Namespace:** Repository-aligned canonical ADRs

## Canonical ADRs

| ADR | العنوان | الحالة | الملف |
|---|---|---|---|
| ADR-001 | Tenant Isolation and YAKEBDA Identity | Accepted | `adr/ADR-001-tenant-isolation-and-identity.md` |
| ADR-002 | Order Sources, Channel Menus, Pricelists | Accepted architecture / partial implementation | `adr/ADR-002-order-sources-channel-menus-pricelists.md` |
| ADR-003 | Sequence Inventory/Delivery before Full Accounting | Accepted | `adr/ADR-003-sequencing-inventory-drivers-finance.md` |
| ADR-004 | Inventory Sub-cent Residual Policy | Provisional / Accountant Approval Required | `adr/ADR-004-inventory-sub-cent-residual-policy.md` |
| ADR-005 | Kitchen Pause and Order Hold | Accepted / Merged; production deployment not claimed | `adr/ADR-005-kitchen-pause-order-hold.md` |
| ADR-006 | Supported Schema Baseline and Legacy Boundary | Proposed for acceptance | `adr/ADR-006-supported-schema-baseline-and-legacy-boundary.md` |
| ADR-007 | Staged Inventory Admin Delivery | Accepted for current Draft program | `adr/ADR-007-staged-inventory-admin-delivery.md` |
| ADR-008 | Reporting Registry and Request-scoped Run Metadata | Accepted for Draft #44 | `adr/ADR-008-reporting-registry-and-run-contract.md` |
| ADR-009 | Commercial Completeness Gate | Accepted | `adr/ADR-009-commercial-completeness-gate.md` |

## Historical Number Conflict

Real Memory القديم استخدم أرقامًا متعارضة، مثل:

- old ADR-004 = milestone naming.
- old ADR-005 = Menu Core next.

تُحفظ هذه كـ`LEGACY-ADR-004-MILESTONE-NAMING` و`LEGACY-ADR-005-MENU-NEXT` في الأرشيف فقط. repo namespace يتغلب عليها.

## Status Meanings

- Accepted: قرار قائم.
- Accepted architecture / partial implementation: التصميم مقبول والتنفيذ جزئي.
- Provisional: safety policy موجودة لكن الاعتماد التجاري/المحاسبي ناقص.
- Proposed: يحتاج موافقة صريحة قبل اعتباره ملزمًا.
- Superseded/Legacy: تاريخ فقط.

</div>
