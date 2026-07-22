# Licensing

The client caches an SCC EdDSA-signed grant, verifies its signature locally, and binds it to both device and Restaurant product IDs. States are `Valid`, `ValidOffline`, `GracePeriod`, `Expired`, and `Invalid`.

Online refresh updates the cached grant. When SCC is unavailable, YAKEBDA validates the cached grant without a network dependency. Valid and grace windows are bounded by `offlineUntil`; signature tampering, wrong device, wrong product, and expiry fail closed for the SCC entitlement decision. A grace or invalid state appears as an internal warning in diagnostics but does not corrupt local restaurant data.

Pilot evidence covers online issue/refresh, valid offline, grace, expiry, and tampered grant rejection.
