# Inventory and Accounting Requirements Traceability

Status values:

- **Met:** implementation and relevant controls are present.
- **Partial:** a usable primitive exists, but contract or controls are incomplete.
- **Blocked:** implementation exists but a production-blocking defect is confirmed.
- **Deferred:** requirement is explicitly outside the implemented slice.
- **Policy required:** implementation cannot be accepted until business/accounting policy is approved.

## Inventory and recipes

| Requirement | Implementation | Tests | Status | Gap / finding |
| --- | --- | --- | --- | --- |
| FR-100 inventory item catalog | Items, units, locations, supplier primitives | Foundation CRUD/isolation coverage | Partial | No Admin UI; tenant DB invariants and audit incomplete (IA-004, IA-018) |
| Unit conversion | Direct positive conversion | Exact conversion and invalid-unit tests | Partial | No contradictory reciprocal-factor policy |
| Movement-derived balance | Append-only movement ledger and aggregate balance queries | Derivation, idempotency, concurrency tests | Met with conditions | Generic issue/adjustment are not journaled (IA-002) |
| Negative-stock prevention | Per-item row lock and next-quantity check | Concurrent issues test | Met | No alternate negative-stock policy is configurable; current policy is hard block |
| FR-101 recipe per product | Versioned product/variant recipes | Snapshot, version, isolation tests | Partial | Re-activation defect and create race (IA-010, IA-019) |
| Durable completion consumption | Completion creates event and movement | Retry, duplicate completion, no-recipe tests | Blocked | No lease/stale recovery/worker (IA-007) |
| Recipe snapshot | Consumption event items snapshot recipe quantities | Recipe-change test | Met for product/variant | Modifier ingredient semantics absent (IA-017) |
| Cancellation/refund reversal | Explicit whole-order consumption reversal | Linked reversal test | Partial | No partial-refund/physical-return policy; not automatic |
| FR-102 waste | Waste movement with reason | Valuation test | Partial | No governed correction and incomplete audit (IA-016/018) |
| FR-103 stock count after approval | Direct count and adjustment | Difference/negative count tests | Blocked | No approval or location lock; zero-to-positive count fails (IA-008/009) |
| FR-104 low-stock alert/dashboard | Reorder level stored and returned by levels | No alert test | Deferred | No alert/dashboard or notification workflow |
| FR-105 suppliers and purchase orders | Supplier + purchase receipt | Receipt/valuation test | Deferred/Partial | Full Purchase Order lifecycle is not implemented |
| FR-106 transfers | Atomic out/in movements, branch authorization | Transfer valuation/isolation tests | Partial | No transfer correction workflow or explicit cross-branch approval policy |

## Valuation and COGS

| Requirement | Implementation | Tests | Status | Gap / finding |
| --- | --- | --- | --- | --- |
| Moving weighted average | Value/quantity aggregate with 4-decimal cost | Two-price receipt, waste, transfer | Blocked | Full-depletion rounding defect (IA-011) |
| Issues use cost snapshot | Movement records unit cost and total value | Waste/consumption assertions | Partial | Sub-cent values can disappear from GL (IA-003) |
| Transfer carries cost | Source average used for both legs | Atomic transfer test | Met | Needs correction/reversal path |
| Reversal uses original cost | Inventory reversal journal copies original journal; movement reversal uses linked value | Consumption reversal test | Partial | Only consumption has an operational reversal route |
| Valuation reconstructable | Quantity/value are movement sums | Balance queries/tests | Partial | 2-decimal GL reconciliation and residual policy absent |
| COGS from authoritative valuation | Consumption event maps stock value to COGS | Ledger inventory event test | Blocked | IA-003 and IA-011 break completeness |

## Financial event outbox

| Requirement | Implementation | Tests | Status | Gap / finding |
| --- | --- | --- | --- | --- |
| Atomic operational event creation | Payment/refund/cash/selected stock operations enqueue in transaction | Rollback and event capture tests | Blocked | Generic issue/adjustment omit events (IA-002) |
| Account-scoped idempotency | Unique `(account_id,idempotency_key)` | Dedup/key-reuse tests | Met | Event snapshot itself remains mutable (IA-012) |
| Claim concurrency | `FOR UPDATE SKIP LOCKED` claim helper | Concurrent claim test | Partial | Stale-worker final update race (IA-013) |
| Retry/dead state | attempts, next attempt, failed/dead | Retry/dead test | Partial | No backoff policy/operational worker |
| Stale recovery | Helper resets stale processing events | Direct helper test | Blocked operationally | Helper is not invoked by runtime (IA-006) |
| Payload snapshot/version | JSON payload + positive version | Source mutation test | Blocked | DB allows payload mutation (IA-012) |
| Production worker | None; operator endpoint only | None | Blocked | IA-006/IA-023 |

## Accounting ledger

| Requirement | Implementation | Tests | Status | Gap / finding |
| --- | --- | --- | --- | --- |
| Chart of accounts/mappings | System accounts and event mappings seeded for existing accounts | Mapping/post tests | Partial | No mapping management/provisioning path for future accounts |
| Debit equals credit | Deferred DB triggers and application drafts | Direct imbalance rejection | Met arithmetically | Semantic account correctness still depends on mapping/policy |
| Immutable posted journals | Update/delete triggers | Direct immutability test | Met |
| One journal per event | Unique financial-event FK | Replay test | Met |
| Corrections by reversal | Linked immutable reversal journal | One reversal/balance test | Partial | Concurrent duplicate reversal may surface as raw unique conflict |
| Period locking | Insert guard and reversal date check | Sequential lock tests | Blocked | Concurrent lock/post race (IA-005); overlapping periods allowed |
| Trial balance | Posted journal-line aggregation | Balance/isolation tests | Partial | No semantic mapping validation; all entries are implicitly posted |
| Tenant isolation | API account/branch filters and some composite FKs | Scope tests | Blocked at schema layer | IA-004 |

## Revenue, VAT, payments, and refunds

| Scenario | Current behavior | Status | Required decision / finding |
| --- | --- | --- | --- |
| Full payment | Debit tender asset; credit revenue and VAT | Policy required | Confirm recognition at payment rather than completion |
| Partial payments | Proportional allocation with final remainder based on prior journals | Blocked | Concurrent allocation loses VAT/revenue (IA-001) |
| Multiple partial payments | Sequential tests pass | Blocked | Multi-worker serialization absent |
| Multi-tender | Separate tender asset per method mapping | Partial | Supported methods are cash/card/wallet; SRS `Other` is absent |
| Overpayment | Existing payment integrity rejects it | Met | Existing P1 control retained |
| Full refund | Reverses original payment allocation | Partial | Confirm period/date policy and stock-return independence |
| Partial refund | Proportional reversal based on prior refund journals | Blocked | Same concurrency risk as payments; rounding policy needs approval |
| Refund in locked period | Reversal/post is blocked when entry date falls in lock | Partial | Concurrent lock race and UTC business date (IA-005/015) |
| Cancelled paid order | Payment/refund mechanisms exist separately | Policy required | Define mandatory refund/reversal orchestration |
| VAT included | Order totals expose VAT and payment allocation uses it | Policy required | Legal/finance approval and concurrent correctness needed |
| VAT excluded | No separate reviewed contract | Deferred/Policy required | Do not claim support |
| Discount/delivery/source fee | Included in gross order values; no separate accounting dimensions | Policy required | Approve revenue/contra-revenue/commission treatment |
| Tips | No reviewed support | Deferred |
| Unpaid order | No payment journal | Policy required | Align with payment-based revenue recognition policy |

## Purchasing, counts, and operational controls

| Requirement | Current implementation | Status |
| --- | --- | --- |
| Purchase receipt | Direct stock receipt with supplier/cost | Partial; no PO/invoice matching and no correction workflow |
| Purchase order | None | Deferred |
| Waste | Direct issue with reason | Partial |
| Stock count approval | None | Blocked |
| Location locking during count | None | Blocked/Policy required |
| Reorder alerts | Threshold only | Deferred |
| Supplier liability posting | Receipt maps inventory/AP immediately | Policy required |

## Backfill and reconciliation

| Requirement | Implementation | Tests | Status |
| --- | --- | --- | --- |
| Dry-run default | Yes | No-write preview test | Met |
| Explicit write mode | Boolean + NODE_ENV=test | Gate test | Blocked for use; DB identity not verified (IA-014) |
| Idempotent event creation | Existing event lookup/idempotency | Repeat test | Partial |
| Checkpoint/resume | None | None | Deferred |
| Missing mapping report | Yes | Report test | Met |
| Unbalanced report | Arithmetic totals | Report test | Partial |
| Inventory/GL reconciliation | Not complete | None | Deferred/Blocked before production backfill |

## Shift close-out and bridge

| Requirement | Implementation | Status | Gap |
| --- | --- | --- | --- |
| Shift report enqueue | API creates generic print job | Partial | No request idempotency; audit and enqueue are not one transaction |
| Claim/retry/dead/requeue | Existing generic print-job state machine | Generically supported | Shift-specific contract is not typed end to end |
| Device execution | Existing bridge can render lines/templates | Not operationally verified | No physical-printer evidence |
| Cash/card/wallet/opening/cash in/out/expected/actual/difference | Summary and receipt renderer | Partial | Refund treatment, unpaid counts, and shift/order scope need correction |
| Unsettled orders | Derived by cashier/time and order status/payment totals | Blocked for accuracy | Scope differs from payment `shift_id`; remaining amount has minor-unit conversion defect |
| Timezone/cutoff | Server runtime formatting | Policy required | Branch timezone absent |

## Security and permissions

| Role | Inventory | Accounting | Review result |
| --- | --- | --- | --- |
| owner/admin | Full via existing all-permissions model | Full | Expected |
| manager | view/manage | view only | Separation preserved; account-wide branch behavior remains inherited and documented |
| inventory clerk | view/manage | none | Expected |
| accountant | none | view/manage | Expected |
| cashier | none | none | Expected |

API permission checks are real middleware boundaries, not UI-only controls. Schema-level tenant consistency remains blocked by IA-004.

## Deferred requirements versus defects

The following are explicitly recorded as incomplete requirements rather than mislabeled code defects: full Purchase Orders, low-stock dashboard/alerts, production-grade backfill, physical printer validation, comprehensive modifier inventory semantics, and complete VAT/revenue policy approval. They become production blockers when the corresponding feature is enabled or claimed as complete.

## P0 Remediation Traceability Override

These rows supersede only the IA-001/IA-002/IA-003 status cells above. All other requirement statuses remain unchanged.

| Requirement | Remediated implementation | Verification | Current status |
| --- | --- | --- | --- |
| Concurrent partial and multi-tender allocation | Order-row serialization, deterministic payment allocation snapshots, allocation sequence and idempotency constraints, atomic financial event | PostgreSQL concurrent completion/overpayment/retry tests | **Met for P0 integrity**; policy approval remains separate |
| Every value movement has durable financial classification | All movement types enqueue in the stock transaction; generic issue is `pending_policy`; transfer is `non_posting`; reversal inherits source classification | Rollback, retry, movement-type, reversal, and scope tests | **Met at integrity boundary / Pending Policy** for generic issue mapping |
| No financially posted event without evidence | Database status guard requires journal or reconciliation evidence | Direct constraint test and full suite | **Met** |
| High-precision inventory-to-GL reconciliation | Four-decimal source, two-decimal journal, exact residual equation and read endpoint | 0.004/0.005/0.006, aggregate, branch, period, and retry tests | **Met for tracking / Pending Policy** for settlement |
| Reversal preserves original precision | Linked journal and residual reversal; exact negation validation | No-journal and journal-backed reversal tests | **Met** |
| Period close exposes residual exceptions | Close blocked on non-zero open residual; inserts blocked inside locked period | API and direct database tests | **Met for P0 guard**; IA-005 lock/post race remains P1 |

ADR-004 records residual accumulation as a provisional safety policy. It intentionally does not claim final approval of an automatic rounding-account posting.
