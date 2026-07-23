<div dir="rtl" align="right">

# YAKEBDA MS — SRS v2 → v3 Requirement Traceability

**التاريخ:** 2026-07-18  
**الهدف:** إثبات أن متطلبات SRS v2 لم تُلغَ أو تُقصَر عند تحديث v3.

## القاعدة

- FR-170…219 محفوظة بنفس الأرقام داخل SRS v3.
- FR-220…239 (Delivery) محفوظة بنفس الأرقام.
- FR-240…259 (Finance Control) محفوظة بنفس الأرقام.
- FR-270…289 (Accounting) محفوظة بنفس الأرقام.
- المتطلبات الجديدة تستخدم نطاقات إضافية ولا تستبدل القديم.
- تغيير الحالة إلى Planned/Partial/Policy Required لا يعني الإلغاء؛ يعني تصنيف التنفيذ الحقيقي.

## Matrix

| Range | v2 Domain | v3 Location | Disposition |
|---|---|---|---|
| FR-170–179 | Order Sources | SRS §8 | Preserved |
| FR-180–189 | Pricelists & Quote | SRS §8 | Preserved |
| FR-190–199 | Channel Menus | SRS §8 | Preserved |
| FR-200–219 | Inventory & Recipes | SRS §9 | Preserved |
| FR-220–239 | Delivery & Drivers | SRS §11 | Preserved |
| FR-240–259 | Finance Control | SRS §12 | Preserved |
| FR-270–289 | Accounting/Profitability | SRS §13 | Preserved |
| NFR-001–012 | Non-functional | SRS §17 | Preserved and extended to NFR-015 |

## إضافات v3

- Inventory Admin route/view/manage/server-authority requirements.
- Reporting Registry/metadata/visual fallback/dependency safety.
- Migration baseline/support/exclusion requirements.
- Accounting operational Admin requirements.
- Commercial completeness release gates.

## Explicit Non-Cancellations

لا تُعتبر المتطلبات التالية ملغاة رغم عدم تنفيذها:

- Full Channel Menus/Pricelists.
- Delivery job/COD/settlement.
- Expenses/Finance Control.
- Accounting Admin/P&L/external adapter.
- Online/QR/platform connectors.
- Egyptian e-Receipt.

</div>
