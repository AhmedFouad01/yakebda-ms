# ADR-003 — Sequence Inventory and Delivery Before Full Accounting

- **Status:** Accepted for planning
- **Date:** 2026-07-12
- **Scope:** Program sequencing and finance boundary

## Context

The system needs expenses, source commissions, shift reconciliation, driver COD settlement, COGS, profitability, and possible accounting integration. A full accounting module built before source pricing and inventory would produce incomplete or misleading profitability.

## Decision

Adopt two finance layers:

1. **Finance Control** inside YAKEBDA MS for operational cash, expenses, settlements, and reconciliations.
2. **Accounting Bridge / Ledger** after inventory valuation is stable.

Approved sequence:

```text
Sources & Pricing
→ Channel Menus
→ Inventory & Recipes
→ Delivery & Drivers
→ Finance Control
→ Accounting Bridge / COGS / Profitability
```

Finance design may begin early. Finance Control implementation may overlap with late inventory work, but COGS and gross-profit reporting cannot be declared complete before inventory valuation.

## Rationale

- Source settlements need source identity and commission rules.
- Driver settlements need delivery ownership and COD custody.
- Product profitability needs recipe cost and inventory valuation.
- External accounting integration needs stable financial events and mappings.

## Consequences

### Positive

- Operational value arrives before ERP complexity.
- Accounting entries are based on authoritative operational events.
- COGS and margins are credible.
- External accounting remains replaceable through adapters.

### Costs

- Finance is delivered in stages.
- Some early reports exclude COGS.
- Backfill and reconciliation are required when the ledger is enabled.

## Out of Scope for Initial Finance

- Payroll.
- Fixed assets.
- Bank synchronization.
- Multi-currency.
- Full statutory accounting without accountant validation.

## Controls

- Idempotent financial events.
- Immutable posted entries.
- Reversals instead of edits.
- Debit equals credit.
- Period lock.
- Branch/source/payment dimensions.
