# Health and Telemetry

Allowlisted heartbeat fields are database reachability, printer posture, free storage MB, kitchen/sync backlog count, failed print-job count, application version, and SDK version. Customer, order, payment, credentials, connection strings, and business payloads are prohibited.

Health is `unhealthy` when the database probe fails, `degraded` for failed print jobs or low storage, otherwise `healthy`. Heartbeats are background best-effort work. Events are bounded, sanitized, retried with exponential backoff and jitter, and flushed after reconnection.

Pilot observations: manual heartbeat API duration 87.6 ms, zero pending events after successful delivery, 15 outage events bounded to the configured test limit of 10, and one queued event recovered in one flush after reconnection. Formal long-duration memory and throughput profiling remains a production-readiness activity.
