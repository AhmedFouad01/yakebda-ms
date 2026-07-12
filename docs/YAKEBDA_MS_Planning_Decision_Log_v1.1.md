<div dir="rtl" align="right">

# YAKEBDA MS — Planning Decision Log v1.1

## 2026-07-12 — مصادر الطلب والتسعير والمخزون والسائقون والحسابات

**الحالة:** Approved Planning Baseline  
**التنفيذ:** لم يبدأ بعد  
**الفرع:** `docs/ykms-11-sources-finance-roadmap`

### الحالة التنفيذية

- PR #14 مدموجة في `main` عند `4df57964ef0dacddbbaca2b723849dd4afe055c0`.
- Draft PR #16 يحتوي وثائق البرنامج الجديد.
- لا توجد migrations أو endpoints أو UI للموديولات الجديدة حتى الآن.

### القرارات

- Order Source مستقل عن order type/payment/delivery provider.
- Master product واحد بدل نسخ المنتجات لكل قناة.
- Channel Menu للإتاحة والمحتوى؛ Pricelist للسعر.
- Backend Quote هو السلطة النهائية مع snapshots تاريخية.
- المخزون والوصفات قبل COGS والربحية الكاملة.
- السائقون وعهدة التحصيل قبل التسويات المالية الكاملة.
- Finance Control قبل Accounting Bridge.

### المراحل

| المرحلة | الوصف |
|---|---|
| YKMS-11 | Order Sources & Pricing Context |
| YKMS-12 | Channel Menus & External Mappings |
| YKMS-13 | Inventory & Recipes |
| YKMS-14 | Delivery & Driver Operations |
| YKMS-15 | Finance Control |
| YKMS-16 | Accounting Bridge, COGS & Profitability |
| YKMS-17 | Online / QR / Platform Connectors |
| YKMS-18 | Egyptian e-Receipt & Compliance |

### خطوة البداية

مراجعة ودمج PR #16، ثم إنشاء `feature/ykms-11-order-sources` من `main`.

### المراجع

- Project Master v1.3.
- Project Instructions v1.3.
- SRS v2.
- Execution Roadmap v2.1.
- Diagrams Roadmap v2.1.
- ADR-002 وADR-003.

</div>
