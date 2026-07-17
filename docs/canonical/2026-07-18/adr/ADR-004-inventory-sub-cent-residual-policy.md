<div dir="rtl" align="right">

# ADR-004 — Inventory Sub-cent Residual Policy

**الحالة:** Provisional Safety Policy — Accountant Approval Required  
**التنفيذ:** Merged backend

## المشكلة

Inventory valuation تُحفظ بدقة 4 منازل، بينما journals بقرشين. التقريب المباشر يمكن أن يفقد قيمة أو يعلّم event posted بدون evidence.

## القرار

- source amount بدقة 4dp.
- journal amount بدقة 2dp باستخدام deterministic half-up.
- حفظ residual بحيث:

```text
source_amount = journal_amount + residual_amount
```

- residual ledger scoped by account/branch.
- non-zero event الذي يقرب journal إلى صفر = `deferred_rounding`، وليس `posted`.
- reversal ينفي source/journal/residual بالضبط ويرتبط بالأصل.
- period lock يُمنع إذا مجموع residual open غير صفري.
- لا automatic posting إلى rounding account في السياسة الحالية.

## ما لم يُحسم

- متى وكيف تتم settlement للرصيد المتراكم.
- rounding account mapping.
- materiality threshold.
- period/date policy.
- accountant sign-off.

## Production Boundary

وجود guards والتتبع لا يساوي اعتمادًا محاسبيًا أو قانونيًا.

</div>
