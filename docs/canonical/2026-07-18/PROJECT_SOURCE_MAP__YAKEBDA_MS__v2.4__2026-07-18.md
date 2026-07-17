<div dir="rtl" align="right">

# PROJECT SOURCE MAP — YAKEBDA_MS v2.4

**التاريخ:** 2026-07-18  
**الحالة:** Active / Canonical proposal

## 1. ترتيب مصادر الحقيقة

1. Live GitHub للـbranch/commit/PR/CI/merge facts.
2. أحدث `CURRENT_STATUS` للحالة التنفيذية عند نقطة الحفظ.
3. أحدث `CHAT_HANDOFF` للاستمرار والحدود.
4. أحدث `PROJECT_WORK_INSTRUCTIONS` لسلوك التشغيل.
5. Accepted/Provisional ADRs حسب status.
6. Master/SRS/Roadmap/Milestones/DFD/ERD الأحدث.
7. أحدث Full Chat Sync وMemory Packets، مع مراعاة أن GitHub يتغلب عليها في mutable facts.
8. الملفات التاريخية للأرشيف فقط.

## 2. Active Runtime Files

- `CURRENT_STATUS__YAKEBDA_MS__2026-07-18__INVENTORY_REPORTING_DRAFT_STACK.md`
- `CHAT_HANDOFF__YAKEBDA_MS__2026-07-18__CANONICAL_REFRESH.md`
- `BOOT_PROMPT__YAKEBDA_MS__CURRENT__2026-07-18.md`
- `PROJECT_SOURCE_MAP__YAKEBDA_MS__v2.4__2026-07-18.md`

## 3. Active Canonical Files

- `YAKEBDA_MS_Project_Master_v1.5_AR_RTL.md`
- `YAKEBDA_MS_SRS_v3_AR_RTL.md`
- `YAKEBDA_MS_DFD_v1.0_AR_RTL.md`
- `YAKEBDA_MS_ERD_v1.0_AR_RTL.md`
- `YAKEBDA_MS_Milestones_v3.0_AR_RTL.md`
- `YAKEBDA_MS_Milestone_Log_v2.0_AR_RTL.md`
- `YAKEBDA_MS_Execution_Roadmap_v3.0_AR_RTL.md`
- `YAKEBDA_MS_ADR_INDEX_v2.0__2026-07-18.md`
- الملفات داخل `adr/`.

## 4. Evidence Files

- `SOURCE_EVIDENCE_MATRIX__2026-07-18.md`
- `CHANGELOG__CANONICAL_REFRESH__2026-07-18.md`
- `SRS_V2_TO_V3_REQUIREMENT_TRACEABILITY.md`
- `REPO_DOCUMENTATION_UPDATE_TARGETS__2026-07-18.md`

## 5. Superseded Active Sources

عطّل كـActive Sources مع الاحتفاظ التاريخي:

- Source Map v2.2/v2.3 السابقين.
- Master v1.4.
- SRS v2.
- Execution Roadmap v2.2.
- Diagrams Roadmap v1/v2.2.
- PR #19 runtime package.
- Current Status/Handoff المؤرخين قبل ظهور PRs #42–#46.
- README_FIRST الخاص بالـonboarding القديم.

## 6. Mutable State Rules

- لا تُزرع SHA أو PR stack داخل Stable Instructions كحقيقة طويلة العمر.
- كل SHA داخل هذه الحزمة هو save-point reference.
- قبل أي إجراء، أعد قراءة GitHub Live.
- `main` وDraft PRs وPlanning يجب فصلهم في كل تقرير.

## 7. ADR Namespace Resolution

يوجد تعارض تاريخي في أرقام ADRs بين Real Memory القديم وrepo الحالي.

القرار:

- `docs/adr/ADR-###` داخل repo هو namespace التقني canonical.
- ADRs التاريخية العامة تُحفظ كـ`LEGACY-ADR-*` في index، ولا تُحذف ولا تتغلب على repo ADRs.
- لا تتم إعادة تسمية commits/migrations/branches القديمة.

## 8. Naming Resolution

- `YKMS-02H` هو milestone التاريخي المنفذ لمصادر الطلب/source rules.
- `YKMS-11` يُعامل كـplanning alias لنفس المساحة، وليس تنفيذًا ثانيًا.
- البرنامج الجديد يستخدم Workstream IDs واضحة بدل إعادة ترقيم التاريخ قسرًا.

## 9. Legacy Schema Resolution

Full Chat Sync الأحدث ألغى العمل على partial-019 adoption والـclone.

- لا يُعاد فتحه تلقائيًا.
- لا يُقال إنه مدعوم.
- يجب على أي release document تحديد supported baseline أو exclusion policy.

## 10. Conflict Algorithm

عند التعارض:

1. GitHub Live يحدد ما هو merged/open/closed وexact heads.
2. أحدث user-approved Chat Sync يحدد scope cancellation/authorization.
3. ADR status يحدد القرار المعماري.
4. SRS يحدد المتطلب، وليس إثبات التنفيذ.
5. Milestone Log يصف التاريخ، وليس runtime state.
6. Historical docs لا تتغلب على أي بند أعلى.

</div>
