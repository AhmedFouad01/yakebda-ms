# Blockers

| Blocker | Risk | Owner / decision | Next action |
| --- | --- | --- | --- |
| Production device private-key/credential custody is not DPAPI/TPM-backed | Credential extraction on a compromised Windows host | Security + Windows platform owner | Implement non-exportable OS store adapter, migration, rotation, and recovery test |
| Real Windows side-by-side installer is unavailable | Pilot simulator cannot prove binary/service rollback | Release engineering | Supply signed installer contract and LKG layout; run on recoverable pilot hardware |
| Production signing custodians, trial/grace policy, and SLA are not approved | Cannot authorize production rollout | Product, Legal, Security, Support | Record owners and approved policy before production pilot |
| Long-duration memory, outage, and high-volume telemetry profile not run | Capacity bounds not production-proven | SRE/QA | Execute soak/load plan with representative restaurant hardware |

These do not block the controlled internal development pilot. They block a production restaurant rollout and a 100% completion claim.
