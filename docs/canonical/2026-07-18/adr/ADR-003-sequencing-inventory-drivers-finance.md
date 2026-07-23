<div dir="rtl" align="right">

# ADR-003 — Sequence Inventory and Delivery Before Full Accounting

**الحالة:** Accepted  
**التحديث:** 2026-07-18

## القرار الأصلي

```text
Sources/Pricing
→ Channel Menus
→ Inventory/Recipes
→ Delivery/Drivers
→ Finance Control
→ Accounting/COGS
```

## التحديث التنفيذي

Inventory/Accounting backend foundations تم تنفيذها قبل اكتمال Channel Menus/Delivery بسبب برنامج الإصلاح والتكامل. هذا لا يلغي dependency المنطقي:

- COGS يعتمد على valuation.
- source settlement يعتمد على commission rules.
- driver settlement يعتمد على COD custody.
- production accounting يعتمد على policy approval.

## القرار الحالي

- يُسمح بتوازي backend foundations.
- لا يُسمح بادعاء commercial completion قبل إكمال dependencies التشغيلية.
- Finance Control وAccounting UI والسياسات تظل gates مستقلة.
- Delivery/source settlements لا تُختلق من البيانات الناقصة.

## النتيجة

الكود الموجود يُستخدم كPilot foundation، بينما roadmap يعيد ترتيب operational completion بشكل آمن.

</div>
