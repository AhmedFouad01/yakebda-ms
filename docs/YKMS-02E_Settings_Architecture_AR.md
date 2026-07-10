# YKMS-02E — Settings Architecture + Operational Configuration

**Project:** YAKEBDA_MS  
**Milestone:** YKMS-02E  
**Source:** Chat-approved memory packet after Lightspeed-style POS settings research and YAKEBDA fast-food requirements.  
**Status:** Architecture/design source of truth. Implementation not started in this branch yet.

---

## 1. القرار المعماري

YAKEBDA MS لازم يتحول من POS فيه إعدادات متفرقة إلى نظام تشغيل مطعم configurable:

```text
Back Office = الإعدادات / الصلاحيات / المنيو / التقارير
POS = تشغيل سريع للكاشير
Kitchen/KDS = تشغيل المطبخ
Reports = الحقيقة المالية والتشغيلية
```

القيم hardcoded في POS لازم تتحول تدريجيًا لإعدادات تقرأ منها الشاشات.

---

## 2. Settings Navigation النهائي

```text
Settings
├── بيانات المطعم
├── الفروع
├── الضرائب والرسوم
├── الطلبات
├── المنيو
│   ├── الأقسام
│   ├── الأصناف
│   ├── الأحجام / Variants
│   └── الإضافات / Modifier Groups
├── العروض والخصومات
├── المطبخ
│   ├── KDS
│   ├── محطات التحضير
│   └── أوقات التحضير
├── الطباعة والأجهزة
├── الشيفت والكاش
├── العملاء والتوصيل
├── المستخدمون والصلاحيات
└── التقارير
```

---

## 3. إعدادات المطعم العامة

Fields:

- اسم المطعم عربي / إنجليزي.
- اسم POS الظاهر.
- العنوان.
- أرقام التواصل.
- الرقم الضريبي.
- اللوجو.
- ألوان البراند: أسود / أصفر.
- اللغة الافتراضية: عربي.
- RTL-first.
- العملة: EGP.
- المنطقة الزمنية.
- صيغة التاريخ والوقت.

Uses:

- Header POS.
- الفاتورة.
- التقارير.
- قوالب الطباعة.

---

## 4. إعدادات الفروع

كل فرع يحتوي:

- اسم الفرع.
- العنوان.
- رقم التليفون.
- active / inactive.
- العملة.
- ضريبة الفرع.
- إعدادات الطباعة.
- منيو الفرع.
- أسعار الفرع.
- takeaway enabled.
- delivery enabled.
- dine-in enabled/disabled.

قرار YAKEBDA الحالي:

```text
Dine-in / tables موجود معماريًا لكن hidden ومقفول مؤقتًا.
```

---

## 5. الضرائب والرسوم

Required:

- VAT enabled.
- VAT percentage.
- هل السعر شامل الضريبة أم الضريبة تضاف فوق السعر؟
- service fee enabled.
- نسبة / قيمة رسوم الخدمة.
- default delivery fee.
- minimum delivery order.
- rounding rules: none / nearest 0.50 / nearest 1 EGP.
- عرض الضريبة في الفاتورة: مفصل / مدمج.

لازم تؤثر على:

- POS totals.
- receipts.
- shift reconciliation.
- reports.
- payments.

---

## 6. الطلبات والمبيعات

### Order Types

- Takeaway.
- Delivery.
- Dine-in hidden now.
- Online orders placeholder.

لكل نوع طلب:

- active/inactive.
- يظهر في POS؟
- يحتاج عميل؟
- يحتاج عنوان؟
- يحتاج سائق؟
- يرسل للمطبخ؟
- يطبع تذكرة مطبخ؟
- يطبع فاتورة؟
- طرق الدفع المسموحة.

### Order Numbering

- daily starting number.
- daily reset.
- reset time.
- numbering per branch.
- optional prefixes: T/D/O.
- call number / queue number.

### Rules

- هل الكاشير يلغي الطلب؟
- حذف صنف قبل الإرسال للمطبخ.
- حذف صنف بعد الإرسال يحتاج مدير.
- خصم فوق الحد يحتاج مدير.
- refund يحتاج مدير.
- فتح درج الكاش يحتاج صلاحية.
- unpaid orders allowed؟
- تعديل بعد kitchen dispatch؟
- require open shift for cash.

---

## 7. المنيو

### Category Order

```text
الكل
ساندوتشات
أطباق
وجبات
الحواوشي
البطاطس
فواتح الشهية
إضافات
مشروبات
```

### Product Fields

- name.
- category.
- base price.
- SKU.
- image.
- description.
- ingredients.
- prep time.
- available/unavailable.
- unavailability reason.
- show in POS.
- show in reports.
- discountable.
- send to kitchen.
- prep station.
- sort order.
- branch price override.
- branch availability override.

### Image Standard

```text
Square 1:1
800×800px
JPG/WebP
< 400KB
object-fit: cover
```

Current implementation supports image URL + preview. Real file upload is deferred until upload endpoint/storage exists.

---

## 8. Variants / Sizes

Sandwiches:

- لقمة فينو.
- هامر فينو.
- لقمة سياحي.
- هامر سياحي.

Hawawshi:

- كبسولة.
- رغيف.

Variant fields:

- name.
- price_delta.
- default.
- active.
- product applicability.
- optional extra prep time.

---

## 9. Modifiers

Rule:

```text
ممنوع اختراع modifiers خارج منيو يا كبدة.
```

Current allowed sandwich modifiers:

- طحينة.
- باربيكيو.
- شيدر.
- بطاطس.

Modifier Group fields:

- name.
- min_select.
- max_select.
- required.
- allow duplicate.
- price.
- linked products.
- print to kitchen.
- show on receipt.

Example:

```text
إضافات داخل الساندوتش
min_select = 0
max_select = 4
required = false
```

---

## 10. العروض والخصومات

Discounts:

- fixed amount.
- percentage.
- product-level.
- order-level.
- cashier threshold.
- required reason.
- manager PIN approval.
- report reason.

Promotions later:

- bundle / combo.
- buy X get Y.
- happy hour.
- time-based.
- branch-based.
- order-type-based.
- category/product based.
- date range.
- days of week.
- stackable flag.

Decision:

```text
YKMS-02D = manual discount only.
YKMS-02E = model offers architecture, implement gradually.
```

---

## 11. Kitchen / KDS

Required:

- KDS enabled.
- kitchen ticket printing.
- prep stations: Grill / Fryer / Assembly / Drinks.
- category-to-station mapping.
- default prep time per category.
- prep time per product.
- hide ready after X minutes.
- new order sound.
- SLA thresholds: warning after 7 min, late after 12 min.

KDS must link to:

- operating day.
- shift.
- order type.
- printer routing.
- kitchen performance reports.

---

## 12. Printing and Hardware

Printers:

- receipt printer.
- kitchen printer.
- station printers.
- paper size 58mm/80mm.
- number of copies.
- auto-print triggers: send to kitchen / pay / bill & print.
- receipt logo.
- show tax/cashier/shift/order type.

Hardware:

- cash drawer.
- barcode scanner.
- customer display.
- payment terminal.
- KDS screen.
- printer status.
- branch/device role.

Windows POS + hardware support remains core scope.

---

## 13. Users and Permissions

Roles:

- Owner.
- Manager.
- Cashier.
- Kitchen.
- Driver.
- Accountant.
- Admin.

Cashier:

- create order.
- qty changes.
- delete item before kitchen submit.
- sent item deletion requires manager.
- discount within threshold.
- print receipt.
- cash payment requires open shift when enabled.

Manager:

- open/close shift.
- edit products/prices.
- disable products.
- approve discounts.
- cancel orders.
- reports.
- users.

Kitchen:

- KDS view.
- change order status.
- no reports/prices/payments unless explicitly enabled.

Driver:

- assigned delivery orders.
- address/phone for assigned orders.
- mark out-for-delivery/delivered.

---

## 14. Shift and Cash

Required:

- require open shift for cash.
- opening cash.
- expected cash.
- actual closing cash.
- cash difference.
- paid in/out.
- cash drawer operations.
- shift report.
- cashier performance.
- payment split.
- force close before end of day.
- manager approval for cash out.

Every cash-affecting action must be auditable.

---

## 15. Customers and Delivery

Customers:

- name.
- phone.
- addresses.
- notes.
- orders count.
- total spend.
- last order.
- blocked flag.

Delivery:

- zones.
- fee by zone.
- minimum order by zone.
- drivers.
- driver active/inactive.
- link order to driver.
- ETA.
- driver report.
- driver cash collection.

---

## 16. Reports

Required:

- today sales.
- shift sales.
- cashier sales.
- product/category sales.
- best sellers.
- discounts.
- cancellations.
- refunds later.
- taxes.
- payment methods.
- delivery.
- kitchen average prep time.
- late orders.
- cash reconciliation.
- profit after cost/recipe phase.

---

## 17. UX/UI Direction

POS:

- Cairo font.
- RTL-first.
- black/yellow brand.
- square product images.
- + / - product controls.
- details only when needed.
- cart always readable.
- sticky payment actions that never disappear.
- clean scroll areas.

Back Office:

- settings sidebar groups.
- tabs inside modules.
- edit drawers/modals.
- search/filter.
- active/inactive toggles.
- clear save/cancel.
- audit hints for sensitive edits.

---

## 18. YKMS-02E Implementation Scope

Build next:

1. Settings structure.
2. Restaurant profile.
3. Branch settings.
4. Tax/service fee settings.
5. Order type settings.
6. Menu settings tabs.
7. Product edit drawer/modal.
8. Shift/cash settings.
9. Kitchen/KDS settings.
10. Printer settings placeholders.
11. Permission mapping UI.
12. Offers architecture placeholder.

Deferred:

- dine-in visual table map.
- online ordering.
- loyalty.
- inventory recipe costing.
- supplier purchasing.
- advanced promotions engine.
- direct file upload.
- payment terminal integration.

---

## 19. Data Model Candidates

- restaurant_profile
- branch_settings
- tax_profiles
- service_fee_profiles
- order_type_settings
- order_number_sequences
- prep_stations
- printer_devices
- printer_routes
- hardware_devices
- discount_rules
- promotion_rules
- delivery_zones
- driver_profiles
- permission_overrides

---

## 20. Conclusion

YKMS-02E converts YAKEBDA MS from a working POS prototype into a configurable restaurant operating system focused on:

```text
fast cashier
clean menu management
shift/cash control
kitchen dispatch
printing
delivery
reliable reporting
role-based permissions
```