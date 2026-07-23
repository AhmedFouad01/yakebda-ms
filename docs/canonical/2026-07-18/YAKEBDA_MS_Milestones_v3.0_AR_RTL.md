<div dir="rtl" align="right">

# YAKEBDA MS — Milestones v3.0

**التاريخ:** 2026-07-18  
**الهدف:** توحيد التاريخ القديم مع workstreams الحالية بدون إعادة تسمية destructive.

## 1. Status Vocabulary

| الحالة | المعنى |
|---|---|
| Completed/Merged | موجود على main |
| Draft | PR مفتوحة، غير shipped |
| Planned | scope معرّف ولم يبدأ |
| Pilot | implementation موجود لكن policy/operations تمنع production claim |
| Cancelled | scope أوقفه المستخدم؛ لا يُستأنف تلقائيًا |

## 2. Historical Milestones

| ID | الاسم | الحالة |
|---|---|---|
| YKMS-01 | Foundation/Auth/RBAC/API | Completed |
| YKMS-01H | Windows/Hardware foundation | Completed foundation |
| YKMS-01-CLEANUP | Rebrand + tenant security | Completed |
| YKMS-02 | Restaurant MVP | Completed |
| YKMS-02B | Operational POS/Shifts | Completed |
| YKMS-02C–02G | Settings/UI/Menu/CRM refinements | Completed |
| YKMS-02H | Order sources/source product rules | Completed first slice |
| P0 | Security/financial integrity | Completed/Merged |
| P1 | Reliability/refunds/print/shift controls | Completed/Merged |
| P2 | Frontend safety/maintainability/visual baseline | Completed/Merged |
| P3 | Observability/pagination/Node22/contracts/docs | Completed/Merged |
| IA-BE | Inventory/Accounting backend foundation | Completed/Merged / Accounting Pilot |
| UI-W2/W4 | AppShell/KDS/Customers/kitchen controls | Completed/Merged |

## 3. Current Milestones

| ID | Scope | PR | الحالة | Gate |
|---|---|---|---|---|
| INV-UI-S1 | Inventory read-only | #42 | Draft | local acceptance + merge approval |
| INV-UI-S2 | Inventory master data | #43 | Draft stacked | acceptance + dependency order |
| RPT-FND | Reporting Foundation | #44 | Draft independent | browser QA + dependency packaging |
| INT-REV-01 | Combined review | #46 | Draft review-only | NEVER MERGE |

## 4. Planned Milestones

| ID | Scope | Dependencies |
|---|---|---|
| INV-UI-S3 | receipts/issues/adjustments/waste/transfers/counts | S1/S2 accepted + API contract audit |
| INV-UI-S4 | recipes/reversals/alerts/reports/corrections | S3 + audit/pagination design |
| ACC-UI-P1 | event queue/retry/exceptions/read-only journals | accounting backend + permissions |
| ACC-UI-P2 | mappings/periods/reversals/reconciliation | accountant policy |
| RPT-PROD | reporting production hardening/export parity | RPT-FND + dependency gate |
| DEL-FULL | delivery jobs/dispatch/COD | driver/source models |
| FIN-CTRL | expenses/reconciliation/settlements/daily close | delivery + sources + shifts |
| CH-MENU | full channel menu/pricelist publishing | source slice + catalog |
| CONN | online/QR/platform adapters | channel menus + idempotency |
| EREC | Egyptian e-Receipt | finance/tax/legal approval |

## 5. Cancelled/Unsupported Work

| Scope | الحالة |
|---|---|
| Old Inventory UI recovery | Cancelled |
| Rescue UI reuse | Cancelled |
| Partial legacy 019 adoption/repair | Cancelled / unsupported unless re-approved |
| Work on `ykms_main_qa_clone` | Cancelled |
| Modification of original `ykms` | Prohibited |
| Graphify full semantic scan experiment | Stopped; archive only |

## 6. Naming Debt

- `YKMS-11` = planning alias لمساحة `YKMS-02H`، وليس milestone تنفيذية منفصلة.
- Inventory/Accounting historical branches used mixed labels; workstream IDs الجديدة تمنع مزيدًا من التضارب دون إعادة كتابة التاريخ.

## 7. Milestone Exit Criteria

أي milestone جديدة لا تُغلق إلا بعد:

- scope/ADR/DFD/ERD/contracts.
- migrations/backfill/rollback أو تصريح no-schema-change.
- permission map.
- automated gates.
- manual RTL/Light/Dark/responsive/accessibility QA.
- documentation truth.
- explicit merge approval.

</div>
