<div dir="rtl" align="right">

# عقد Local Device Bridge — v1 (YKMS-01H)

الـ Bridge هو خدمة صغيرة تعمل على جهاز Windows داخل الفرع، وتربط بين Backend API والهاردوير المحلي (طابعات، درج كاش، شاشة عميل، باركود).

## المصادقة

- يستخدم الـ Bridge رمز API له نطاق `bridge` فقط.
- يُنشأ الرمز من لوحة الإدارة (عملاء API ← إنشاء رمز) ويظهر **مرة واحدة فقط**.
- كل الطلبات: `Authorization: Bearer ykms_xxx`.

## دورة العمل

1. **نبض الحياة** كل 15 ثانية:

```
POST /api/v1/bridge/heartbeat
{ "device_id": "...", "endpoints": [{ "id": "...", "status": "online" }] }
```

يحدّث حالة الجهاز `online` وآخر ظهور لكل نقطة هاردوير (FR-076).

2. **سحب مهام الطباعة** كل ثانيتين:

```
GET /api/v1/bridge/print-jobs?device_id=...
```

يعيد حتى 20 مهمة `pending` مرتبطة بنقاط الهاردوير على هذا الجهاز، ويحوّل حالتها إلى `printing` تلقائيًا (claim).

3. **تنفيذ الطباعة محليًا**:

- `protocol = escpos`: إرسال الأسطر العربية (`payload.lines`) للطابعة عبر USB/LAN/Bluetooth مع دعم تشكيل واتجاه RTL.
- `protocol = windows_driver`: الطباعة عبر تعريف Windows باستخدام `payload.template` و `payload.data`.
- إذا كان `payload.open_cash_drawer = true` يُرسل أمر فتح الدرج بعد الطباعة (FR-073) — العملية مسجلة في Audit Log على الخادم.

4. **إبلاغ النتيجة**:

```
POST /api/v1/bridge/print-jobs/{id}/result
{ "status": "printed" }        أو
{ "status": "failed", "error": "الطابعة غير متصلة" }
```

## قواعد الاعتمادية (NFR-002)

- فشل الطباعة **لا يوقف** أي عملية على الخادم؛ المهمة تتحول إلى `failed` ويمكن إعادة إرسالها من لوحة الإدارة.
- المهام لها عدّاد محاولات `attempts`؛ الـ Bridge لا يعيد المحاولة أكثر من 3 مرات لنفس المهمة.
- انقطاع الإنترنت: يستمر الـ Bridge بالمحاولة؛ عند العودة يسحب المهام المتراكمة بترتيب `created_at`.

## الترقية المستقبلية

- v2: قناة WebSocket بنفس الـ payloads (دفع فوري بدل السحب) — لا تغيير في بنية البيانات.
- التغليف لاحقًا داخل Electron/Tauri ممكن دون تغيير العقد.

</div>
