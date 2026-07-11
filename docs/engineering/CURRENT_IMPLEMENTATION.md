# Current Implementation

## Application Structure

### Admin and POS

- React + Vite + TypeScript.
- Arabic-first and RTL-first.
- AppShell owns the global header, navigation, and full-page layout.
- POS, kitchen, orders, menu, customers, users, roles, reports, and settings are active application areas.

### API

- Node.js + TypeScript + Express.
- PostgreSQL through Knex.
- JWT-based authentication.
- Permission middleware protects operational and administrative endpoints.
- Audit records are created for sensitive state changes.

### Database

- Numbered Knex migrations are the schema source of truth.
- Account and branch scope must be preserved in queries and constraints.
- Development and test databases must remain separate.

## Operational Invariants

### Orders

- Order totals are computed by backend services.
- Frontend code must not recreate pricing, tax, service-fee, discount, or rounding rules.
- Order submission must prevent duplicate requests.
- Cart state is cleared only after a confirmed successful operation.

### Payments and Shifts

- Cash operations may require an active shift depending on settings.
- Shift-scoped history uses the actual shift opening timestamp.
- Payment status is derived from recorded payments and the order total.

### Kitchen

- Kitchen state is derived from authoritative order status and timestamps.
- Operational timestamps include submission, kitchen entry, ready, completion, and cancellation where available.

### Product Images

- Uploaded files are served by the API under `/uploads` in local development.
- Frontend image paths must use the shared `resolveAssetUrl` helper.
- Runtime upload directories are not source-controlled.

### Product Management

- POS product cards are for ordering.
- Product editing is handled through menu-management workflows.
- Variants and modifier requirements must not be bypassed by quick-add interactions.

## Validation Commands

```bash
npm run api:migrate
npm run api:test
npm run admin:build
```

For UI changes, verify the affected operational screens at common cashier resolutions and check RTL behavior.

## Platform Direction

The application is cloud-first. The current web interface and API remain the core platform. Windows operational clients, local device integration, resilient local caching, and synchronization are planned platform capabilities and must be treated as architecture work until implemented and validated.

## Documentation Boundary

Repository documentation contains current engineering facts and safe operating instructions. Private product strategy, commercial research, internal rationale, prompts, and conversation history are maintained outside the repository.
