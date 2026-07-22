# Backup Reporting

`npm run scc:backup` creates a PostgreSQL custom-format dump outside version control, applies owner-only file permissions, validates the archive table-of-contents, writes metadata, and optionally reports the result through the enrolled SDK.

`npm run scc:backup:restore-test` restores the newest dump into the guarded disposable database `<source>_restore_test`, checks the restored public-table count, updates `restoreTestedAt`, reports the verified posture, and drops only that disposable database.

Pilot evidence: integrity verified; full restore succeeded with 60 public tables. Backup contents and local SDK state remain under `.scc-pilot/` and are ignored by Git.
