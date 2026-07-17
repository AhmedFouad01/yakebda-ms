# ADR-004: Inventory Sub-cent Residual Policy

## Status

Provisional safety policy. Final accounting approval is required before production rollout.

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
