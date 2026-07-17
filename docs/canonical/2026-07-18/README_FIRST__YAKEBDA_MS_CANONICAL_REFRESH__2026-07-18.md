<div dir="rtl" align="right">

# YAKEBDA MS — Canonical Sources Refresh

**تاريخ الحزمة:** 2026-07-18  
**Project Key:** `YAKEBDA_MS`  
**الحالة:** حزمة توثيق Canonical جاهزة للمراجعة والرفع اليدوي  
**قاعدة الكود المتحقق منها:** `main @ 58d60152d4b0eba43a0a4c3a521b9a2a44f16f7a`

## 1. الهدف

الحزمة دي تستبدل الحزمة الـCanonical القديمة المؤرخة 2026-07-13، وتجمع الحقيقة التنفيذية والتخطيطية في نقطة واحدة بدون خلط بين:

- الموجود فعليًا على `main`.
- الموجود داخل Pull Requests مفتوحة وDraft.
- العمل المخطط أو غير المتحقق Live.
- القرارات المقبولة، والسياسات المؤقتة، والديون المعمارية.

## 2. أهم تصحيح

الحالة الحالية ليست "Inventory غير موجود بالكامل" وليست "Inventory مكتمل".

الحقيقة الدقيقة:

- Inventory وAccounting backend foundations موجودة على `main`.
- Inventory Admin UI موجودة جزئيًا داخل PRs Draft #42 و#43 فقط، وليست على `main`.
- Reporting Foundation الجديدة موجودة في PR #44 Draft، وليست على `main`.
- PR #46 هو Integration Review vehicle فقط وممنوع دمجه.
- Accounting ما زال `Pilot / Accountant Approval Required`.
- لا يوجد Deployment مثبت.

## 3. الملفات الرئيسية

| الملف | دوره |
|---|---|
| `CURRENT_STATUS...` | الحقيقة التنفيذية المتغيرة عند نقطة الحفظ |
| `PROJECT_SOURCE_MAP...` | ترتيب مصادر الحقيقة وحل التعارض |
| `Project_Master` | تعريف المشروع وحدوده وحالة الموديولات |
| `SRS` | المتطلبات الوظيفية وغير الوظيفية وبوابات القبول |
| `DFD` | تدفقات البيانات ونقاط الثقة والتكامل |
| `ERD` | مخطط الكيانات الفعلي والمستقبلي المصنف |
| `Milestones` | هيكل المراحل وحالاتها |
| `Milestone_Log` | سجل زمني للأعمال المدموجة والـDraft |
| `Execution_Roadmap` | ترتيب التنفيذ القادم والـgates |
| `ADR_INDEX` + `adr/` | سجل القرارات المعمارية |
| `SOURCE_EVIDENCE_MATRIX` | ربط كل ادعاء بمصدره وحالة ثقته |
| `CHANGELOG` | ما تغير مقارنة بالحزمة السابقة |
| `SRS_V2_TO_V3_REQUIREMENT_TRACEABILITY` | إثبات حفظ كل متطلبات SRS v2 |

## 4. ترتيب القراءة

1. `PROJECT_WORK_INSTRUCTIONS` الأحدث الموجود في Project Sources.
2. `CURRENT_STATUS__YAKEBDA_MS__2026-07-18__INVENTORY_REPORTING_DRAFT_STACK.md`.
3. `CHAT_HANDOFF__YAKEBDA_MS__2026-07-18__CANONICAL_REFRESH.md`.
4. `PROJECT_SOURCE_MAP__YAKEBDA_MS__v2.4__2026-07-18.md`.
5. Master → Roadmap → SRS → DFD → ERD → Milestones.
6. ADR Index ثم الـADR المرتبط بالنطاق.
7. التحقق Live من GitHub قبل أي قرار branch/PR/CI/merge.

## 5. تعليمات الاستبدال

عند رفع الحزمة إلى ChatGPT Project Sources أو Real Memory:

- عطّل النسخ القديمة من Master v1.4، Roadmap v2.2، SRS v2، Diagrams Roadmap v2.2، Source Map v2.2 وأي Runtime قبل 2026-07-18.
- احتفظ بها تاريخيًا في Drive ولا تحذفها من الأرشيف.
- لا ترفع ملفات rescue، terminal logs، database dumps، credentials أو patches كـCanonical Sources.
- لا تعتبر رفع ZIP وحده كافيًا؛ ارفع ملفات Markdown القابلة للقراءة.

## 6. حدود هذه الحزمة

هذه الحزمة تم إنشاؤها محليًا كملفات Markdown. لا تعني تلقائيًا أنها:

- رُفعت إلى Google Drive.
- أضيفت إلى ChatGPT Project Sources.
- دُفعت إلى GitHub.
- دُمجت أو نُشرت.

</div>
