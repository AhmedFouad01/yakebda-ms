# SCC-PILOT-01

YAKEBDA_MS is the first real product integration for Systronic Control Center (SCC). The pilot is implemented on `feat/scc-client-sdk-pilot`; Arena Hub is deferred.

Start with [FINAL_STATUS.md](FINAL_STATUS.md), then use [PILOT_RUNBOOK.md](PILOT_RUNBOOK.md) and [VALIDATION_EVIDENCE.md](VALIDATION_EVIDENCE.md). Architecture, configuration, security, licensing, telemetry, errors, backups, remote configuration, and updates each have a focused document in this directory.

The non-negotiable boundary is that SCC is an operational control-plane integration. Restaurant sales, orders, kitchen, printing, and the local PostgreSQL database remain authoritative and must continue when SCC is unavailable.
