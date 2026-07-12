# ADR-002 — Separate Order Sources, Channel Menus, and Pricelists

- **Status:** Accepted for planning
- **Date:** 2026-07-12
- **Scope:** Proposed architecture; not implemented yet

## Context

YAKEBDA MS must support POS, phone, website, QR, WhatsApp, and third-party platforms. The same product may have different availability, presentation, and price by source. Duplicating products per source would fragment recipes, inventory, reporting, and product identity.

## Decision

Use three separate concepts:

1. **Order Source** — where the order originated.
2. **Channel Menu** — what the source can sell and how it is presented.
3. **Pricelist** — how eligible products, variants, and modifiers are priced.

The master product catalog remains the single product identity and recipe owner.

The backend quote service resolves the final price. The frontend may display a quote but must not recreate final pricing logic.

## Pricing Precedence

```text
source + branch + variant override
source pricelist rule
branch product price
base product price
otherwise reject
```

## Order Snapshot

Orders and order lines store source, menu, pricelist, rule, base price, resolved price, and tax context snapshots.

## Consequences

### Positive

- No duplicate products or recipes.
- Deterministic pricing.
- Historical orders remain stable.
- External platform mappings are isolated.
- Reporting can analyze source independently from order type.

### Costs

- More schema and validation.
- Source changes require full requote.
- Publishing a channel menu needs validation.
- Backfill is required for existing orders.

## Rejected Alternatives

- Duplicate product per source.
- Store a single `source_price` column on products.
- Let the frontend change prices without server confirmation.
- Treat source as order type or payment method.

## Required Validation

- Deterministic rule tests.
- No zero-price fallback.
- Tenant and branch scope.
- Snapshot immutability.
- Modifier pricing tests.
- Requote behavior when source changes.
