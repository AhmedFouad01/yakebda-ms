<div dir="rtl" align="right">

# ADR-006 — Supported Schema Baseline and Legacy Boundary

**الحالة:** Proposed for explicit acceptance

## السياق

Fresh 001→027 migrations نجحت، لكن وُجدت قاعدة partial legacy عند migration 019 تتصادم مع 021. لاحقًا ألغى المستخدم نطاق adoption/repair والـclone.

## المشكلة

إلغاء العمل لا يجيب: هل قاعدة العميل partial-019 مدعومة أم لا؟ ترك الإجابة غامضة يخلق خطر بيع/ترقية غير قابلة للتنفيذ.

## القرار المقترح

1. supported baseline يُذكر بالاسم والشكل، لا برقم migration فقط.
2. baseline الحالية الافتراضية: clean canonical schema managed by migrations 001→latest.
3. partial legacy 019 schema = `Unsupported` حتى re-approval لخطة adoption.
4. لا manual insertion إلى migration history.
5. لا drop/rename legacy tables بلا backup/inspection/approved mapping.
6. onboarding لقاعدة unsupported يحتاج أحد الخيارات:
   - clean tenant migration مع import مصدق؛
   - bespoke paid migration project؛
   - رفض upgrade مع export/archive policy.
7. original `ykms` لا تُلمس بدون توجيه صريح وbackup/restore evidence.

## Consequences

- يمنع claim كاذب عن upgrade compatibility.
- قد يقلل نطاق العملاء المدعومين مؤقتًا.
- يحول legacy support إلى قرار تجاري/هندسي صريح.

## Acceptance Needed

المستخدم يختار هل يعتمد exclusion أم يعيد فتح adoption كـworkstream منفصل.

</div>
