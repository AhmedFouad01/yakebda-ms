# Contributing — YAKEBDA MS

YAKEBDA MS is a private, Arabic-first restaurant management system.

## Branching

- `main`: stable, runnable state only.
- `dev`: integration branch.
- `feature/ykms-xx-short-name`: feature work.
- `fix/short-name`: bug fixes.

## Commit style

Use clear commits:

```text
YKMS-02B: improve POS shift/payment flow
fix(api): validate branch scoped device IDs
chore(docs): update QA script
```

## Before PR

Run:

```bash
npm ci
npm run api:test
npm run admin:build
```

## Rules

- Arabic-first / RTL-first.
- Active name: `YAKEBDA MS`.
- Active key: `YAKEBDA_MS`.
- Milestones: `YKMS-XX` only.
- No real secrets, tokens, `.env`, or production credentials.
- Foodics is only a functional benchmark; do not copy UI or proprietary behavior.
