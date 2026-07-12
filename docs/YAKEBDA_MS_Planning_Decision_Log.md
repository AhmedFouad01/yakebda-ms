<div dir="rtl" align="right">

# YAKEBDA MS — Planning Decision Log

## 2026-07-12 — مصادر الطلب، التسعير، المخزون، السائقون، والحسابات

**الحالة:** Approved Planning Baseline  
**التنفيذ:** لم يبدأ بعد  
**الفرع التوثيقي:** `docs/ykms-11-sources-finance-roadmap`

### القرار

- عدم بدء ERP محاسبي كامل مباشرة.
- إنشاء Order Sources كطبقة مستقلة.
- فصل Channel Menu عن Pricelist.
- إعادة التسعير من Backend.
- تنفيذ المخزون والوصفات قبل COGS.
- تنفيذ السائقين وCOD قبل التسويات الكاملة.
- بناء Finance Control ثم Accounting Bridge.

### المراحل الجديدة

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

### شرط البداية

إغلاق PR #14 بعد القبول البصري أو تحديد Base واضح ومستقر للمراحل الجديدة.

### الملفات المرجعية

- Project Master v1.2
- SRS v2
- Execution Roadmap v2
- Diagrams Roadmap v2
- ADR-002
- ADR-003

</div>
