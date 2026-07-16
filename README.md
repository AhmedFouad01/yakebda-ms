# YAKEBDA MS

![CI](https://github.com/AhmedFouad01/yakebda-ms/actions/workflows/ci.yml/badge.svg)

YAKEBDA MS is a cloud-first restaurant operations platform with Arabic-first and RTL-first user experiences.

## Product Scope

- Point of sale
- Order management
- Kitchen display
- Menu and pricing management
- Customer CRM
- Users, roles, and permissions
- Shift and cash operations
- Reporting and audit trails
- Device and print-job integration

## Architecture

| Layer | Technology |
|---|---|
| Admin and POS | React, Vite, TypeScript |
| API | Node.js, TypeScript, Express |
| Database | PostgreSQL, Knex migrations |
| Testing | Vitest, Supertest |
| Device integration | Local bridge contract and print jobs |

The platform is designed for cloud deployment while preserving a path for Windows-based operational clients and resilient device integrations.

## Repository Structure

```text
apps/
  api/                 Backend API
  admin/               Admin, POS, and operations UI
packages/
  bridge-contract/     Device integration contracts
docs/
  architecture/        Architecture documentation
  engineering/         Current implementation and workflow
  deployment/          Deployment guidance
scripts/                Development and setup utilities
```

## Local Development

### Requirements

- Node.js 20+
- npm
- PostgreSQL 16+
- Docker is optional but recommended for local database setup

### Database

```powershell
docker run -d --name ykms-postgres `
  -e POSTGRES_USER=ykms `
  -e POSTGRES_PASSWORD=ykms `
  -e POSTGRES_DB=ykms `
  -p 5432:5432 postgres:16
```

Create the test database if required:

```powershell
docker exec -it ykms-postgres psql -U ykms -d postgres -c "CREATE DATABASE ykms_test OWNER ykms;"
```

### Install and validate

```bash
npm ci
cp apps/api/.env.example apps/api/.env
npm run api:migrate
npm run api:seed
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

Open `http://localhost:5173`.

## Engineering Workflow

Before changing the codebase, read:

- `AGENTS.md`
- `docs/engineering/CURRENT_IMPLEMENTATION.md`
- `CONTRIBUTING.md`

Graph-assisted repository navigation for Codex and Claude Code is documented in:

- `docs/engineering/GRAPHIFY_INTEGRATION.md`

All changes must preserve tenant and branch scoping, permissions, auditability, migrations, RTL behavior, and the established test/build gates.

## Quality Gates

```bash
npm run api:test
npm run admin:build
```

Database changes must include a migration and must remain reversible where practical.

## Security

Do not commit secrets, credentials, environment files, database dumps, uploaded runtime files, or production configuration. Report security concerns through the process documented in `SECURITY.md`.

## Status

The repository is under active development. Production deployment requires environment-specific security, storage, backup, monitoring, and operational validation.
