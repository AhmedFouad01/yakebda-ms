# Architecture

```mermaid
flowchart LR
  UI["Arabic RTL diagnostics"] --> API["YAKEBDA API"]
  API --> ADAPTER["YakebdaSccIntegration"]
  ADAPTER --> SDK["@scc/client-sdk"]
  SDK --> SCC["SCC device APIs"]
  API --> DB[("YAKEBDA PostgreSQL")]
  BACKUP["Backup and restore scripts"] --> DB
  BACKUP --> SDK
```

`packages/scc-client-sdk` owns device identity, enrollment proof, authenticated transport, bounded store-and-forward, signed license validation, typed configuration, and signed update coordination. `apps/api/src/scc` maps only allowlisted restaurant health signals and safe update preconditions. `apps/admin` provides a permission-gated status surface.

SCC calls run in the background or explicit operator actions. No SCC network call is awaited in POS, order, kitchen, print, or database transaction paths.
