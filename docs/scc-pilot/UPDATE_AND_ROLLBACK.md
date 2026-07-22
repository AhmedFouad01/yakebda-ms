# Update and Rollback

Offers must match the Restaurant product ID, SHA-256 checksum, and Ed25519 signature. Installation is rejected unless a maintenance window is approved and there are zero active orders, open shifts, and pending/printing jobs.

The coordinator prepares a previous-version marker, installs side-by-side through a host adapter, runs database/application health, reports success, or rolls back and reports `rolled_back`. Unit tests cover tampered artifacts, unsafe active-operation state, and failed-health rollback.

The pilot adapter models version switching and rollback; it is not a production Windows installer. Production requires an approved artifact location, service orchestration, local backup, binary LKG retention, and exercised Windows rollback.
