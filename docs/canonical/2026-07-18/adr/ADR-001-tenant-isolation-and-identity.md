<div dir="rtl" align="right">

# ADR-001 — Tenant Isolation and YAKEBDA Identity

**الحالة:** Accepted  
**الأصل:** repo ADR-001، محدث توثيقيًا 2026-07-18

## السياق

المنصة multi-tenant، ومسارات الجسر/الأجهزة/العمليات لا يجوز أن تكشف أو تعدل بيانات حساب آخر. بالتوازي، المشروع خرج من تسمية Restaurant MS إلى YAKEBDA MS.

## القرار

1. account scope يُشتق من authenticated user/token، ولا يُقبل من العميل كauthority.
2. أي lookup حساس يستخدم `id + account_id` أو join مكافئ.
3. branch-scoped actions تتحقق من branch ownership/access.
4. cross-account entity access يعاد 404 حيث يناسب عدم disclosure.
5. العلاقات الحرجة تدعم composite constraints عند الحاجة.
6. التسمية canonical: YAKEBDA MS / `yakebda-ms` / `@ykms/*` / `YKMS-*`.

## النتائج

- عزل أقوى على API والجسر والمخزون والحسابات.
- كلفة joins/constraints مقبولة.
- الملفات التاريخية لا تُعاد كتابتها، لكنها لا تقود runtime.

## Required Tests

- cross-account read/write.
- cross-branch access.
- foreign relationship IDs.
- token scope.
- no entity disclosure.

</div>
