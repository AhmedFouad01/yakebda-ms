<div dir="rtl" align="right">

# ADR-002 — Separate Order Sources, Channel Menus, and Pricelists

**الحالة:** Accepted architecture / Partial implementation  
**التحديث:** 2026-07-18

## السياق

الطلب قد يأتي من الكاونتر، الهاتف، الموقع، QR، WhatsApp أو aggregator. القناة قد تغيّر الإتاحة والعرض والسعر، لكن تكرار المنتجات يكسر الوصفات والمخزون والتقارير.

## القرار

نفصل بين:

1. `Order Source`: أصل الطلب.
2. `Channel Menu`: ما يمكن عرضه وبيعه وكيف يُعرض.
3. `Pricelist/Rules`: كيفية التسعير حسب المصدر/الفرع/الوقت/المنتج/variant/modifier.

الـMaster Catalog واحد، والـbackend quote authority.

## Current Merged Slice

```text
source product price override
→ branch product override
→ base price
→ reject
```

- `order_sources`.
- `source_product_rules` للإتاحة وprice override.
- order source ID/name snapshot.
- POS source requirement/quote integration.

## Target Model

```text
source + branch + variant explicit override
→ source pricelist rule
→ branch override
→ base price
→ reject
```

ويشمل:

- modifiers.
- effective windows.
- channel versions/publish.
- external mappings.
- commissions/settlements.

## Consequences

- لا duplicate catalog/recipes.
- source change requires requote.
- full model يحتاج migrations/contracts/admin/publish validation.
- current slice لا يُسمى full pricelist/channel menu.

## Rejected

- duplicate product per platform.
- single `source_price` column.
- frontend pricing authority.
- treating source as order type/payment/provider.

</div>
