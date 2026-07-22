# Test Plan

Scenarios A–G map to:

- A enrollment: real SCC enrollment, Ed25519 proof, fleet and audit checks.
- B licensing: real issue/refresh plus offline, grace, expired, and tampered unit cases.
- C monitoring: real heartbeat and browser diagnostics plus bounded outage/recovery tests.
- D errors/maintenance: real redaction, grouping, P1 ticket, and audit checks.
- E backup: real report, archive integrity, disposable full restore.
- F configuration: real publish/fetch plus type, command-key, and LKG tests.
- G update: real signed rollout/install plus checksum, safe-state, and rollback tests.

Regression gates are contracts, 256 API tests, 44 Admin tests, SDK tests, TypeScript builds, theme contract, and production Admin build. Browser validation covers Arabic RTL login, navigation, diagnostics, and manual heartbeat.
