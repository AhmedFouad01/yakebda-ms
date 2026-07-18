# Engineering Agent Guide

This file defines the repository-safe operating rules for developers and coding agents.

## Required Reading

Before editing:

1. Read this file.
2. Read `docs/engineering/CURRENT_IMPLEMENTATION.md`.
3. Read the relevant module and its tests.
4. Check the active branch and `git status --short`.

## Repository Architecture

- `apps/admin`: React, Vite, TypeScript administration, POS, and operational UI.
- `apps/api`: Node.js, TypeScript, Express API.
- PostgreSQL is the system of record.
- Knex migrations own schema changes.
- `packages/bridge-contract` contains device integration contracts.

## Non-Negotiable Rules

- Preserve account, branch, and user scoping.
- Enforce permissions in the API, not only in the UI.
- Preserve audit logging for sensitive operational actions.
- Preserve Arabic-first and RTL-first behavior.
- Reuse existing services, schemas, and components before introducing alternatives.
- Do not duplicate order, payment, pricing, or permission logic in the frontend.
- Do not edit unrelated modules in the same change.
- Do not commit secrets, `.env` files, dumps, uploads, generated runtime data, private URLs, prompts, chat transcripts, screenshots with sensitive data, or private memory files.
- Do not include competitor references, private strategy, or internal decision narratives in repository documentation.
- Describe proposed architecture as proposed until implementation is committed and validated.

## POS Rules

- AppShell owns global application navigation and identity.
- Product cards are ordering surfaces; product administration belongs in management workflows.
- Asset paths must use the shared asset URL resolver.
- Order submission must preserve the cart on failure and prevent duplicate submission.
- Shift history must use the actual active-shift boundary and authoritative backend states.

## Database Changes

- Add a numbered migration.
- Keep tenant and branch constraints intact.
- Include a reversible `down` migration where practical.
- Update tests for new constraints, endpoints, and permissions.

## Validation

Run from the repository root:

```bash
npm run contracts:build   # required once after npm ci; not built automatically
npm run api:test
npm run admin:build
```

Or run `npm run check` for the full gate (contracts build + contracts test + color contract + api test + admin test + admin build).

Also run migrations and focused manual QA when the change affects database behavior or operational screens.

## Git Workflow

- Use focused branches and conventional commits.
- Keep pull requests draft until implementation and validation are complete.
- Report only verified test, build, commit, push, and deployment results.
- Pull request descriptions must contain engineering facts only: summary, technical changes, migrations, testing, deployment notes, breaking changes, and risks.
