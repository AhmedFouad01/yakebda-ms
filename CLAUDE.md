# CLAUDE.md

Repository guidance for Claude Code. See `AGENTS.md` for the full engineering rules (architecture, non-negotiable rules, POS rules, database change process, git workflow).

## Setup / Environment

Prerequisites: Node 22, PostgreSQL reachable via Docker (databases `ykms` and `ykms_test`, port 5432 — see `apps/api/.env.example`).

```bash
cp apps/api/.env.example apps/api/.env
npm ci
```

**Important:** `npm ci` does NOT build the `@ykms/contracts` workspace (no `prepare`/`postinstall` hook wires it up). `apps/api` and `apps/admin` import from `@ykms/contracts`'s built `dist/`, so skipping this step fails `api:test` and `admin:build` with an unresolved-package error. Immediately after `npm ci`, run either:

```bash
npm run contracts:build
```

or the full check below, which builds contracts first as its own first step.

Then apply migrations:

```bash
npm run api:migrate
```

## Standard Validation

Full check (builds contracts, runs contracts tests, checks the semantic color contract, runs API tests, admin tests, and admin build):

```bash
npm run check
```

Individual pieces, if needed:

```bash
npm run contracts:build   # required before api:test / admin:build after a fresh npm ci
npm run api:test
npm run admin:build
```
