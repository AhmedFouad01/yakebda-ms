# Project Status

## Current State

YAKEBDA MS is under active development as a cloud-first restaurant operations platform.

Implemented areas include:

- Authentication and role-based access control
- Accounts, branches, users, and devices
- Menu, products, variants, and modifiers
- POS order creation and payment handling
- Kitchen and order-status workflows
- Shift and cash foundations
- Customer CRM and analytics
- Reporting and audit trails
- Product image upload
- Spreadsheet import and export

## Current Validation Baseline

- Node 22 is the supported runtime line.
- API typecheck and the complete API suite are required quality gates.
- Shared contracts must build and pass their schema tests.
- The administration application must pass tests and a production build.
- The semantic color contract must pass.
- Database changes must be applied through migrations.
- Operational UI changes require manual RTL and viewport validation.

## Active Work

P0 security/payment hardening, P1 operational reliability, and P2 UI
maintainability are merged. P3 platform hardening is a validated release
candidate covering observability, bounded cursor pagination, Node 22, and
shared API/Admin wire contracts. Inventory and Accounting are separate future
feature tracks and are not implemented by P3.

## Platform Direction

The system remains cloud-first. Future platform work may add Windows operational clients, local device integration, resilient caching, and synchronization. These items remain architecture goals until implemented and validated.

## Engineering References

- `AGENTS.md`
- `docs/engineering/CURRENT_IMPLEMENTATION.md`
- `CONTRIBUTING.md`
