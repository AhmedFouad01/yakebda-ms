<div dir="rtl" align="right">

# ADR-005 — Kitchen Pause and Order Hold

**الحالة:** Accepted / Merged on main  
**Production deployment:** Not claimed

## Kitchen Pause

- branch-level.
- existing KDS work continues.
- final order submit يرفض 409 `KITCHEN_PAUSED` قبل order/payment/inventory/financial side effects.
- no hidden queue.
- `kitchen.manage` للـowner/admin افتراضيًا.

## Order Hold

- allowed from `in_kitchen`.
- overlay مستقل عن `orders.status`.
- reason mandatory.
- blocks transition to ready (`ORDER_ON_HOLD`).
- SLA excludes hold periods.
- no inventory/financial effect.
- append-only hold history.

## Idempotency/Concurrency

- pause/resume/hold/resume keys.
- deterministic replay/conflict.
- row locks + unique active hold.

## Rollback

migration down local-safe فقط لأنها تفقد operational pause/hold history؛ لا production rollback بدون retention plan.

</div>
