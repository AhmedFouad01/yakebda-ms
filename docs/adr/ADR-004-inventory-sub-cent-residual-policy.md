# ADR-004: Inventory Sub-cent Residual Policy

## Status

**Approved — policy framework (revision 2026-07-21, ACC-FULL-01).** The accountant approved the accounting-policy proposals (approval attested by the product owner, dated 2026-07-20, recorded in `YAKEBDA_MS_ACCOUNTING_MODULE_EXECUTION_PLAN__SINGLE_DELIVERY__v1_0__2026-07-20`). The concrete policy values below remain `PENDING VALUE` until their written values are supplied; per the plan's strict rule, no value is invented and each pending item keeps a safe (deferred/blocked) behavior. This ADR does not claim statutory or production accounting readiness.

## Approval register (plan §2)

| # | Item | Approved value |
|---|---|---|
| 1 | Residual settlement — timing and mechanism | `PENDING VALUE` — safe behavior: settlement runs only via explicit `accounting.manage` request; no automatic settlement at period close |
| 2 | Rounding account mapping | `PENDING VALUE` — safe behavior: no rounding account is seeded; settlement is blocked (422, Arabic message) until a rounding mapping is explicitly configured |
| 3 | Materiality threshold | `PENDING VALUE` — safe behavior: no threshold applied; every non-zero residual is surfaced, none auto-dismissed |
| 4 | Period/date policy for settlement recognition | `PENDING VALUE` — safe behavior: settlement entry uses the explicit request date, rejected inside locked periods by the DB guard |
| 5 | Revenue recognition | `PENDING VALUE` — existing pilot behavior retained as-is |
| 6 | VAT treatment | `PENDING VALUE` — existing pilot behavior retained as-is |
| 7 | Source fees/commissions mapping | `PENDING VALUE` — no new mappings invented |
| 8 | Generic issue mapping | `PENDING VALUE` — safe behavior: events remain `pending_policy` (existing `generic_issue_policy_required` classification) |
| 9 | Timezone/operational-day policy | `PENDING VALUE` — existing pilot behavior retained as-is |
| — | Approval evidence format | Accountant name + date + reference: `PENDING VALUE` (product-owner attestation only, 2026-07-20) |

## Context

Inventory valuation is authoritative at four decimal places while journals are denominated at two decimal places. Rounding each inventory event directly to currency precision can silently discard value or mark an event posted without a journal.

## Decision

- Preserve every inventory financial event at four-decimal source precision.
- Round the journal amount to two decimals using the existing deterministic half-up decimal helper.
- Record the exact difference in `financial_event_reconciliations` so that:

  `source amount = journal amount + residual amount`

- Keep residuals as an account- and branch-scoped accumulation ledger. P0 does not automatically post the accumulated balance to a rounding account.
- Classify a non-zero event whose journal amount rounds to zero as `deferred_rounding`, never `posted`.
- Link reversals to the original reconciliation and negate its source, journal, and residual amounts exactly.
- Block period locking while a non-zero open residual balance exists, and block new residual evidence inside an already locked period.

## Consequences

- No sub-cent value is discarded silently.
- Operators can inspect residuals through the accounting reconciliation read endpoint.
- Period close requires an explicit future reconciliation policy and approved mapping before the residual balance can be settled.
- Automatic residual aggregation or a rounding-account journal remains a policy decision, not an implicit implementation assumption.
