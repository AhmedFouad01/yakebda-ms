<div dir="rtl" align="right">

# YAKEBDA_MS — CHAT HANDOFF

**التاريخ:** 2026-07-18  
**الموضوع:** Canonical documentation refresh + Inventory/Reporting Draft stack

## ابدأ من هنا

- `main` ثابت عند `58d60152d4b0eba43a0a4c3a521b9a2a44f16f7a`.
- PRs #42/#43/#44/#46 مفتوحة Draft.
- #46 review-only ولا تُدمج.
- لا Deployment.

## ما تغير عن Handoff 2026-07-17 صباحًا

1. Inventory Admin لم تعد "غير موجودة بالكامل"؛ ظهرت كـDraft implementation على #42 و#43، لكنها لم تدخل `main`.
2. Reporting Foundation ظهرت كـPR #44 مستقلة ومصححة مع CI ناجح، لكنها ما زالت Draft وبوابتها البصرية/الاعتمادية مفتوحة.
3. ظهر PR #46 لتجميع المراجعة فقط.
4. Legacy adoption/old UI rescue scopes أُلغيت في Full Chat Sync لاحق؛ لا تُستأنف تلقائيًا.

## قواعد الاستمرار

- تحقق Live من exact head وCI قبل أي مراجعة أو merge.
- لا تصف Draft capability بأنها shipped.
- لا تعتبر backend foundation موديولًا تجاريًا مكتملًا.
- لا تكمل CRUD وهمي؛ اعرض فقط العمليات المدعومة فعليًا بالعقود.
- لا تستخدم PR #46 كأساس Merge.
- لا تعمل على legacy clone/original DB.
- Accounting Pilot فقط.

## Next Workstreams

### A — Inventory Admin

- قبول/تصحيح Sprint 1 read-only.
- قبول/تصحيح Sprint 2 master data.
- تحديد Sprint 3 operations: receipt، issue/adjustment، waste، transfer، count، recipes، reversals.
- إضافة audit/pagination/correction contracts قبل ادعاء الاكتمال.

### B — Reporting

- Browser QA للـexact head.
- تثبيت dependency production-safe.
- تقرير semantic acceptance: gross/net، source snapshot، timezone، refunds/unpaid.

### C — Accounting

- Operational Admin UI.
- Accountant approval للـADR-004 والمappings/rounding/recognition.
- Pilot reconciliation evidence.

### D — Documentation

هذه الحزمة هي الـcanonical المقترح. يلزم رفعها يدويًا إلى Real Memory/Project Sources، وتحديث مستندات repo القديمة في PR منفصل إذا طلب المستخدم.

</div>
