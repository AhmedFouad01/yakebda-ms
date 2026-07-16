# Inventory and Accounting Audit Ledger

Audit scope: implementation commits between `782024d595e01c41e67fe3d0971f0fd6689775cc` and `0bf0bf0f36f86f4358c25c9e93d9065187d1a625`.

This ledger records review findings only. It does not modify runtime behavior. Reproductions used the isolated local databases `ykms_inventory_review` and `ykms_inventory_review_tests`.

## Severity summary

| Severity | Count | Production blockers |
| --- | ---: | ---: |
| P0 | 3 | 3 |
| P1 | 13 | 13 (some conditional on enabling the affected workflow) |
| P2 | 5 | 0 |
| P3 | 4 | 1 |

## IA-001 - Concurrent payment allocation can lose VAT

- **Severity:** P0
- **Classification:** Financial integrity defect; concurrency defect
- **Domain:** Payments, VAT, journals
- **Evidence:** `apps/api/src/modules/accountingLedger.ts:98-138` derives each payment's revenue/VAT allocation from previously committed journals. `postClaimedFinancialEvent` locks only the individual event at lines 242-245, not the order allocation aggregate.
- **Reproduction:** A review-database order with total `0.03` and VAT `0.01` was paid by three `0.01` payments. Three workers posted the events concurrently. Result: gross minor `3`, revenue minor `3`, VAT minor `0`; expected VAT minor `1`.
- **Impact:** Balanced journals can contain the wrong revenue/VAT split. Concurrent refunds have the same allocation pattern and risk.
- **Root cause:** Read-compute-write allocation is not serialized by order or original payment.
- **Required fix:** Serialize allocation with an order-scoped lock or a durable allocation row, and make payment/refund allocation atomic under concurrent workers.
- **Required tests:** Multi-worker simultaneous partial payments and simultaneous partial refunds with final remainder absorption.
- **Migration impact:** Possibly a lock/allocation table or advisory-lock policy; no decision should be made without a concurrency design.
- **Backward compatibility:** Existing journals require reconciliation and possibly reversal/reposting, not mutation.
- **Production blocker:** Yes.
- **Confidence:** High; reproduced against PostgreSQL.

## IA-002 - Generic stock issue and adjustment bypass accounting events

- **Severity:** P0
- **Classification:** Financial integrity defect
- **Domain:** Inventory ledger, financial outbox
- **Evidence:** `apps/api/src/modules/inventory.ts:12-24,159-193` exposes `issue` and `adjustment`. `apps/api/src/modules/inventoryService.ts:169-186` maps receipt, waste, count adjustment, consumption, and reversal, but not generic issue or adjustment.
- **Reproduction:** Review-database receipt created one financial event; subsequent generic issue and adjustment created zero financial events.
- **Impact:** Stock value changes without a matching financial event or journal, producing inventory/GL divergence.
- **Root cause:** Public movement types exceed the outbox event mapping.
- **Required fix:** Either prohibit direct value-changing movement types or map every authorized value-changing operation to a policy-approved financial event atomically.
- **Required tests:** Event existence and exactly-once journal posting for every public movement type, including reversals.
- **Migration impact:** Historical reconciliation/backfill may be required.
- **Backward compatibility:** Preserve movement records; repair through events and journals, never by editing posted rows.
- **Production blocker:** Yes.
- **Confidence:** High; reproduced.

## IA-003 - Sub-cent inventory value is silently posted without a journal

- **Severity:** P0
- **Classification:** Financial integrity defect
- **Domain:** Valuation, outbox, journals
- **Evidence:** `apps/api/src/modules/accountingLedger.ts:188-206` converts 4-decimal inventory value to 2-decimal minor units and returns `null` when rounded gross is zero. Lines 252-255 then mark the event `posted` with no journal.
- **Reproduction:** A receipt with `total_value=0.0049` produced a posted financial event, `journalEntryId=null`, and zero journal rows.
- **Impact:** Repeated fractional-value movements can accumulate material stock value with no GL representation while appearing successfully posted.
- **Root cause:** Precision reduction is treated as a no-op success and no rounding accumulator or exception state exists.
- **Required fix:** Adopt an approved rounding-residual policy; never mark a financially relevant event posted without an auditable journal or explicit residual record.
- **Required tests:** Repeated sub-cent events, residual accumulation, reversal, and reconciliation.
- **Migration impact:** A residual account/accumulator or higher-precision journal policy may require schema/mapping changes.
- **Backward compatibility:** Existing posted-without-journal events need a reconciliation report and corrective posting path.
- **Production blocker:** Yes.
- **Confidence:** High; reproduced.

## IA-004 - Tenant relationships are not enforced consistently in the schema

- **Severity:** P1
- **Classification:** Security defect; migration defect
- **Domain:** Inventory and accounting schema
- **Evidence:** Migrations 021-025 store `account_id` beside independent foreign keys to branch, location, item, unit, source event, order, payment, and user, but most relationships are not composite tenant foreign keys. Only accounting mapping/line account relations use composite FKs.
- **Reproduction:** PostgreSQL accepted an inventory location with account A and a branch from account B; the transaction was rolled back after proof.
- **Impact:** A service bug, manual operation, or future code path can create cross-tenant relational corruption even when current routes usually scope lookups.
- **Root cause:** Tenant consistency relies on application checks rather than database invariants.
- **Required fix:** Add compatible composite unique keys/FKs or constrained triggers for tenant-bound relations, after cleaning any invalid existing data.
- **Required tests:** Direct DB and API cross-account relation rejection for every new table.
- **Migration impact:** Required; must be staged with preflight diagnostics.
- **Backward compatibility:** Validate existing rows before constraints are added.
- **Production blocker:** Yes until schema invariants cover financial and stock relations.
- **Confidence:** High.

## IA-005 - Period lock races with journal insertion

- **Severity:** P1
- **Classification:** Concurrency defect; financial integrity defect
- **Domain:** Accounting periods
- **Evidence:** `apps/api/src/db/migrations/20260716_025_accounting_ledger.ts:122-141` checks for a locked period only in a journal-entry insert trigger. Period creation and journal insertion do not share a serialization lock.
- **Reproduction:** Transaction A inserted a journal entry and paused. Transaction B committed a lock covering the entry date. Transaction A then inserted balanced lines and committed after the lock existed.
- **Impact:** Entries can be posted into a period that operators believe is locked.
- **Root cause:** Write skew between lock creation and posting transactions.
- **Required fix:** Serialize period locking and posting per account/date range, with overlap prevention.
- **Required tests:** Concurrent lock/post and lock/reversal races.
- **Migration impact:** Likely constraint/locking support and overlap exclusion.
- **Backward compatibility:** Existing locked-period entries need audit reporting.
- **Production blocker:** Yes.
- **Confidence:** High; reproduced.

## IA-006 - Financial outbox has no production-operational worker

- **Severity:** P1
- **Classification:** Missing operational component
- **Domain:** Financial outbox
- **Evidence:** The only processing entry point is operator-triggered `POST /accounting/events/process` in `apps/api/src/modules/accounting.ts:88-107`. `recoverStaleFinancialEvents` is referenced by tests but not scheduled by runtime code.
- **Reproduction:** Static route/call-site search found no worker, scheduler, service loop, or startup registration.
- **Impact:** Events remain pending or stuck unless an authorized operator manually invokes processing; accounting completeness is not operationally durable.
- **Root cause:** Claim/post helpers were implemented without an operational execution component.
- **Required fix:** Add a supervised worker with bounded claims, leases, backoff, stale recovery, metrics, and alerts.
- **Required tests:** Process restart, multiple workers, stale recovery, poison event/dead letter, and graceful shutdown.
- **Migration impact:** None necessarily.
- **Backward compatibility:** Operator endpoint may remain as a controlled recovery tool.
- **Production blocker:** Yes.
- **Confidence:** High.

## IA-007 - Consumption events can remain processing forever

- **Severity:** P1
- **Classification:** Concurrency defect; missing recovery
- **Domain:** Recipe consumption
- **Evidence:** `apps/api/src/modules/inventoryConsumption.ts:148-165` claims by setting `status=processing` but stores no worker identity or claim timestamp. Retry accepts only pending/failed and there is no stale-processing recovery.
- **Reproduction:** Static state-machine review; a crash after line 159 leaves the event outside all retry paths.
- **Impact:** Completed orders can permanently lack stock consumption unless repaired manually in the database.
- **Root cause:** Incomplete lease/recovery state machine.
- **Required fix:** Add durable claim ownership/lease, stale recovery, bounded retry/dead states, and a worker.
- **Required tests:** Crash after claim, stale recovery, concurrent processors, and exactly-once movement creation.
- **Migration impact:** Required fields/indexes likely needed.
- **Backward compatibility:** Existing processing rows require a safe recovery migration/tool.
- **Production blocker:** Yes.
- **Confidence:** High.

## IA-008 - Positive stock count from zero cannot be posted

- **Severity:** P1
- **Classification:** Confirmed code defect
- **Domain:** Stock count, valuation
- **Evidence:** `apps/api/src/modules/inventoryService.ts:267-324` computes an upward count adjustment but supplies no unit cost. Lines 128-136 require cost for the first incoming balance.
- **Reproduction:** Counted quantity `5` for a zero-balance item returned HTTP 422, `unit_cost required for first incoming balance`.
- **Impact:** A common opening-count workflow is impossible.
- **Root cause:** Stock count contract lacks a valuation source for positive zero-balance adjustments.
- **Required fix:** Define and validate an approved valuation input/policy for upward counts.
- **Required tests:** Zero-to-positive count, existing-positive count, and valuation/journal outcome.
- **Migration impact:** None if request-only; policy metadata may require schema.
- **Backward compatibility:** Additive request change if optional under existing balances.
- **Production blocker:** Yes for stock-count rollout.
- **Confidence:** High; reproduced.

## IA-009 - Stock counts bypass required approval and location locking

- **Severity:** P1
- **Classification:** Requirement intentionally deferred becoming a production blocker
- **Domain:** Stock counts
- **Evidence:** SRS FR-103 requires an approved difference before movement. `POST /inventory/stock-counts` immediately creates the adjustment; migration 023 has no lifecycle, approver, or location lock.
- **Reproduction:** Static route/schema review.
- **Impact:** One user can count and post stock differences while concurrent movements continue, undermining control and auditability.
- **Root cause:** Only a direct-post count primitive was implemented.
- **Required fix:** Implement draft/count/approve/post lifecycle, permission separation, location/concurrency policy, and audit.
- **Required tests:** Unapproved count cannot post, concurrent movement handling, approval separation, and retry/idempotency.
- **Migration impact:** Required.
- **Backward compatibility:** Existing count rows should be classified as already posted.
- **Production blocker:** Yes for SRS-compliant counts.
- **Confidence:** High.

## IA-010 - Re-activating the active recipe retires it

- **Severity:** P1
- **Classification:** Confirmed code defect
- **Domain:** Recipes
- **Evidence:** `apps/api/src/modules/inventoryRecipes.ts:99-113` retires the currently active recipe, then only activates the target if it is still draft.
- **Reproduction:** Create recipe -> activate -> activate same ID again returned 200 with status `retired`; active recipe count became zero.
- **Impact:** An idempotent operator retry can disable consumption for that product.
- **Root cause:** Activation is not idempotent and status transition order is unsafe.
- **Required fix:** Lock the recipe family and return active target unchanged, or atomically transition only when target is draft.
- **Required tests:** Repeated activation and concurrent activation of two versions.
- **Migration impact:** None.
- **Backward compatibility:** Preserve current IDs/versions.
- **Production blocker:** Yes for automated consumption reliability.
- **Confidence:** High; reproduced.

## IA-011 - Moving-average rounding can block full depletion

- **Severity:** P1
- **Classification:** Financial integrity defect; confirmed code defect
- **Domain:** Inventory valuation
- **Evidence:** `inventoryService.ts:114-139` derives a 4-decimal average and rejects when movement value exceeds the 4-decimal aggregate. Quantity uses 6 decimals while value/cost use 4.
- **Reproduction:** Receipts `0.100001 @ 6.3332` and `1.372848 @ 6.6665` yielded quantity `1.472849`, value `9.7854`; issuing the exact quantity computed `9.7855` and returned conflict.
- **Impact:** Legitimate full depletion may fail or leave nonzero residual value at zero quantity.
- **Root cause:** Independent rounding without a final-unit residual rule.
- **Required fix:** Define authoritative precision and make final depletion absorb the exact remaining ledger value.
- **Required tests:** Fractional full depletion, zero-quantity residual, reversal, and long sequences.
- **Migration impact:** Historical residual reconciliation may be needed.
- **Backward compatibility:** Do not rewrite movements; use corrective movements.
- **Production blocker:** Yes for fractional inventory.
- **Confidence:** High; reproduced.

## IA-012 - Financial-event snapshots are mutable in the database

- **Severity:** P1
- **Classification:** Financial integrity defect; migration defect
- **Domain:** Outbox
- **Evidence:** Migration 024 has no immutability trigger for source identity, payload, payload version, account, or branch after insert.
- **Reproduction:** Direct PostgreSQL update of `financial_events.payload` succeeded; transaction was rolled back.
- **Impact:** The supposedly durable posting source can be changed before or after posting, breaking traceability and deterministic replay.
- **Root cause:** Immutability is documented but not enforced.
- **Required fix:** Guard immutable columns and allow only explicit state-machine fields to change.
- **Required tests:** Direct DB update rejection and permitted state transitions.
- **Migration impact:** Required trigger/constraint.
- **Backward compatibility:** Validate current payloads first.
- **Production blocker:** Yes.
- **Confidence:** High.

## IA-013 - A stale worker can overwrite a reclaimed event

- **Severity:** P1
- **Classification:** Concurrency defect
- **Domain:** Financial outbox
- **Evidence:** `apps/api/src/modules/financialOutbox.ts:122-140` reads with worker/status predicates, then updates by `id` only. Stale recovery can clear/reclaim between those statements.
- **Reproduction:** Deterministic interleaving from source review: old worker reads; recovery marks failed; new worker claims; old worker updates by ID and clears the new claim.
- **Impact:** Lost claims, incorrect attempts/status, duplicate work, or stuck events.
- **Root cause:** Compare-and-set condition is not present on the final update.
- **Required fix:** Perform one conditional update or lock the row through status calculation/update.
- **Required tests:** Barrier-controlled old-worker/recovery/new-worker race.
- **Migration impact:** None.
- **Backward compatibility:** State-machine behavior only.
- **Production blocker:** Yes once multiple workers/stale recovery are enabled.
- **Confidence:** High.

## IA-014 - Backfill write gate does not verify database identity

- **Severity:** P1
- **Classification:** Security defect; operational safety defect
- **Domain:** Backfill
- **Evidence:** `apps/api/src/modules/accountingBackfill.ts:172-185` allows writes when `NODE_ENV=test` and an in-memory boolean are set. It does not inspect database name/URL/role or require a separate write-mode credential.
- **Reproduction:** Static gate review. Write mode was not executed against any non-review database.
- **Impact:** A production database can be mutated if the process is misconfigured as test and the confirmation flag is passed.
- **Root cause:** Environment label is treated as database identity.
- **Required fix:** Verify allowlisted disposable database identity and require explicit CLI write flag; default remains dry run.
- **Required tests:** Production-like URL rejection regardless of NODE_ENV and confirmation flag.
- **Migration impact:** None.
- **Backward compatibility:** CLI contract may become stricter.
- **Production blocker:** Yes for write-mode backfill.
- **Confidence:** High.

## IA-015 - Accounting date ignores branch timezone

- **Severity:** P1
- **Classification:** Financial integrity defect; policy decision required
- **Domain:** Journals, periods
- **Evidence:** `apps/api/src/modules/accountingLedger.ts:258` derives `entry_date` from UTC ISO date. Shift report rendering also uses server locale/timezone.
- **Reproduction:** Static analysis; an event near Cairo midnight can fall on a different local business date.
- **Impact:** Posting can land in the wrong accounting period and bypass or hit the wrong lock.
- **Root cause:** No approved business-date/timezone contract.
- **Required fix:** Approve account/branch business timezone and derive entry/shift dates consistently.
- **Required tests:** UTC/local midnight and DST-independent Cairo cases.
- **Migration impact:** Existing affected entries need reporting, not mutation.
- **Backward compatibility:** Policy migration required.
- **Production blocker:** Yes until accounting-date policy is approved.
- **Confidence:** High for mechanism; affected-row count unknown.

## IA-016 - Inventory correction and audit paths are incomplete

- **Severity:** P1
- **Classification:** Missing operational component
- **Domain:** Inventory operations
- **Evidence:** Only consumption has an explicit linked reversal route. Purchase receipts, waste, count adjustments, and transfers expose no governed correction/reversal workflow. Audit calls are concentrated in generic manual movement and selected accounting actions; master data and most operation routes lack explicit audit records.
- **Reproduction:** Route and `writeAudit` call-site inventory.
- **Impact:** Operators cannot correct errors through append-only governed actions, and important changes lack a consistent audit trail.
- **Root cause:** Foundation endpoints were shipped before complete operational controls.
- **Required fix:** Add permissioned, reasoned, idempotent reversal workflows and comprehensive audit events.
- **Required tests:** Every operation correction, authorization, linkage, financial reversal, and audit record.
- **Migration impact:** May require reversal metadata for counts/transfers and audit indexes.
- **Backward compatibility:** Append corrections only.
- **Production blocker:** Yes for production operation entry.
- **Confidence:** High.

## IA-017 - Modifier consumption and refund/restock policy are undefined

- **Severity:** P2
- **Classification:** Policy decision required
- **Domain:** Recipes, refunds
- **Evidence:** Consumption snapshots use order products/variants but do not derive ingredients from selected modifiers. Monetary refunds do not automatically restock; only explicit whole-order consumption reversal exists.
- **Reproduction:** Static schema/flow trace.
- **Impact:** Stock can be understated if modifiers consume ingredients, or overstated if refund/restock assumptions are wrong.
- **Root cause:** No approved contract for modifiers, partial refunds, or physical returns.
- **Required fix:** Approve policies before implementation; encode snapshots and proportional/line-level reversals accordingly.
- **Required tests:** Modifier ingredients, partial item refund, full return, no-restock refund, and duplicate reversal.
- **Migration impact:** Likely line-level consumption/refund references.
- **Backward compatibility:** Existing orders need explicit unsupported classification.
- **Production blocker:** Conditional: yes if modifier inventory or physical return is enabled.
- **Confidence:** High.

## IA-018 - Audit coverage is inconsistent

- **Severity:** P2
- **Classification:** Test gap; maintainability defect
- **Domain:** Security/audit
- **Evidence:** Locations, units, conversions, items, suppliers, recipes, purchase receipts, waste, transfers, stock counts, consumption retries, and financial-event retries do not all write explicit audit events.
- **Reproduction:** `writeAudit` call-site review.
- **Impact:** Operator attribution and incident reconstruction are incomplete.
- **Root cause:** Audit was added per route rather than by an operation contract.
- **Required fix:** Define an audit matrix and enforce it for every mutation/retry/reversal.
- **Required tests:** Audit action, actor, account/branch, entity, reason, and redaction.
- **Migration impact:** None unless audit schema needs new metadata.
- **Backward compatibility:** Additive.
- **Production blocker:** No by itself; contributes to operational blocker IA-016.
- **Confidence:** High.

## IA-019 - Recipe version creation is race-prone

- **Severity:** P2
- **Classification:** Concurrency defect
- **Domain:** Recipes
- **Evidence:** New version selection uses `max(version)+1` without locking the recipe family. The unique index catches collision as an error rather than providing deterministic retry.
- **Reproduction:** Static transaction review; repeated activation defect is separately reproduced in IA-010.
- **Impact:** Concurrent recipe creation can return an internal conflict and reduce operator reliability.
- **Root cause:** Optimistic version allocation has no retry/serialization contract.
- **Required fix:** Lock/advisory-lock the product/variant family or safely retry unique conflicts.
- **Required tests:** Concurrent create and concurrent activate.
- **Migration impact:** None necessarily.
- **Backward compatibility:** Preserve version numbering.
- **Production blocker:** No.
- **Confidence:** Medium-high.

## IA-020 - Green tests miss critical production interleavings

- **Severity:** P2
- **Classification:** Test gap
- **Domain:** Test suite
- **Evidence:** Ledger multi-tender processing is sequential, stale recovery calls the helper directly, snapshot tests mutate source rather than event payload, and several inventory suites rely on shared setup/state ordering. No test covers zero-to-positive count, repeated activation, full-depletion residual, period-lock race, or unjournaled generic movements.
- **Reproduction:** Review of seven feature test files and the successful 72-test focused run.
- **Impact:** The suite passes while P0/P1 defects remain reproducible.
- **Root cause:** Happy-path/API assertions dominate; database and multi-worker invariants are under-tested.
- **Required fix:** Add isolated tests with barriers/concurrent connections and direct DB invariant assertions.
- **Required tests:** All reproductions in IA-001 through IA-016.
- **Migration impact:** None.
- **Backward compatibility:** Test-only.
- **Production blocker:** No alone.
- **Confidence:** High.

## IA-021 - Permission migration rollback can delete pre-existing grants

- **Severity:** P2
- **Classification:** Migration defect
- **Domain:** Permissions
- **Evidence:** Migrations 021 and 024 insert permission keys with `onConflict().ignore()` but `down()` deletes all grants and permission rows for those keys, even if they pre-existed the migration.
- **Reproduction:** Static migration review.
- **Impact:** Rollback can remove independently existing grants.
- **Root cause:** Migration does not track ownership of seeded permission records.
- **Required fix:** Use migration-owned keys with preflight assumptions or preserve prior rows/grants.
- **Required tests:** Down against a database where keys/grants predate the migration.
- **Migration impact:** Correction migration/process; do not rewrite applied migration without release policy.
- **Backward compatibility:** Preserve existing grants.
- **Production blocker:** No if keys are proven new; otherwise elevate.
- **Confidence:** High.

## IA-022 - Collection endpoints are unbounded

- **Severity:** P3
- **Classification:** Scalability defect
- **Domain:** API
- **Evidence:** Inventory items, recipes, movements, levels, events, accounts, journals, and related lists often return full collections without cursor pagination.
- **Reproduction:** Route/query review.
- **Impact:** Latency and memory grow with operational history; journals/movements are especially exposed.
- **Root cause:** Foundation APIs were implemented without bounded collection contracts.
- **Required fix:** Add deterministic cursor pagination while preserving lookup-specific bounded endpoints.
- **Required tests:** Traversal, stable order, tenant scope, and consumer compatibility.
- **Migration impact:** Additional query indexes may be needed.
- **Backward compatibility:** Additive response metadata or versioned endpoints.
- **Production blocker:** No for small pilot data.
- **Confidence:** High.

## IA-023 - Outbox monitoring, retention, and alerting are absent

- **Severity:** P3
- **Classification:** Missing operational component
- **Domain:** Operations
- **Evidence:** No worker metrics, queue depth/age alerts, dead-letter dashboard, retention policy, or runbook was found.
- **Reproduction:** Runtime/docs review.
- **Impact:** Financial backlog or dead events may remain unnoticed.
- **Root cause:** Operationalization was deferred.
- **Required fix:** Metrics, alerts, retention, requeue audit, and operator runbook tied to the production worker.
- **Required tests:** Health/readiness behavior and monitoring signal tests.
- **Migration impact:** Optional retention/archive support.
- **Backward compatibility:** Additive.
- **Production blocker:** Yes together with IA-006.
- **Confidence:** High.

## IA-024 - Backfill batching and reconciliation are incomplete

- **Severity:** P3
- **Classification:** Missing operational component
- **Domain:** Backfill
- **Evidence:** The tool has no stable checkpoint/resume, applies a limit separately across source groups then slices, and rebuilds events from mutable current source rows. Reconciliation checks balance but does not prove inventory-to-GL completeness.
- **Reproduction:** `accountingBackfill.ts` query/control-flow review and 4 passing tests.
- **Impact:** Large historical runs can starve source classes, drift across reruns, and miss semantic mismatches.
- **Root cause:** Test-gated preview was treated as a backfill foundation without production-grade batching.
- **Required fix:** Stable cursors/checkpoints, immutable source snapshot rules, source-class totals, inventory/GL reconciliation, and resumable reports.
- **Required tests:** Resume, mutation between pages, mixed source classes, and repeated dry-run parity.
- **Migration impact:** Optional checkpoint table.
- **Backward compatibility:** Dry-run output can be versioned.
- **Production blocker:** No while write mode remains prohibited.
- **Confidence:** High.

## IA-025 - Documentation overstates completion and readiness

- **Severity:** P3
- **Classification:** Documentation drift
- **Domain:** Engineering documentation
- **Evidence:** Execution reports call several phases complete/validated while no production worker exists, counts lack approval, purchase orders and low-stock alerts are absent, and reproduced financial defects are not recorded.
- **Reproduction:** Cross-check of `INVENTORY_ACCOUNTING_EXECUTION_STATUS.md`, `OVERNIGHT_EXECUTION_REPORT.md`, SRS, and runtime code.
- **Impact:** Reviewers may approve production use based on test counts rather than actual controls.
- **Root cause:** Milestone completion was equated with implementation/test completion, not production readiness.
- **Required fix:** Distinguish implemented primitives, deferred requirements, policy approvals, operational readiness, and production blockers.
- **Required tests:** Not applicable; require documentation review gates.
- **Migration impact:** None.
- **Backward compatibility:** None.
- **Production blocker:** No, but must be corrected before release approval.
- **Confidence:** High.

## False positives and accepted controls

- Stock balances are derived from append-only movements; posted movement update/delete is blocked by a database trigger.
- Transfers create source and destination movements in one transaction and carry the source average cost.
- Financial-event idempotency and one-journal-per-event uniqueness exist.
- Journals and journal lines are immutable after posting, and transaction-deferred balance checks exist.
- Owner/admin/manager/inventory-clerk/accountant grants keep inventory and accounting roles separated; UI visibility is not used as the security boundary.
- The shift-report payload can traverse the generic print-job bridge. This is **generically supported**, not physical-printer validated or fully typed end to end.
- Full Purchase Orders, low-stock alerts, and policy-complete modifier/refund stock handling are incomplete requirements, not hidden implementation defects.
