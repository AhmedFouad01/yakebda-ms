<div dir="rtl" align="right">

# YAKEBDA MS — Project Instructions v1.2 AR/RTL

## 1. هوية المشروع

- Project Key: `YAKEBDA_MS`
- الاسم التشغيلي: `YAKEBDA MS`
- المشروع مستقل عن AKYRO.
- Arabic-first وRTL-first.
- PostgreSQL هو System of Record.
- كود الأسعار والضرائب والخصومات في Backend.

---

## 2. ترتيب مصادر الحقيقة

1. `docs/YAKEBDA_MS_Project_Master_v1.2_AR_RTL.md`
2. `docs/YAKEBDA_MS_Execution_Roadmap_v2_AR_RTL.md`
3. `docs/YAKEBDA_MS_SRS_v2_AR_RTL.md`
4. `docs/YAKEBDA_MS_Diagrams_Roadmap_v2_AR_RTL.md`
5. `docs/engineering/CURRENT_IMPLEMENTATION.md`
6. `docs/YAKEBDA_MS_Milestone_Log.md`
7. ADRs داخل `docs/adr/`
8. `AGENTS.md`
9. `README.md`

الوثائق القديمة `Restaurant MS` مرجع تاريخي فقط.

---

## 3. الحالة الحالية

- YKMS-01 إلى YKMS-02G: مكتملة تاريخيًا.
- PR #14: Draft UI/legacy cleanup؛ لا تعتبر مكتملة قبل القبول والدمج.
- البرنامج التالي المقترح: YKMS-11.
- لا يبدأ تنفيذ YKMS-11 على فرع مبني فوق PR #14 إلا بعد حسم دمجها.

---

## 4. ترتيب التنفيذ الإجباري

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

يسمح بتصميم Finance مبكرًا، لكن لا يتم ادعاء ربحية كاملة قبل المخزون وCOGS.

---

## 5. قواعد Order Sources والتسعير

- `order_source` مستقل عن `order_type` و`payment_method`.
- Master product واحد لكل صنف.
- Channel menu للإتاحة والترتيب والمحتوى الخارجي.
- Pricelist للسعر فقط.
- Quote النهائي من Backend.
- تغيير المصدر يعيد تسعير السلة كاملة.
- الطلب يحفظ snapshots للمصدر والمنيو وقائمة السعر والقواعد.
- لا سعر صفري ولا fallback صامت.
- أي Override له أولوية معلنة واختبار.

---

## 6. قواعد المخزون

- وحدات القياس والتحويل جزء من التصميم الأول.
- الوصفة تربط المنتج النهائي بالمواد الخام.
- الخصم يكون بحركة مخزون موثقة.
- الهالك والجرد والتحويلات ليست تعديلات مباشرة على الرصيد.
- كل حركة لها سبب ومرجع ومستخدم وفرع.
- التقييم وCOGS لا يفعّلان قبل تثبيت سياسة التكلفة.

---

## 7. قواعد السائقين

- يجب تحديد هل التوصيل بسائق داخلي أم سائق المنصة.
- COD يعتبر عهدة حتى التسوية.
- كل Assignment له timestamps وحالات وأسباب فشل.
- التسوية تقارن المتوقع بالمستلم وتسجيل الفروق.
- لا تخلط `order_source` مع `delivery_provider`.

---

## 8. قواعد Finance

- Finance Control يملك التشغيل اليومي، وليس ERP كاملًا.
- كل حدث مالي له source reference وidempotency key.
- القيد المرحّل لا يعدّل.
- التصحيح بعكس.
- المدين = الدائن عند تفعيل دفتر القيود.
- الأبعاد التحليلية: branch/source/order_type/payment_method/cost_center.
- لا يتم إنشاء حساب إيراد منفصل لكل مصدر إذا كان التحليل بالأبعاد يكفي.
- المعالجة الضريبية النهائية تحتاج اعتماد محاسب قانوني.

---

## 9. ملفات إلزامية لكل مرحلة

قبل الكود:

- ADR.
- Scope.
- ERD.
- State/Sequence diagram.
- API contract.
- Migration plan.
- Permission map.
- Test plan.
- Rollback plan.

بعد الكود:

- Milestone Log.
- CURRENT_IMPLEMENTATION.
- README عند تغير التشغيل.
- QA script.
- Memory packet عند نقطة تفتيش.

---

## 10. بوابات الجودة

```bash
npm audit
npm run api:test
npm run admin:build
git diff --check
```

بالإضافة إلى:

- migrations up/down.
- tenant/branch isolation.
- API permission tests.
- pricing determinism.
- idempotency.
- RTL and mobile smoke test.
- reconciliation totals.

---

## 11. قواعد Git

- فرع مركز لكل Slice.
- PR تبقى Draft حتى اكتمال الاختبارات والـQA.
- لا Merge بدون موافقة صريحة.
- لا خلط UI cleanup مع schema/core pricing.
- لا ادعاء نجاح أو حفظ أو رفع بدون تأكيد.

</div>
