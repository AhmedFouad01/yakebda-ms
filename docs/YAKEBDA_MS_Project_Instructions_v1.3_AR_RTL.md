<div dir="rtl" align="right">

# YAKEBDA MS — Project Instructions v1.3

## الحالة

- `main` يحتوي PR #14 عند merge commit `4df57964ef0dacddbbaca2b723849dd4afe055c0`.
- Draft PR #16 يوثق YKMS-11 إلى YKMS-18.
- لا يوجد تنفيذ Runtime أو Schema للموديولات الجديدة حتى الآن.

## ترتيب مصادر الحقيقة

1. `docs/YAKEBDA_MS_Project_Master_v1.3_AR_RTL.md`
2. `docs/YAKEBDA_MS_Execution_Roadmap_v2.1_AR_RTL.md`
3. `docs/YAKEBDA_MS_SRS_v2_AR_RTL.md`
4. `docs/YAKEBDA_MS_Diagrams_Roadmap_v2.1_AR_RTL.md`
5. `docs/engineering/CURRENT_IMPLEMENTATION.md`
6. ADRs داخل `docs/adr/`
7. `docs/YAKEBDA_MS_Planning_Decision_Log_v1.1.md`
8. `docs/YAKEBDA_MS_Milestone_Log.md`
9. `AGENTS.md`
10. `README.md`

نسخ v1.2/v2.0 الناتجة قبل تأكيد دمج PR #14 محفوظة تاريخيًا ولا تستخدم كبداية تنفيذ.

## الترتيب الإجباري

```text
YKMS-11 Sources & Pricing
→ YKMS-12 Channel Menus
→ YKMS-13 Inventory & Recipes
→ YKMS-14 Delivery & Drivers
→ YKMS-15 Finance Control
→ YKMS-16 Accounting Bridge / COGS
→ YKMS-17 Online Connectors
→ YKMS-18 e-Receipt
```

## قواعد Sources والتسعير

- Source مستقل عن order type وpayment method وdelivery provider.
- Master product واحد.
- Channel Menu للإتاحة والمحتوى؛ Pricelist للسعر.
- Quote النهائي من Backend.
- تغيير المصدر يعيد Quote كامل.
- لا fallback صامت ولا سعر صفر.
- حفظ snapshots على الطلب والخطوط.

## قواعد المخزون

- المواد ووحدات القياس والتحويلات تُبنى أولًا.
- الوصفة تربط المنتج/الـVariant بالمكونات.
- الرصيد نتيجة حركات، وليس حقلًا يعدل مباشرة.
- الاستلام والتحويل والهالك والجرد والعكس كلها حركات موثقة.
- COGS لا يفعل قبل اعتماد سياسة التقييم.

## قواعد التوصيل والسائقين

- Internal driver وPlatform driver حالتان منفصلتان.
- COD عهدة حتى التسوية.
- كل assignment/status له timestamp وAudit.
- expected/received/difference/approval جزء من التسوية.

## قواعد Finance

- Finance Control أولًا؛ ERP كامل ليس المرحلة الأولى.
- كل حدث مالي له source reference وidempotency key.
- القيود المرحّلة immutable والتصحيح بعكس.
- debit = credit عند تفعيل Ledger.
- الأبعاد: branch/source/order_type/payment_method/cost_center.
- المعالجة الضريبية النهائية تحتاج اعتمادًا مهنيًا.

## الملفات الإلزامية قبل الكود

- ADR.
- Scope وOut-of-scope.
- ERD.
- Sequence/State diagrams.
- API contract.
- Migration وBackfill plan.
- Permission map.
- Test وRollback plan.

## بوابات الجودة

```bash
npm audit
npm run api:migrate
npm run api:test
npm run admin:build
git diff --check
```

وتضاف اختبارات tenant/branch isolation، pricing determinism، idempotency، reconciliation، migration rollback، وRTL/manual QA حسب المرحلة.

## Git

- فرع مركز من `main` لكل مرحلة.
- PR تبقى Draft حتى اكتمال الاختبارات والـQA.
- لا Merge دون موافقة صريحة.
- لا خلط Core schema/pricing مع UI cleanup.
- لا ادعاء حفظ أو رفع أو نجاح دون تأكيد أداة أو CI.

</div>
