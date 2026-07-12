# Runtime Reliability Audit

Status: in progress

## Confirmed issues

- Unauthorized API responses did not expire the browser session or return the operator to login.
- KDS settings were captured through a stale render-local object, so sound alerts were unreliable.
- `kds_enabled` was loaded but did not stop KDS operation.
- `kds_hide_ready_after_minutes` was loaded but not applied.
- POS order-history detail loading did not expose loading or error state.
- POS branch/customer bootstrap repeated more requests than necessary when the selected branch changed.
- `auto_print_on_payment` was not applied when payment was captured inside order creation.

## Fix order

1. Session expiry and 401 handling.
2. KDS settings, polling, sound unlock, and ready-order expiry.
3. Auto-print parity for create-with-payment.
4. POS history and bootstrap request reliability.
5. Dependency vulnerability assessment without forced breaking upgrades.

All source changes require API tests and the Admin production build before merge.
