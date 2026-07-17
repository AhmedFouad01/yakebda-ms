# Inventory and Accounting Comprehensive Audit Report

## 1. Executive verdict

**Final decision: BLOCKED.**

The implementation establishes substantial, useful foundations: append-only stock movements, versioned recipe snapshots, durable event tables, balanced immutable journals, account/branch middleware, isolated tests, and a generic print bridge. All existing automated gates pass. Those facts are not sufficient for production approval.

Three independently reproduced P0 financial-integrity defects can produce incorrect or missing accounting while records appear posted:

1. Concurrent partial payments can lose VAT allocation.
2. Generic stock issues/adjustments can change stock value without financial events.
3. Sub-cent stock values can mark events posted with no journal.

Confirmed P1 blockers also include the period-lock race, missing production worker, unrecoverable processing consumption events, weak schema tenant invariants, count-control gaps, valuation rounding failure, and unsafe backfill database identification.

Decision dimensions:

| Dimension | Verdict |
| --- | --- |
| Code correctness | BLOCKED by P0/P1 defects |
| Financial policy approval | NOT APPROVED; material policies remain undecided |
| Operational worker readiness | BLOCKED; no production outbox/consumption worker |
| Migration execution | PASS mechanically; BLOCKED on invariants/safety |
| Hardware validation | NOT VERIFIED |
| Production readiness | BLOCKED |

## 2. Scope and exact identity

- Implementation repository: YAKEBDA MS
- Base: `782024d595e01c41e67fe3d0971f0fd6689775cc`
- Implementation head reviewed: `0bf0bf0f36f86f4358c25c9e93d9065187d1a625`
- Implementation branch: `feature/inventory-accounting-v2`
- Review branch: `audit/inventory-accounting-v2-review`
- Implementation commits: 31
- Changed files: 38
- Implementation worktree was clean and was not modified.
- Audit work used separate worktree and isolated PostgreSQL databases.
- No push, PR, merge, rebase, or application-code edit occurred during review.

Sources read: repository instructions, current implementation reports, P3 final report, ADR-003, Inventory/Recipes SRS, Finance Control and Accounting Bridge/Profitability SRS sections, movement/consumption/reversal diagrams, posting/backfill flows, all 31 commits, all changed production/test/docs files, and actual PostgreSQL schema metadata.

## 3. Commit review

Legend: `M` migration impact, `R` runtime, `T` tests, `D` docs. Dependencies identify the later layer needed for usefulness, not a defect by itself.

| Commit | Purpose and files | Impact | Coverage/dependency | Review |
| --- | --- | --- | --- | --- |
| `cc06db6` | Inventory/accounting revalidation docs | D | Foundation plan | Matches scope; later completion claims need qualification |
| `702b5ba` | Formatting correction | D | `cc06db6` | Matches message |
| `7d6e872` | Migration 021 stock foundation | M | Service/tests later | Core schema useful; IA-004/021 |
| `83ccf41` | Stock service/routes/math | R | Migration 021 | Scope matches; IA-002/011/016 |
| `0681637` | Foundation tests | T | 021/service | Useful isolation/concurrency; misses GL event coverage |
| `59a5a20` | Foundation validation docs | D | Prior three | Overstates production control |
| `bfc5bf0` | Migration 022 recipes/events | M | Workflow later | Scope matches; lease/immutability gaps |
| `027dbe7` | Consumption workflow/order hooks | R | 022 | Useful snapshots; IA-007 |
| `93cb27a` | Consumption/reversal tests | T | Workflow | Good happy/retry paths; misses crash recovery/modifiers |
| `1d4b3b4` | Consumption validation docs | D | Prior three | Operational durability overstated |
| `cdc51b6` | Migration 023 counts | M | Operations later | Name matches; approval lifecycle absent |
| `0b853d1` | Receipts/waste/transfers/counts | R | 021/023 | Scope matches; IA-008/009/016 |
| `1bb74a6` | Operations/valuation tests | T | Operations | Useful valuation paths; misses rounding residual |
| `12c190f` | Operations validation docs | D | Prior three | Completion overstatement |
| `4363b94` | Migration 024 outbox | M | Service/hooks later | Core schema useful; IA-004/012/021 |
| `4055f4f` | Claim/recovery service | R | 024 | Helper works in tests; IA-006/013 |
| `d622fc2` | Atomic event hooks | R | Outbox | Good for mapped operations; generic gap IA-002 |
| `80d291c` | Outbox tests | T | Service/hooks | Claims/retry covered; no real worker/old-worker race |
| `2322bf4` | Outbox validation docs | D | Prior four | Operational readiness overstated |
| `c1997f6` | Migration 025 ledger | M | Posting/routes later | Strong balance/immutability; IA-004/005 |
| `d169f50` | Event-to-journal posting | R | 024/025 | Core mappings work; IA-001/003/015 |
| `15252b5` | Accounting routes | R | Posting | Scoped API; manual processor only |
| `27a43a4` | Ledger tests | T | Posting/routes | Good arithmetic/immutability; concurrency blind spot |
| `f6904b2` | Ledger validation docs | D | Prior four | Does not distinguish semantic from arithmetic correctness |
| `ae9b923` | Dry-run/backfill tool | R | Outbox/ledger | Defaults safe; IA-014/024 |
| `a455d65` | Backfill tests | T | Tool | Gate/idempotency covered; DB identity not covered |
| `70cc4ab` | Backfill validation docs | D | Tool/tests | Production use should remain prohibited |
| `bd10746` | Shift report enqueue/rendering | R | Existing print bridge | Generic bridge integration; IA-015 and report defects |
| `14feb05` | Shift report tests | T | Existing bridge | Lifecycle tests pass; no physical device/accuracy matrix |
| `3e4cf53` | Shift bridge audit docs | D | Prior two | Correctly notes generic bridge, but remaining gaps need stronger status |
| `0bf0bf0` | Final execution report | D | Entire stack | Message matches file; readiness claims are superseded by this audit |

No commit contained unrelated Admin CSS/UI polish, dependency upgrades, credentials, dumps, screenshots, or temporary automation. Commit messages generally match implementation; drift is concentrated in validation/readiness wording.

## 4. Change inventory

| File/group | Domain | Change | API/schema/financial/security impact | Coverage / findings |
| --- | --- | --- | --- | --- |
| `apps/api/package.json` | Tooling | Backfill script | Internal CLI | Backfill tests; IA-014/024 |
| `src/app.ts` | API composition | Registers new routers | New public endpoints | Full suite |
| `src/db/knex.ts` | Migrations | Registers 021-025 | Schema | Migration audit |
| migrations 021-025 | DB | 17 tables, triggers, indexes, grants | High | IA-004/005/009/012/021 |
| `src/db/seedData.ts` | RBAC | Inventory/accounting roles/grants | Security | Role matrix accepted |
| `lib/inventoryMath.ts` | Inventory | Decimal conversion/value math | Financial | IA-011 |
| `lib/accountingMath.ts` | Accounting | Minor-unit/VAT allocation | Financial | IA-001/003 |
| `lib/receipt.ts` | Printing | Shift report rendering | Operational | IA-015/shift gaps |
| `modules/inventory.ts` | Inventory API | CRUD/movements/operations | Public API/stock | IA-002/008/009/016/022 |
| `modules/inventoryService.ts` | Inventory core | Movement/transfer/count/valuation | Stock/financial | IA-002/008/011 |
| `modules/inventoryRecipes.ts` | Recipe API | CRUD/activate/retry/reversal | Stock | IA-010/019 |
| `modules/inventoryConsumption.ts` | Consumption | Snapshot/process/reverse | Stock/order lifecycle | IA-007/017 |
| `modules/orderStatus.ts` | Orders | Completion integration | Stock | Consumption tests |
| `modules/orders.ts` | Orders | Completion/payment context hooks | Operational/financial | Existing tests + consumption |
| `modules/orderPricing.ts` | Pricing | Financial snapshot fields | Financial | Payment tests |
| `modules/financialOutbox.ts` | Outbox | Enqueue/claim/fail/recover | Financial | IA-006/012/013 |
| `modules/financialEvents.ts` | Outbox API | Read/retry | Public API/security | IA-018/022 |
| `modules/financialReliability.ts` | Payments/refunds | Atomic event hooks | Financial | Payment/refund suites |
| `modules/accountingLedger.ts` | Accounting core | Draft/post/reverse/mappings | Critical financial | IA-001/003/005/015 |
| `modules/accounting.ts` | Accounting API | Accounts/journals/trial/process/lock/reverse | Public API/security | IA-006/022 |
| `modules/accountingBackfill.ts` | Recovery | Preview/apply/report | Financial operations | IA-014/024 |
| `tools/accountingBackfill.ts` | CLI | Backfill entry point | Operational | IA-014 |
| `modules/shifts.ts` | Shift close | Summary/report enqueue | Financial/print | IA-015 and shift accuracy gaps |
| `modules/branches.ts` | Branch lifecycle | Inventory location support | Scope | Full suite |
| Seven new test files | Tests | 42 feature tests | Safety evidence | IA-020 |
| ADR/status/reports | Docs | Architecture/execution claims | Governance | IA-025 |

Every one of the 38 changed files is represented by the groups above; no unrelated or accidental file was found.

Detailed file inventory (`-` means no direct impact):

| File | Domain / change | Public API | Schema | Financial | Inventory | Security | Test coverage | Finding IDs |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `apps/api/package.json` | Backfill CLI script | Internal | - | Medium | - | Low | Backfill | IA-014/024 |
| `apps/api/src/app.ts` | Router registration | Yes | - | High | High | Medium | Full API | - |
| `apps/api/src/db/knex.ts` | Migration registry | - | High | High | High | Medium | Migration run | - |
| `apps/api/src/db/migrations/20260716_021_inventory_foundation.ts` | Inventory foundation | - | High | Medium | High | High | Foundation/migration | IA-004/021 |
| `apps/api/src/db/migrations/20260716_022_inventory_recipes_consumption.ts` | Recipe/event schema | - | High | Medium | High | High | Recipe/migration | IA-004/007/012 |
| `apps/api/src/db/migrations/20260716_023_inventory_operations.ts` | Count schema/reversal index | - | High | Medium | High | Medium | Operations/migration | IA-004/009 |
| `apps/api/src/db/migrations/20260716_024_financial_event_outbox.ts` | Outbox schema/grants | - | High | High | Medium | High | Outbox/migration | IA-004/012/021 |
| `apps/api/src/db/migrations/20260716_025_accounting_ledger.ts` | Ledger schema/triggers | - | High | High | - | High | Ledger/migration | IA-004/005 |
| `apps/api/src/db/seedData.ts` | Role permissions | - | - | Medium | Medium | High | Full/security | - |
| `apps/api/src/lib/accountingMath.ts` | VAT/minor-unit allocation | Internal | - | High | - | - | Ledger | IA-001/003 |
| `apps/api/src/lib/inventoryMath.ts` | Exact decimal/valuation math | Internal | - | High | High | - | Inventory tests | IA-011 |
| `apps/api/src/lib/receipt.ts` | Shift print renderer | Print contract | - | Medium | - | Low | Shift report | IA-015 |
| `apps/api/src/modules/accounting.ts` | Accounting routes | Yes | - | High | - | High | Ledger/security | IA-006/022 |
| `apps/api/src/modules/accountingBackfill.ts` | Preview/apply/reconcile | Internal/CLI | - | High | Medium | High | Backfill | IA-014/024 |
| `apps/api/src/modules/accountingLedger.ts` | Posting/reversal/default mappings | Internal | - | Critical | Medium | High | Ledger | IA-001/003/005/015 |
| `apps/api/src/modules/branches.ts` | Branch/default location support | Existing | - | - | Medium | Medium | Full API | IA-004 |
| `apps/api/src/modules/financialEvents.ts` | Event read/retry API | Yes | - | High | Medium | High | Outbox/security | IA-018/022 |
| `apps/api/src/modules/financialOutbox.ts` | Event state machine | Internal | - | Critical | Medium | High | Outbox | IA-006/012/013 |
| `apps/api/src/modules/financialReliability.ts` | Payment/refund/cash hooks | Existing | - | Critical | - | Medium | Payment/refund/outbox | IA-001 |
| `apps/api/src/modules/inventory.ts` | Inventory public API | Yes | - | High | Critical | High | Inventory suites | IA-002/008/009/016/018/022 |
| `apps/api/src/modules/inventoryConsumption.ts` | Consumption processing/reversal | Internal | - | High | Critical | Medium | Recipe tests | IA-007/017 |
| `apps/api/src/modules/inventoryRecipes.ts` | Recipe/retry/reversal API | Yes | - | Medium | High | High | Recipe tests | IA-010/018/019/022 |
| `apps/api/src/modules/inventoryService.ts` | Movement/transfer/count service | Internal | - | Critical | Critical | High | Inventory suites | IA-002/008/011/016 |
| `apps/api/src/modules/orderPricing.ts` | Financial snapshot fields | Existing | - | High | - | - | Payment/order | IA-001 |
| `apps/api/src/modules/orderStatus.ts` | Completion/consumption hook | Internal | - | Medium | High | Medium | Recipe tests | IA-007/017 |
| `apps/api/src/modules/orders.ts` | Order lifecycle integration | Existing | - | High | High | High | Full/order/recipe | IA-007/017 |
| `apps/api/src/modules/shifts.ts` | Shift close/report enqueue | Existing | - | High | - | High | Shift/refund | IA-015 |
| `apps/api/src/tools/accountingBackfill.ts` | CLI entry point | CLI | - | High | Medium | High | Backfill | IA-014/024 |
| `apps/api/tests/accounting-backfill.test.ts` | Backfill tests | - | - | Test | - | Test | 4 tests | IA-014/020/024 |
| `apps/api/tests/accounting-ledger.test.ts` | Posting/lock tests | - | - | Test | - | Test | 8 tests | IA-001/005/020 |
| `apps/api/tests/financial-outbox.test.ts` | Outbox tests | - | - | Test | Test | Test | 6 tests | IA-006/012/013/020 |
| `apps/api/tests/inventory-foundation.test.ts` | Foundation tests | - | - | Test | Test | Test | 7 tests | IA-002/004/020 |
| `apps/api/tests/inventory-operations-valuation.test.ts` | Operations tests | - | - | Test | Test | Test | 6 tests | IA-008/009/011/020 |
| `apps/api/tests/inventory-recipes-consumption.test.ts` | Recipe/consumption tests | - | - | Test | Test | Test | 7 tests | IA-007/010/017/019/020 |
| `apps/api/tests/shift-report.test.ts` | Print lifecycle tests | - | - | Test | - | Test | 4 tests | IA-015/020 |
| `docs/adr/ADR-003-sequencing-inventory-drivers-finance.md` | Architecture sequence | - | - | Governance | Governance | Governance | Review only | IA-025 |
| `docs/engineering/INVENTORY_ACCOUNTING_EXECUTION_STATUS.md` | Execution status | - | - | Governance | Governance | Governance | Review only | IA-025 |
| `docs/engineering/OVERNIGHT_EXECUTION_REPORT.md` | Final local run report | - | - | Governance | Governance | Governance | Review only | IA-025 |

## 5. Architecture review

The intended order from ADR-003 is visible: stock ledger -> recipes/consumption -> valuation -> outbox -> journals -> reconciliation. The separation between inventory owner records and derived accounting projections is sound. Atomic transaction boundaries are present for mapped operational events.

The architecture is incomplete at the reliability edges:

- durable tables exist without production workers;
- schema tenant invariants are weaker than API scoping;
- precision contracts diverge between inventory (4 decimal value) and journals (2 decimal value);
- count and correction workflows lack approval/state machines;
- financial allocation depends on query-time prior journals without per-order serialization.

## 6. Security review

Positive controls:

- Routes use authenticated `requirePermission` middleware.
- Inventory clerk and accountant permissions are separate.
- Manager has inventory manage and accounting view, not accounting manage.
- Branch-bound inventory/accounting API tests pass; cross-account route lookups are rejected.
- No secrets or production credentials were found in the branch. Test-only credentials/tokens remain under tests.

Blockers:

- Database tenant relationships allow contradictory account/branch/object ownership (IA-004).
- Backfill write guard trusts environment labels rather than DB identity (IA-014).
- Audit coverage is incomplete for sensitive mutations (IA-018).

## 7. Inventory integrity

Append-only stock movements and derived balances are good foundations. Negative stock is consistently blocked in the service, idempotency keys are account-scoped, and transfers are transactional. However, generic value-changing movements bypass accounting (IA-002), corrections are incomplete (IA-016), and counts cannot support opening stock or approval controls (IA-008/009).

Concurrency tests prove two concurrent issues do not oversell under the current service. They do not cover count-vs-movement, transfer-vs-count, or duplicate requests across all operation types.

## 8. Recipe and consumption review

Recipe item snapshots preserve the recipe used for an order, and duplicate completion is protected by event idempotency. No-recipe completion is explicitly recorded. The repeated activation defect can remove the active recipe (IA-010), processing events cannot recover after a crash (IA-007), and modifier/partial-refund semantics require policy (IA-017).

All order transitions to completed/cancelled/refunded were traced through routes and helpers. Completion integration is centralized through the new order-status helper where adopted, while stock reversal remains a separate explicit whole-order action rather than an automatic cancellation/refund contract.

## 9. Purchasing, transfers, waste, and counts

- **Purchase receipt:** implemented; full Purchase Order/invoice matching is not.
- **Transfers:** atomic source/destination movements with carried cost; no governed correction.
- **Waste:** reasoned movement; correction and audit controls incomplete.
- **Counts:** direct posting only; no approval, location lock, or opening-count valuation.

These must not be described collectively as a complete purchasing/count subsystem.

## 10. Valuation review

Independent examples confirmed weighted-average behavior for ordinary receipts/issues. Transfer value follows source average. Two precision defects block acceptance:

- exact full depletion can fail or leave a residual because quantity/value/cost scales round independently (IA-011);
- sub-cent movement value can disappear when converted to journal minor units (IA-003).

Backdated movements are neither explicitly supported nor explicitly prohibited by an approved policy. Valuation is rebuildable from movement sums only at inventory precision; it is not reconciled to the 2-decimal GL. COGS therefore cannot be accepted as authoritative yet.

## 11. Financial outbox review

Atomic event creation, idempotency, claim with `SKIP LOCKED`, attempts, and dead state are present. The component is not production-operational because there is no worker, stale recovery is not invoked, consumption uses a weaker state machine, event snapshots are mutable, and a stale worker can overwrite a reclaimed claim (IA-006/007/012/013/023).

Worker classification: **Missing (operator-triggered helper/API only)**.

## 12. Accounting integrity

Journal arithmetic is strongly protected: each transaction must balance, posted rows are immutable, one event maps to one journal, and reversals are linked. Semantic integrity is not equivalent to arithmetic integrity. IA-001 and IA-003 both produce wrong/missing accounting while the database balance checks still pass. Period locks also race (IA-005).

Missing mappings correctly fail rather than silently selecting a fallback. Mapping management and future-account provisioning are incomplete. Trial balance uses journal lines and account/date filters, but correctness still depends on approved mappings and complete event capture.

## 13. VAT and revenue policy gaps

Current code recognizes revenue/VAT at payment capture, not order creation or completion. It proportionally allocates partial payments and refunds and lets the final sequential event absorb rounding. Finance/legal approval was not found for:

- payment-time revenue recognition;
- VAT treatment across partial/multi-tender payments;
- delivery/service/source commission and discount account treatment;
- cancelled paid orders;
- physical stock return versus monetary refund;
- branch business date/timezone;
- purchase receipt liability timing;
- tips and SRS `Other` tender.

These are **Policy decision required** items. The concurrent allocation bug is a code defect regardless of the policy eventually chosen.

## 14. Period locks and trial balance

Sequential lock tests pass. The reproduced concurrent lock/post write skew means the control is not reliable. Overlapping locked periods are allowed. UTC-derived entry dates can select the wrong local period. Trial balance arithmetic passes but cannot detect incorrect revenue/VAT account allocation or omitted stock events.

## 15. Dry run and backfill

Dry run is the default and was not observed writing. Apply mode was not executed during this review. The current test gate is unsafe by database identity (IA-014), and production-grade checkpoint/resume/source consistency/reconciliation are missing (IA-024). Production write mode must remain disabled.

## 16. Shift report and bridge

Verdict: **GENERICALLY SUPPORTED**.

The API can enqueue `shift_report`, the generic print-job lifecycle can claim/retry/dead/requeue, and the bridge renderer accepts the payload. It is not fully typed or physically validated. No real-printer evidence exists.

Accuracy risks:

- `remaining_amount` passes a minor-unit difference through a money conversion again (`shifts.ts:87`).
- `orders_count` counts distinct paid orders, excluding unpaid shift orders.
- payment totals use `shift_id`; unsettled orders use cashier/time-window scope, so the populations can differ.
- refunds, discounts, cancellations, and branch timezone/cutoff are not fully represented.
- duplicate report requests have no idempotency key.

## 17. Test quality and validation

Existing test inventory:

| Suite | Tests | Review |
| --- | ---: | --- |
| Inventory foundation | 7 | Good basic derivation/isolation/concurrent issue; shared-state sequencing |
| Recipes/consumption | 7 | Good snapshot/retry/reversal; no crash lease or repeated activation |
| Operations/valuation | 6 | Good ordinary average/transfer/count; no precision residual/opening count |
| Financial outbox | 6 | Good claim/dedup; stale recovery called directly, no runtime worker proof |
| Accounting ledger | 8 | Good sequential allocation/balance/immutability; no multi-worker allocation race |
| Accounting backfill | 4 | Good dry-run/gate basics; no real DB identity proof/checkpoint |
| Shift report | 4 | Generic lifecycle; no numeric matrix/physical printer |

No skipped/todo/only tests were found.

Validation results:

| Command/gate | Result |
| --- | --- |
| Node | `v22.23.1` |
| `npm ci --no-audit --no-fund` | PASS |
| `npm run contracts:build` | PASS |
| `npm run contracts:test` | PASS, 13/13 |
| `npm run admin:test` | PASS, 11/11 |
| `npm run admin:build` | PASS |
| `npm run ui:colors:check` | PASS |
| `apps/api: npx tsc --noEmit` | PASS |
| Focused domain suites | PASS, 72/72 in 13 files |
| Full API suite | PASS, 186/186 in 27 files |
| Fresh migration 001-025 | PASS |
| Second latest | PASS, none pending |
| Down/up 021-025 | PASS |
| `git diff --check` before report | PASS |

The suite can pass while production is broken because its concurrency and invariant coverage does not include the reproduced interleavings. See IA-020.

## 18. Findings by severity

- **P0 (3):** IA-001 through IA-003.
- **P1 (13):** IA-004 through IA-016.
- **P2 (5):** IA-017 through IA-021.
- **P3 (4):** IA-022 through IA-025.

The authoritative details, evidence, reproduction, required fix/tests, migration impact, compatibility, blocker flag, and confidence are in `INVENTORY_ACCOUNTING_AUDIT_LEDGER.md`.

## 19. Production blockers and required remediation

Required before any production pilot:

1. Serialize payment/refund allocation and reconcile affected journals.
2. Ensure every value-changing inventory operation emits exactly one financial event.
3. Approve and implement precision/residual policy across inventory and GL.
4. Add schema tenant consistency and immutable event-snapshot controls.
5. Make period locking/posting race-safe and define business timezone.
6. Build supervised financial and consumption workers with leases/recovery/monitoring.
7. Complete governed count approval and correction/reversal workflows.
8. Repair recipe activation and moving-average full-depletion behavior.
9. Harden backfill against database misidentification; keep write disabled meanwhile.
10. Obtain formal revenue/VAT/refund/purchase-liability policy approval.

Hardware validation remains missing for shift-report printing.

## 20. Recommended remediation PR split and final decision

Recommended independently reviewable PRs:

1. **Schema integrity:** composite tenant constraints, immutable outbox, period overlap/serialization migration and preflight report.
2. **Inventory/GL completeness:** event coverage for all movement types, precision/residual policy, reconciliation.
3. **Payment/refund allocation:** order-scoped concurrency control and concurrent tests.
4. **Workers:** financial and consumption leases, recovery, backoff, monitoring, runbooks.
5. **Counts/corrections:** approval/locking and governed reversals with audit.
6. **Recipe reliability:** activation/version concurrency and modifier/refund policy implementation.
7. **Backfill:** database identity, stable checkpoints, dry-run parity, reconciliation.
8. **Shift close-out:** numeric correctness, consistent scope/timezone, request idempotency, physical-device acceptance.
9. **Documentation/policy:** approved finance policies and corrected completion/readiness status.

**Final decision: BLOCKED.** Existing code and tests should be retained as a foundation, but no Inventory + Accounting production deployment, historical write backfill, or claim of accounting completeness should proceed until the P0/P1 blockers and policy approvals are closed with migration and concurrency evidence.

## P0 Remediation Revalidation

This section is an additive revalidation; it does not rewrite the audit evidence or original decision above.

- **Remediation base:** `0bf0bf0f36f86f4358c25c9e93d9065187d1a625`
- **Schema enforcement:** `fddb5289ce973fe317194acb0b03b411f1a325b6`
- **IA-001 fix:** `9a141c4021c2d6a160c70d7f31c288c967fe94f7`
- **IA-002 fix:** `3b5dc4bd4656a720b9029fac9f1a0a286646c22e`
- **IA-003 fix:** `f407358b8ff2d63c2fb0f4c7103948c8e03abb7c`

### Revalidated outcomes

1. Payment/VAT allocation is now serialized per order in PostgreSQL. Paid-before/after and deterministic VAT/revenue allocation are computed after the row lock, payment/event insertion is atomic, aggregate overpayment is rejected, and idempotent retries return the original payment/event.
2. Every stock movement now receives durable financial classification in the same transaction. Journal-ready types remain pending, generic issue is visibly `pending_policy`, and internal transfer is explicitly `non_posting`. Event insertion failure rolls back the movement.
3. Inventory source value remains four-decimal. The two-decimal journal and exact residual satisfy `source = journal + residual`. Events rounded below one cent are `deferred_rounding`, not posted. Reversals negate original journal/residual evidence, and locked periods cannot accept or close over non-zero residuals.
4. Migration 026 adds focused idempotency, allocation ordering, event evidence, immutable snapshot, tenant relationship, reconciliation, and period-residual controls without modifying migrations 021-025.

### Validation evidence

- P0 focused files: **21/21 PASS** on PostgreSQL.
- API typecheck: **PASS**.
- Full API suite: **207/207 PASS**, no skipped tests added.
- Contracts: **13/13 PASS**.
- Admin tests: **11/11 PASS**; Admin production build and color contract PASS.
- Fresh migrations 001-026: PASS; second latest: no pending; migration 026 down/up: PASS.
- PostgreSQL catalog inspection confirmed payment sequence/idempotency indexes, source-event uniqueness, composite scope FKs, reconciliation equation/status checks, event evidence/snapshot guards, and period residual guards.

### Decision after P0 revalidation

The three audited P0 code-integrity failures are closed at their defined safety boundaries. IA-002 remains **Pending Policy** for generic-issue journal mapping, and IA-003 remains **Pending Policy** for final residual settlement. The overall production decision remains **BLOCKED** because the original P1 operational, concurrency, approval, timezone, backfill, and worker blockers were explicitly outside this remediation.
