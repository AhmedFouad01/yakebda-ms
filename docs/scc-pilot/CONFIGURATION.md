# Configuration

The integration is disabled by default. Safe examples are in `apps/api/.env.example`.

| Variable | Purpose | Default |
| --- | --- | --- |
| `SCC_ENABLED` | Runtime feature switch | `false` |
| `SCC_BASE_URL` | SCC API origin | `http://127.0.0.1:4000` |
| `SCC_ENVIRONMENT` | Diagnostic label | `development` |
| `SCC_PRODUCT_ID` | SCC restaurant product UUID | seeded Restaurant product |
| `SCC_BRANCH_CODE` | Non-sensitive branch label | `PILOT-01` |
| `SCC_HEARTBEAT_INTERVAL_SECONDS` | Background cadence | `60` |
| `SCC_OFFLINE_QUEUE_LIMIT` | Bounded event count | `1000` |
| `SCC_TIMEOUT_MS` | Network timeout | `5000` |
| `SCC_STATE_PATH` | Local pilot state | `.scc-pilot/state.json` |
| `SCC_MAINTENANCE_WINDOW` | Update gate | `false` |

Enrollment token and challenge may be injected for first enrollment only. They are not persisted by the SDK and must not be committed.
