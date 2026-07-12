# Contributing to YAKEBDA MS

## Branching

- `main` contains the stable integration state.
- Create focused feature or fix branches from the latest approved base.
- Keep pull requests scoped to one operational objective.

Recommended names:

```text
feature/<short-description>
fix/<short-description>
docs/<short-description>
```

## Commit Style

Use conventional, descriptive commits:

```text
feat(menu): add spreadsheet import preview
fix(pos): preserve cart when order creation fails
refactor(auth): simplify permission checks
docs: update deployment guidance
```

Avoid conversational messages, internal milestone diaries, or references to private planning discussions.

## Before Editing

1. Read `AGENTS.md`.
2. Read `docs/engineering/CURRENT_IMPLEMENTATION.md`.
3. Confirm the active branch.
4. Run `git status --short`.
5. Inspect the relevant module and existing tests.

## Required Validation

```bash
npm ci
npm run api:test
npm run admin:build
```

Run migrations against an isolated development database when database changes are included.

## Engineering Rules

- Preserve Arabic-first and RTL-first behavior.
- Preserve account, branch, and user scoping.
- Enforce permissions at the API boundary.
- Record auditable operational changes where required.
- Add migrations for schema changes.
- Reuse established services and components instead of duplicating business logic.
- Do not modify unrelated modules in the same pull request.
- Do not commit secrets, `.env` files, database dumps, runtime uploads, private URLs, screenshots with sensitive data, prompts, chat transcripts, or private memory documents.
- Keep repository documentation vendor-neutral and limited to verified engineering facts.

## Pull Requests

Use the following structure:

- Summary
- Technical changes
- Database or migration impact
- Testing
- Deployment notes
- Breaking changes
- Known risks

Keep a pull request in draft while implementation or validation is incomplete.
