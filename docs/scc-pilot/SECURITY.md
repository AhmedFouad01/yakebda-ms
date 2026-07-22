# Security

- Enrollment uses a one-time SCC token/challenge and Ed25519 proof; the token is not persisted.
- Device credential, correlation ID, short timeout, and idempotency keys protect transport/replay behavior.
- License and update signatures are verified locally and product/device bound.
- Payload sanitization and allowlists prevent business or credential exfiltration.
- SCC API and YAKEBDA diagnostics retain tenant/RBAC boundaries.
- Remote configuration cannot execute commands or mutate arbitrary files/data.

Pilot limitation: `AtomicFileStore` writes mode `0600` and atomically renames, but stores an extractable private JWK and credential in JSON. Production Windows must replace it with DPAPI/TPM-backed non-exportable custody and add process-level locking. No private key, credential, state file, backup, or enrollment token is committed.
