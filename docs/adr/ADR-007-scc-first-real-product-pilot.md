# ADR-007 — SCC first real product pilot

Status: accepted for controlled pilot, 2026-07-22.

## Decision

YAKEBDA_MS is the first real product integrated with Systronic Control Center on `feat/scc-client-sdk-pilot`. Arena Hub is deferred. SCC is isolated as a resilient control-plane adapter and cannot become authoritative for restaurant transactions.

Use the repository's real TypeScript/Node architecture. Keep the SCC client in a standalone workspace, expose only allowlisted health/configuration operations, use background bounded delivery, require signed grants/artifacts, and gate updates on restaurant safe state.

## Consequences

SCC outages do not block startup, POS, orders, kitchen, printing, or local database access. The pilot can validate real enrollment through rollout now. Production remains blocked on OS-backed key custody and a real Windows side-by-side installer/rollback implementation.
