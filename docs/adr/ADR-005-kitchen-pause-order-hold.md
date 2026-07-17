# ADR-005 — Kitchen Pause & Order Hold

**Status:** Accepted for local implementation — **Not Production Ready**
**Branch:** `feature/kitchen-pause-order-hold` (base: W4 `4a6e48965f29051543a57263c974c5dc9ef94663`)
**Owners:** Kitchen operations (KDS) + POS submission path.

## Context

Operations need two controls that today do not exist anywhere in schema, API, or UI:

1. **Kitchen Pause** — a branch stops accepting *new* orders (equipment failure,
   deep-clean, rush recovery) without freezing work already on the board.
2. **Order Hold** — a single in-kitchen order is parked with a reason
   (ingredient shortage, customer request …) and must not advance to `ready`
   until resumed; SLA must not count the parked time against the kitchen.

## Decision (approved operating policy)

### Kitchen Pause
- Scope: **branch-level** within the current account. No account-wide pause.
- Orders already in KDS continue normally; nothing freezes.
- While paused the **backend rejects final order submission** for that branch
  with **HTTP 409, code `KITCHEN_PAUSED`** — before any order row, payment,
  inventory, or financial side effect is created.
- POS shows a banner and disables final submit; the 409 remains the authority.
- KDS shows a pause banner. Resume restores acceptance immediately.
- No hidden queueing; no silent deferral of new orders.

### Order Hold
- Allowed **only** from order status `in_kitchen`. Rejected for
  `ready/completed/cancelled` (and any refunded state).
- Hold does **not** change `orders.status`; it is an independent, durable
  operational state stored append-only in `kitchen_order_holds`.
- Reason mandatory, from a fixed initial set:
  `equipment_issue | ingredient_shortage | customer_request | quality_check | other`
  — `other` additionally requires `reason_note`.
- A held order **cannot transition to `ready`** (409 `ORDER_ON_HOLD`);
  completion cannot bypass the hold.
- SLA/elapsed kitchen time **excludes the sum of hold periods** (computed from
  hold rows; client renders using server-provided totals).
- Hold/Resume have **no inventory or financial effect**; inventory deduction
  remains bound to the currently approved completion stage.

### Permissions
| Action | Permission |
|---|---|
| Pause / Resume kitchen | `kitchen.manage` (**new**) |
| Hold / Resume order | `kitchen.update` (existing) |
| Read state | `kitchen.view` (existing) |

**Default role mapping (explicit):** `kitchen.manage` is granted to the
`owner` and `admin` roles only by the migration. Managers/kitchen staff do NOT
receive it automatically; granting it to other roles is a deliberate admin
action via the roles UI/endpoint. Rationale: pausing a branch halts revenue
intake — supervisor-level by default.

## State diagrams

```
Kitchen branch state:
  active ──pause(kitchen.manage, reason)──▶ paused
  paused ──resume(kitchen.manage)────────▶ active
  (pause while paused: same idempotency_key → replay; different key → 409 KITCHEN_ALREADY_PAUSED)
  (resume while active: same key → replay; different key → 409 KITCHEN_NOT_PAUSED)

Order hold (operational overlay; orders.status unchanged):
  in_kitchen ──hold(kitchen.update, reason)──▶ held(in_kitchen)
  held(in_kitchen) ──resume(kitchen.update)──▶ in_kitchen
  invalid: hold from ready/completed/cancelled → 409 ORDER_HOLD_INVALID_STATE
  invalid: in_kitchen→ready while held        → 409 ORDER_ON_HOLD
```

## API contract (mounted under the existing `/kitchen` router)

| Method & path | Perm | Body | Success | Errors |
|---|---|---|---|---|
| GET `/kitchen/state?branch_id` | kitchen.view | — | `{is_paused, paused_at, pause_reason, paused_by_name}` | 403/404 scope |
| POST `/kitchen/pause` | kitchen.manage | `{branch_id, reason(3..300), idempotency_key(8..180)}` | 201 / 200 replay | 409 `KITCHEN_ALREADY_PAUSED`, 403, 404 |
| POST `/kitchen/resume` | kitchen.manage | `{branch_id, idempotency_key}` | 201 / 200 replay | 409 `KITCHEN_NOT_PAUSED` |
| POST `/kitchen/orders/:orderId/hold` | kitchen.update | `{reason_code, reason_note?, idempotency_key}` | 201 / 200 replay | 409 `ORDER_ALREADY_HELD`, 409 `ORDER_HOLD_INVALID_STATE`, 422 reason |
| POST `/kitchen/orders/:orderId/hold-resume` | kitchen.update | `{idempotency_key}` | 201 / 200 replay | 409 `ORDER_NOT_HELD` |

Order submission guard: `POST /orders` (final submit path) checks the branch
state inside the create transaction **before** any write → 409 `KITCHEN_PAUSED`.
Status guards: both status-transition handlers (admin + kitchen) reject
`→ready` while an active hold exists → 409 `ORDER_ON_HOLD`.
Cross-account/branch: 404 (no data disclosure), matching current policy.
Errors are structured `{code, message}`; Arabic messages via `ar.errors`.

## Audit event map (same transaction as the write)

| Event | When |
|---|---|
| `kitchen.paused` / `kitchen.resumed` | state flips (actor, branch, reason, prev→new, request_id) |
| `kitchen.order_held` / `kitchen.order_resumed` | hold rows (order, reason) |
| `kitchen.transition_blocked_by_pause` | 409 on submission while paused |
| `kitchen.transition_blocked_by_hold` | 409 on →ready while held |

No secrets/payload bodies in meta.

## Schema (migration `20260717_027_kitchen_pause_order_hold`)

- `kitchen_branch_states` — one row per (account_id, branch_id) [unique];
  `is_paused, paused_at/by, pause_reason, resumed_at/by, version` (optimistic
  counter; writes take `FOR UPDATE`), `last_pause_key/last_resume_key` for
  idempotent replay detection. FK branch→branches with account consistency
  enforced by lookup in the service (branch fetched scoped by account).
- `kitchen_order_holds` — append-only; `reason_code (check)`, `reason_note`,
  `held_at/by, resumed_at/by`; **partial unique index on (order_id) where
  resumed_at is null** ⇒ at most one active hold; no operational deletes;
  `hold_key/resume_key` for replay.
- Permission seed: insert `kitchen.manage` + grants to roles `owner`,`admin`
  (idempotent `on conflict do nothing`).

### Backfill / rollback
- Backfill: none needed — absence of a state row ⇒ active; absence of holds ⇒
  none. Rows are created lazily on first pause/hold.
- `down()`: drops both tables + permission rows. **Local-safe only** — it
  discards pause/hold history; NOT production-safe without a data retention
  decision (documented capability loss: audit rows survive, operational rows do not).

## Failure modes → behavior

| Mode | Behavior |
|---|---|
| duplicate pause (same key) | 200 replay, no new audit |
| duplicate pause (new key) | 409 `KITCHEN_ALREADY_PAUSED` |
| concurrent pause/resume | row `FOR UPDATE` on state row; second txn sees final state → replay/409 deterministically |
| duplicate hold (same key) | 200 replay |
| duplicate hold (new key) | 409 `ORDER_ALREADY_HELD` |
| concurrent hold/resume | order row + hold row locked `FOR UPDATE`; loser gets deterministic 409 |
| hold while order changed status | status re-read under lock → `ORDER_HOLD_INVALID_STATE` |
| branch/account mismatch | 404, no disclosure |
| missing/invalid reason (`other` w/o note) | 422 validation |
| stale client (paused after page load) | backend 409 is authority; POS surfaces Arabic message |
| retry after timeout | same idempotency_key ⇒ replay of stored outcome |

## SLA computation

Kitchen board response adds per-order: `held_total_seconds` (sum of closed
holds) + `active_hold {held_at, reason_code, reason_note, held_by_name}`.
Client elapsed = `now − anchor − held_total − (now − active_hold.held_at if active)`.
Timer visually freezes while held.

## Consequences

- New permission key surfaces in roles UI automatically (catalog-driven).
- POS gains one read of `/kitchen/state` per branch selection + submit-error path.
- No queueing semantics; a future "queue while paused" would be a separate ADR.
