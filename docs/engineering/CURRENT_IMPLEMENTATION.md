# Current Implementation

## Application Structure

### Admin and POS

- React + Vite + TypeScript.
- Arabic-first and RTL-first.
- AppShell owns the global header, navigation, and full-page layout.
- POS, kitchen, orders, menu, customers, users, roles, reports, and settings are active application areas.

### API

- Node.js 22 + TypeScript + Express.
- PostgreSQL through Knex.
- JWT-based authentication.
- Permission middleware protects operational and administrative endpoints.
- Audit records are created for sensitive state changes.
- Request IDs, redacted structured JSON access/error events, and separate
  liveness/readiness endpoints are implemented.
- Confirmed customer and product collections use validated keyset cursors with
  deterministic ID tie-breakers.

### Shared Contracts

- `@ykms/contracts` owns bounded API/Admin wire contracts for pagination,
  customer reads, order statuses, and order summaries.
- Full order, quote, receipt, KDS, POS, database, and command models remain
  local to their owning layer.
- The package contains no framework, database, environment, or side-effectful
  runtime code.

### Systronic Control Center Pilot

- `@scc/client-sdk` owns device identity/enrollment, bounded offline events,
  signed offline licensing, typed LKG configuration, and signed updates.
- The API maps allowlisted database/printer/storage/backlog signals and exposes
  owner-only diagnostics, heartbeat, backup status, and runtime enable control.
- The Admin application exposes Arabic RTL SCC diagnostics under `/scc`.
- Backup and restore scripts create an ignored custom-format archive, verify
  it, restore into a guarded disposable test database, and report posture.
- SCC remains outside restaurant transaction paths and is disabled by default.

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
- Refunds are operational, linked offsetting payment rows with net-paid and
  shift-cash enforcement; the refund setting is not a no-op.

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
npm run contracts:build
npm run contracts:test
npm run api:migrate
npm run api:test
npm run admin:test
npm run admin:build
npm run ui:colors:check
npm run scc:sdk:build
npm run scc:sdk:test
```

For UI changes, verify the affected operational screens at common cashier resolutions and check RTL behavior.

## Platform Direction

The application is cloud-first. The current web interface and API remain the core platform. Windows operational clients, local device integration, resilient local caching, and synchronization are planned platform capabilities and must be treated as architecture work until implemented and validated.

## Documentation Boundary

Repository documentation contains current engineering facts and safe operating instructions. Private product strategy, commercial research, internal rationale, prompts, and conversation history are maintained outside the repository.

## Known Platform Boundaries

- Cursor pagination is not snapshot isolation. Rows whose sort values change
  during traversal can move between pages.
- `GET /orders`, current-shift order history, and large exports retain separate
  pagination/scaling debt.
- Structured logs currently write local JSON lines. Production transport,
  retention, rotation, and alerting are not implemented.
- The SRS requests OpenAPI/Swagger as a future capability; complete OpenAPI
  documentation is not currently implemented.
