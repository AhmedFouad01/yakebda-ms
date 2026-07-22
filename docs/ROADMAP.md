<div dir="rtl" align="right">

# ROADMAP — YAKEBDA_MS

## Completed / Existing

- `YKMS-01` — Foundation
- `YKMS-01H` — Windows / Hardware Foundation
- `YKMS-01-CLEANUP` — Rebrand + security hardening
- `YKMS-02` — MVP artifact: menu/POS/KDS/orders/tables/customers/reports

## Current Correction

- `YKMS-02B` — Operational POS Core refinement

Required flow:

```text
Open Shift → POS Order → Kitchen → Payment → Receipt → Reports → Close Shift
```

## Next

- `YKMS-03` — Shifts & Cash hardening
- `YKMS-04` — Kitchen/KDS advanced operations
- `YKMS-05` — Inventory / recipes / stock movement
- `YKMS-06` — Reports / accounting foundations
- `YKMS-07` — Online / QR ordering
- `YKMS-08` — Delivery workflow
- `YKMS-09` — Loyalty / CRM
- `YKMS-10` — Public API / integrations

## Engineering Remediation Track

- `SCC-PILOT-01` - first real SCC product integration with YAKEBDA_MS: 92%
  complete and validated for controlled internal pilot on
  `feat/scc-client-sdk-pilot`. Production key custody and Windows installer
  hardening remain before restaurant production rollout. Arena Hub follows
  only after this pilot evidence is accepted.

- `P0` - payment, authentication, and read-permission hardening: completed.
- `P1` - operational reliability, refunds, print claiming, and shift variance:
  completed. Refund behavior is active and tested, not a no-op flag.
- `P2` - CSS consolidation, POS decomposition, and frontend safety net:
  completed and merged.
- `P3` - observability, cursor pagination, Node 22, shared contracts, and
  documentation truth: release candidate completed on its feature branch,
  pending Draft PR CI/merge review.

### Naming debt

`YKMS-02H` is the historical repository milestone for order sources and price
lists. `YKMS-11` is treated as an external planning alias for that same scope,
not as a second implementation. Historical branches, commits, migrations, PRs,
and milestone entries are intentionally not renamed.

</div>
