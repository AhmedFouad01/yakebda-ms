# Current Implementation

## Application Structure

### Admin, POS, and KDS

- React + Vite + TypeScript.
- Arabic-first and RTL-first.
- AppShell owns global navigation and identity.
- Active areas include POS, kitchen, orders, menu, customers, users, roles, reports, settings, devices, printing, and audit.
- The global Light/Dark UI foundation and legacy cleanup were merged through PR #14 and are part of the current `main` baseline.

### API

- Node.js + TypeScript + Express.
- PostgreSQL through Knex.
- JWT authentication and API permission middleware.
- Sensitive state changes create audit records.
- Order pricing, tax, fees, discounts, and rounding are backend responsibilities.

### Database

- Numbered Knex migrations are the schema source of truth.
- Account and branch scope must be preserved.
- Development and test databases remain separate.

## Implemented Operational Areas

- Tenant, branches, users, roles, permissions, and audit.
- Devices, hardware endpoints, print jobs, and bridge contracts.
- Menu catalog, variants, modifier groups, branch availability, and menu import/export.
- POS order creation and backend quote calculations.
- Order lifecycle and status history.
- KDS with timestamps, SLA metrics, and operational actions.
- Payments, shifts, receipts, and reports.
- Settings, CRM, and customer analytics.

## Current Invariants

### Orders and Pricing

- Frontend code must not recreate final pricing.
- Existing quote and order services are the starting point for YKMS-11.
- Order submission prevents duplicate requests.
- Cart state clears only after confirmed success.
- Existing orders do not yet have the proposed source/menu/pricelist snapshots.

### Payments and Shifts

- Cash operations may require an active shift.
- Payment state is derived from payments and authoritative totals.
- Shift history uses the actual opening timestamp.

### Kitchen

- KDS derives state from order statuses and timestamps.
- Ready, completion, and cancellation timestamps remain authoritative.

### Product Management

- Master product management belongs in menu workflows.
- POS product cards are ordering surfaces.
- Variant and modifier requirements must not be bypassed.

## Proposed, Not Implemented

The following are approved planning targets only:

- Order source configuration.
- Source-specific pricelists.
- Channel menus and external mappings.
- Server-side source repricing snapshots.
- Inventory items, UOM, recipes, stock ledger, and valuation.
- Dispatch, driver state machine, COD custody, and settlements.
- Expenses, source settlements, payment reconciliation, and finance close.
- Financial event outbox, accounting journals, COGS, and profitability.
- Platform adapters and Egyptian e-receipt integration.

## Required Reading for Next Core Work

- `docs/YAKEBDA_MS_Project_Master_v1.3_AR_RTL.md`
- `docs/YAKEBDA_MS_Project_Instructions_v1.3_AR_RTL.md`
- `docs/YAKEBDA_MS_Execution_Roadmap_v2.1_AR_RTL.md`
- `docs/YAKEBDA_MS_SRS_v2_AR_RTL.md`
- `docs/YAKEBDA_MS_Diagrams_Roadmap_v2.1_AR_RTL.md`
- `docs/adr/ADR-002-order-sources-channel-menus-pricelists.md`
- `docs/adr/ADR-003-sequencing-inventory-drivers-finance.md`

## Validation Commands

```bash
npm audit
npm run api:migrate
npm run api:test
npm run admin:build
git diff --check
```

Core pricing, inventory, delivery, and finance changes also require focused idempotency, scope, reconciliation, and rollback tests.

## Documentation Boundary

Repository documentation contains engineering facts, requirements, and approved architecture. Private research notes, commercial comparisons, chat history, and memory packets remain in Google Drive.
