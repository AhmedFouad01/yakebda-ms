<div dir="rtl" align="right">

# YAKEBDA MS — ملف المشروع الرئيسي v1.2

**التاريخ:** 2026-07-12  
**الحالة:** Active Development  
**الاتجاه:** Arabic-first / RTL-first  
**المرحلة الحالية:** مراجعة بصرية نهائية لـPR #14 بالتوازي مع تثبيت خطة YKMS-11 وما بعدها  
**المشروع:** مستقل تمامًا عن AKYRO

---

## 1. تعريف المشروع

YAKEBDA MS منصة تشغيل مطاعم، وليست مجرد شاشة كاشير أو Dashboard. المنصة تربط:

- POS والطلبات.
- المطبخ KDS.
- المنيو والأحجام والإضافات.
- الفروع والمستخدمين والصلاحيات.
- الشيفتات والمدفوعات والكاش.
- العملاء CRM.
- الأجهزة والطباعة.
- مصادر الطلب المختلفة.
- الأسعار والمنيو حسب المصدر.
- المخزون والوصفات.
- السائقين والتوصيل.
- الحسابات التشغيلية والتسويات.
- الربط المحاسبي والضريبي لاحقًا.

---

## 2. الحالة التنفيذية المؤكدة

### مكتمل على الخط الرئيسي

- Foundation وTenant/Branch isolation.
- Windows/hardware contracts والطباعة.
- Menu core وPOS orders.
- KDS ودورة حالة الطلب.
- Payments وShifts.
- Settings وCRM وRBAC.
- Reports وAudit.
- اختبارات API وبناء Admin ضمن بوابات الجودة.

### تحت المراجعة

- PR #14: dependency/UI/legacy cleanup.
- تظل Draft حتى القبول البصري الصريح.
- لا يتم بناء المراحل الجديدة فوقها قبل تحديد قاعدة الفرع النهائية.

---

## 3. القرار المعماري الجديد

### 3.1 مصدر الطلب Order Source

مصدر الطلب كيان مستقل يحدد القناة التي جاء منها الطلب، مثل:

- POS داخل الفرع.
- تليفون.
- Website.
- QR.
- WhatsApp.
- Talabat.
- Careem.
- Manual External.

مصدر الطلب ليس هو نوع الطلب؛ الطلب قد يكون `delivery` ومصدره Website أو Talabat أو تليفون.

### 3.2 Master Catalog

يوجد منتج رئيسي واحد ووصفة واحدة وهوية واحدة للصنف. لا يتم إنشاء نسخة من المنتج لكل مصدر.

### 3.3 Channel Menu

تحدد ما يظهر في كل مصدر:

- الأقسام والأصناف المتاحة.
- ترتيب العرض.
- الاسم والوصف الخارجي عند الحاجة.
- الأحجام والإضافات المسموحة.
- أوقات الإتاحة.
- الفروع.
- External IDs.

### 3.4 Pricelist

تحدد السعر فقط، بقواعد مثل:

- سعر ثابت.
- زيادة مبلغ أو نسبة.
- خصم.
- سعر خاص بالـVariant.
- فرع أو فترة زمنية.
- أولوية وقاعدة تقريب.

### 3.5 Backend Quote Authority

الـFrontend لا يقرر السعر النهائي. كل تسعير أو إعادة تسعير يمر عبر خدمة Quote على الخادم باستخدام سياق:

```text
account + branch + source + channel menu + pricelist
+ order type + customer + time + items
```

### 3.6 Price Snapshot

عند تثبيت الطلب يتم حفظ Snapshot للسياق والسعر والقواعد المستخدمة، حتى لا تتغير الطلبات القديمة عند تعديل المنيو أو الأسعار.

---

## 4. القرار الخاص بالحسابات

المعتمد هو:

## Restaurant Finance Control + Accounting Bridge

### داخل YAKEBDA MS

- الشيفتات والخزنة.
- المصروفات.
- تسويات طرق الدفع.
- مستحقات وعمولات مصادر الطلب.
- تسويات السائقين وCOD.
- الضرائب والخصومات والاستردادات.
- أحداث مالية قابلة للتتبع.
- تقارير تشغيلية وربحية.

### بعد استقرار المخزون

- COGS.
- تقييم المخزون.
- مجمل الربح.
- ربحية المنتج والمصدر والفرع.
- دفتر قيود متزن أو Bridge إلى برنامج محاسبي خارجي.

لا يتم بناء ERP محاسبي كامل قبل تثبيت مصادر الطلب والمخزون والوصفات.

---

## 5. ترتيب التنفيذ المعتمد

```text
Gate 0: إغلاق PR #14 بعد القبول البصري
YKMS-11: Order Sources & Pricing Context
YKMS-12: Channel Menus & External Mappings
YKMS-13: Inventory & Recipes
YKMS-14: Delivery & Driver Operations
YKMS-15: Finance Control
YKMS-16: Accounting Bridge, COGS & Profitability
YKMS-17: Online / QR / Platform Connectors
YKMS-18: Egyptian e-Receipt & Compliance
```

### لماذا هذا الترتيب؟

- الحسابات تعتمد على مصدر الطلب وسعره وعمولته.
- ربحية المنتج تعتمد على المخزون والوصفة.
- تسوية السائق تعتمد على معرفة طريقة التوصيل والتحصيل.
- تكامل المنصات يعتمد على Channel Menu وExternal Mapping.
- الإيصال الإلكتروني Adapter مستقل يأتي بعد استقرار نموذج الطلب والدفع.

---

## 6. الموديولات المستهدفة

### YKMS-11 — Order Sources & Pricing Context

- `order_sources`
- `source_branch_configs`
- `price_lists`
- `price_list_rules`
- Source selector في POS
- Server-side repricing
- Source snapshots
- تقارير حسب المصدر

### YKMS-12 — Channel Menus

- `channel_menus`
- `channel_menu_categories`
- `channel_menu_items`
- `channel_menu_modifier_groups`
- `external_product_mappings`
- Availability schedules
- Sync-ready contracts

### YKMS-13 — Inventory & Recipes

- Inventory items.
- Units and conversions.
- Recipes.
- Purchases and receipts.
- Stock movements and transfers.
- Waste and adjustments.
- Counts and low-stock alerts.
- Valuation foundation.

### YKMS-14 — Delivery & Drivers

- Dispatch.
- Internal/external driver ownership.
- Assignment and status.
- COD custody.
- Driver settlement.
- Zones, fees, failure reasons, and performance.

### YKMS-15 — Finance Control

- Daily finance dashboard.
- Expenses and approvals.
- Cash in/out.
- Payment clearing.
- Source settlements and commissions.
- Driver settlements.
- Period closing and reconciliation.

### YKMS-16 — Accounting Bridge

- Financial event outbox.
- Journals and journal entries.
- Balanced lines.
- Reversals instead of mutation.
- COGS and profitability.
- Export/API adapters.

---

## 7. قواعد غير قابلة للتفاوض

- كل الأسعار النهائية تحسب في Backend.
- لا يوجد fallback إلى سعر صفر.
- تغيير المصدر يعيد Quote كامل للسلة.
- المنتج الرئيسي والوصفة لا يتكرران لكل قناة.
- المنيو يحدد الإتاحة؛ قائمة السعر تحدد السعر.
- كل طلب يحفظ Source/Menu/Pricelist snapshots.
- كل حركة مخزون أو مالية لها مرجع وAudit.
- القيود المرحّلة لا تعدّل؛ التصحيح بعكس.
- الصلاحيات تُفرض في API.
- كل مرحلة جديدة تحتاج ADR + ERD + Sequence + Migration + Tests.

---

## 8. حدود النطاق الحالية

غير داخل أول تنفيذ:

- Payroll.
- Fixed assets and depreciation.
- Bank synchronization.
- Full vendor accounting before purchases stabilize.
- Native mobile app.
- Marketplace integrations.
- Final tax treatment without accountant/legal validation.

---

## 9. تعريف النجاح للبرنامج القادم

يعتبر البرنامج ناجحًا عندما:

1. يختار المستخدم مصدر الطلب قبل تثبيته.
2. يتغير السعر تلقائيًا من Backend حسب المصدر والفرع.
3. تظهر الأصناف المتاحة فقط للقناة.
4. تحفظ الطلبات Snapshot لا يتغير تاريخيًا.
5. المخزون يخصم نفس الوصفة مهما اختلف سعر المصدر.
6. يمكن تسوية عمولات المصادر والسائقين.
7. تظهر ربحية موثوقة بعد تفعيل COGS.
8. كل العمليات قابلة للتدقيق والتصدير.

</div>
