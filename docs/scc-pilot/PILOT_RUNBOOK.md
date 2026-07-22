# Pilot Runbook

1. Start local PostgreSQL for SCC and YAKEBDA; migrate/seed both development databases.
2. Start SCC API/dashboard and confirm `GET /health` on port 4000.
3. Run `npm ci && npm run scc:sdk:build` in YAKEBDA.
4. With the development SCC admin password supplied only through the environment, run `SCC_STATE_PATH=.scc-pilot/state.json npm run scc:e2e`.
5. Start YAKEBDA with `SCC_ENABLED=true`, pilot labels, and the same state path; start Admin and open `/scc` as an owner.
6. Confirm enrolled, healthy, `ValidOffline`, queue zero, active config version, and no connection error. Send a manual heartbeat.
7. Run backup and guarded restore test with `DATABASE_URL`, `SCC_POSTGRES_CONTAINER`, and `SCC_STATE_PATH` supplied through the environment.
8. If SCC fails, leave YAKEBDA running, inspect pending count/last error, and restore SCC. Never interrupt POS/order/kitchen/printing to repair SCC.
9. Before any update, close active orders/shifts/print jobs and explicitly enable the maintenance window.

Rollback: disable SCC with the UI/runtime switch for control-plane incidents. For application updates, retain the prior binary/data backup, let the adapter health check roll back, and verify database, POS, kitchen, and printing before reopening.
