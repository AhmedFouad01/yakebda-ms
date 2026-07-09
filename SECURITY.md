# Security Policy — YAKEBDA MS

## Reporting

For now, report security issues privately to the project owner. Do not open public GitHub issues for sensitive vulnerabilities.

## Baseline Rules

- Do not commit `.env` files.
- Do not commit API keys, database credentials, JWT secrets, or customer data.
- Demo credentials must be local/dev only.
- API tokens must be shown once and stored hashed.
- Hardware bridge actions must be account/branch scoped.
- POS cash and shift actions must be audit logged.

## Pre-production checklist

- Rotate all dev secrets.
- Replace dev JWT secret.
- Run dependency audit and update vulnerable packages.
- Confirm PostgreSQL user permissions.
- Enable GitHub branch protection.
- Enable required CI checks.
