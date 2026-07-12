<div dir="rtl" align="right">

# YAKEBDA MS — ملف المشروع الرئيسي v1.3

**التاريخ:** 2026-07-12  
**الحالة:** Canonical / Active Development  
**Baseline الحالي:** `main` بعد دمج PR #14  
**Merge commit:** `4df57964ef0dacddbbaca2b723849dd4afe055c0`

## 1. الحالة المؤكدة

- PR #14 مدموجة ومغلقة.
- Final UI head: `14b1d12befeddf0700e083edd1374700366c0e53`.
- CI #159 نجحت، API 95/95، وAdmin production build نجح.
- برنامج التوثيق الجديد موجود في Draft PR #16؛ لم يبدأ تنفيذ Schema أو Runtime للمراحل الجديدة بعد.

## 2. تعريف المنصة

YAKEBDA MS منصة تشغيل مطاعم Arabic-first وRTL-first تربط POS، الطلبات، KDS، المنيو، CRM، المستخدمين والصلاحيات، الشيفتات، المدفوعات، التقارير، الأجهزة والطباعة، ثم تتوسع إلى مصادر الطلب، التسعير حسب القناة، المخزون، السائقين، الحسابات التشغيلية والربط المحاسبي.

## 3. القرار المعماري

### Order Source

مصدر الطلب كيان مستقل عن:

- نوع الطلب `takeaway / delivery / dine_in`.
- طريقة الدفع.
- مقدم التوصيل.

أمثلة المصادر: POS، تليفون، Website، QR، WhatsApp، Talabat، Careem، Manual External.

### Master Catalog

يوجد منتج رئيسي واحد ووصفة واحدة. لا يتم تكرار المنتج لكل مصدر.

### Channel Menu

تتحكم في:

- ما يظهر في القناة.
- ترتيب الأقسام والأصناف.
- الإتاحة حسب الفرع والوقت.
- الأحجام والإضافات المسموحة.
- الأسماء والوصف الخارجي.
- External IDs.

### Pricelist

تتحكم في السعر فقط:

- سعر ثابت.
- زيادة أو خصم مبلغ/نسبة.
- سعر Variant أو Modifier.
- نطاق فرع أو وقت.
- أولوية وتقريب.

### Backend Quote Authority

الـFrontend لا يحدد السعر النهائي. خدمة Quote على الخادم تحسب باستخدام:

```text
account + branch + source + channel menu + pricelist
+ order type + customer + time + items
```

وتحفظ الطلبات Snapshot للمصدر والمنيو وقائمة السعر والقواعد والأسعار المستخدمة.

## 4. نموذج الحسابات المعتمد

## Restaurant Finance Control + Accounting Bridge

### Finance Control داخل YAKEBDA MS

- الشيفتات والخزنة.
- المصروفات والاعتمادات.
- تسوية الكروت والمحافظ والبنك.
- عمولات ومستحقات مصادر الطلب.
- تسويات السائقين وCOD.
- الضرائب والخصومات والاستردادات.
- Daily close وExceptions وAudit.

### Accounting Bridge بعد المخزون

- Financial event outbox.
- Journals وBalanced entries.
- Reversals بدل تعديل القيود المرحّلة.
- COGS وتقييم المخزون.
- ربحية المنتج والمصدر والفرع.
- Export/API لبرنامج محاسبي خارجي.

لا يتم ادعاء مجمل ربح أو COGS موثوق قبل تثبيت الوصفات وسياسة تقييم المخزون.

## 5. ترتيب التنفيذ المعتمد

```text
YKMS-11 — Order Sources & Pricing Context
YKMS-12 — Channel Menus & External Mappings
YKMS-13 — Inventory & Recipes
YKMS-14 — Delivery & Driver Operations
YKMS-15 — Finance Control
YKMS-16 — Accounting Bridge, COGS & Profitability
YKMS-17 — Online / QR / Platform Connectors
YKMS-18 — Egyptian e-Receipt & Compliance
```

كل مرحلة تبدأ من `main` نظيف بعد دمج المرحلة السابقة.

## 6. قواعد غير قابلة للتفاوض

- لا سعر نهائي من Frontend.
- لا fallback إلى سعر صفر.
- تغيير المصدر يعيد Quote للسلة كلها.
- Channel Menu للإتاحة؛ Pricelist للسعر.
- كل طلب يحتفظ بـSnapshots تاريخية.
- كل حركة مخزون أو مالية لها مرجع وAudit وIdempotency.
- كل صلاحية حساسة تفرض في API.
- القيود المرحّلة لا تعدل؛ التصحيح بعكس.
- كل Module جديد يحتاج ADR وERD وSequence وMigration وTests وRollback.

## 7. خارج النطاق الأول

- Payroll.
- Fixed assets.
- Bank synchronization.
- Multi-currency.
- Route optimization.
- المعالجة الضريبية النهائية دون اعتماد محاسب قانوني.

## 8. Definition of Success

1. اختيار مصدر الطلب وتثبيته.
2. تسعير تلقائي من Backend حسب المصدر والفرع.
3. إتاحة مستقلة لكل قناة دون تكرار المنتجات.
4. Snapshot ثابت للطلبات القديمة.
5. خصم المخزون من نفس الوصفة مهما اختلف سعر المصدر.
6. تسوية عمولات المصادر وCOD والسائقين.
7. ربحية موثوقة بعد تفعيل COGS.
8. تتبع وتصدير ومراجعة كل حدث تشغيلي ومالي.

</div>
