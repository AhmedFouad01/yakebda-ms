<div dir="rtl" align="right">

# ADR-009 — Commercial Completeness Gate

**الحالة:** Accepted

## السياق

وجود migrations/routes/tests قد يعطي انطباعًا خاطئًا أن الموديول قابل للبيع والتشغيل.

## القرار

لا يوصف موديول بـComplete/Sellable إلا بوجود:

1. route/navigation.
2. permission-aware UI.
3. end-to-end operational workflows.
4. correction/reversal path للأحداث غير القابلة للتعديل.
5. shared/validated contracts.
6. API/Admin tests/build.
7. RTL/Light/Dark/responsive/accessibility QA.
8. docs/support/training.
9. supported upgrade baseline.
10. deployment/monitoring evidence للـproduction claim.

## تطبيق القرار

- Inventory backend ≠ Inventory complete.
- Accounting backend ≠ Accounting production-ready.
- Reporting Draft ≠ reporting shipped.
- Bridge queue ≠ physical printer deployment evidence.

## Consequences

- roadmap أطول ظاهريًا لكنه أدق تجاريًا.
- يمنع بيع capability غير قابلة للاستخدام.

</div>
