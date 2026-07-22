# Error Reporting

Unexpected API errors are reported fire-and-forget after YAKEBDA has selected its normal HTTP response. Reporting failures are swallowed to prevent recursion and operational impact.

The SDK redacts sensitive keys and embedded bearer/token/password patterns, limits strings, arrays, object fields, and queue size, and emits only type, controlled code, message, safe stack, severity, subsystem, timestamps, and installation metadata.

The real pilot created the `PilotProbe: YAKEBDA_PILOT_PROBE` error group, verified prohibited values were absent, and produced the expected P1 support ticket and audit evidence in SCC.
