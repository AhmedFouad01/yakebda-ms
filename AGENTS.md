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
npm run api:test
npm run admin:build
```

Also run migrations and focused manual QA when the change affects database behavior or operational screens.

## Git Workflow

- Use focused branches and conventional commits.
- Keep pull requests draft until implementation and validation are complete.
- Report only verified test, build, commit, push, and deployment results.
- Pull request descriptions must contain engineering facts only: summary, technical changes, migrations, testing, deployment notes, breaking changes, and risks.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

When the user types `/graphify`, use the installed graphify skill or instructions before doing anything else.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- Dirty graphify-out/ files are expected after hooks or incremental updates; dirty graph files are not a reason to skip graphify. Only skip graphify if the task is about stale or incorrect graph output, or the user explicitly says not to use it.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
