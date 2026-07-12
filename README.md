# YAKEBDA MS

![CI](https://github.com/AhmedFouad01/yakebda-ms/actions/workflows/ci.yml/badge.svg)

YAKEBDA MS is an Arabic-first, RTL-first restaurant operations platform covering POS, orders, kitchen operations, menu management, CRM, shifts, devices, reporting, and the next operational layers: order sources, channel pricing, inventory, delivery, and finance control.

## Current State

- Foundation, hardware contracts, menu, POS orders, KDS, payments, shifts, CRM, reporting, and administration are implemented.
- The active UI cleanup remains isolated in Draft PR #14 until manual visual acceptance.
- The next core program is **YKMS-11 — Order Sources & Pricing Context**.
- Full accounting is not the next implementation step. The approved sequence is:

```text
Order Sources
→ Channel Menus & Pricelists
→ Inventory & Recipes
→ Delivery & Driver Operations
→ Finance Control
→ Accounting Bridge, COGS & Profitability
→ Online Connectors
→ Egyptian e-Receipt / Compliance
```

## Product Scope

- Point of sale and order lifecycle
- Kitchen display and preparation timing
- Menu, variants, modifiers, and branch availability
- Order sources and source-specific pricing
- Channel menus and external product mappings
- Customer CRM
- Users, roles, and permissions
- Shift and cash operations
- Inventory, recipes, waste, counts, and purchases
- Delivery dispatch, drivers, COD, and driver settlement
- Finance control, expenses, source settlements, and reconciliations
- Accounting bridge, journals, COGS, and profitability
- Reporting, audit trails, devices, printing, and integrations

## Architecture

| Layer | Technology / Direction |
|---|---|
| Admin, POS, KDS | React, Vite, TypeScript |
| API | Node.js, TypeScript, Express |
| Database | PostgreSQL, Knex migrations |
| Pricing | Backend quote service; frontend is never the final pricing authority |
| Device integration | Local bridge contract and print jobs |
| Finance | Operational subledger first; accounting bridge after inventory valuation |
| Testing | Vitest, Supertest, production build gate |

## Canonical Documentation

- `docs/YAKEBDA_MS_Project_Master_v1.2_AR_RTL.md`
- `docs/YAKEBDA_MS_Project_Instructions_v1.2_AR_RTL.md`
- `docs/YAKEBDA_MS_SRS_v2_AR_RTL.md`
- `docs/YAKEBDA_MS_Execution_Roadmap_v2_AR_RTL.md`
- `docs/YAKEBDA_MS_Diagrams_Roadmap_v2_AR_RTL.md`
- `docs/engineering/CURRENT_IMPLEMENTATION.md`
- `docs/adr/ADR-002-order-sources-channel-menus-pricelists.md`
- `docs/adr/ADR-003-sequencing-inventory-drivers-finance.md`

Historical Restaurant MS SRS/diagram files remain reference-only.

## Repository Structure

```text
apps/
  api/                 Backend API
  admin/               Admin, POS, KDS, and operations UI
packages/
  bridge-contract/     Device integration contracts
docs/
  adr/                  Architecture decisions
  engineering/          Current implementation and workflow
  deployment/           Deployment guidance
  QA/                   Manual test scripts
scripts/                Development and setup utilities
```

## Local Development

### Requirements

- Node.js 20+
- npm
- PostgreSQL 16+
- Docker is optional but recommended

### Validate

```bash
npm ci
npm run api:migrate
npm run api:test
npm run admin:build
```

### Run

Terminal 1:

```bash
npm run api:dev
```

Terminal 2:

```bash
npm run admin:dev
```

## Engineering Rules

Before editing:

1. Read `AGENTS.md`.
2. Read `docs/engineering/CURRENT_IMPLEMENTATION.md`.
3. Read the relevant ADR and tests.
4. Confirm the active branch and clean working tree.

All changes must preserve tenant and branch scoping, API-enforced permissions, auditability, migrations, RTL behavior, backend pricing authority, and the established test/build gates.

## Status

Active development. Proposed modules remain proposed until implemented, migrated, tested, and merged.
