# Remote Configuration

The SDK accepts versioned primitive values only, bounds key/value counts and lengths, rejects command/script/shell/SQL/executable/path/delete semantics, and caches last-known-good configuration.

YAKEBDA adds a narrower atomic allowlist: `updateChannel`, `heartbeatIntervalSeconds`, `diagnosticsLevel`, `updatePreview`, `backupWarningHours`, and `operatorBanner`. Values are range/type checked before any mutation. Unknown or invalid keys leave the current/LKG configuration active.

SCC controls activation time server-side. The client does not execute arbitrary code, write arbitrary paths, run SQL, delete data, or change restaurant transactional authority.
