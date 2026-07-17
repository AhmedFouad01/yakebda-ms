import { Knex } from "knex";
import { err } from "../lib/errors";
import { newId } from "../lib/ids";
import { ar } from "../i18n/ar";
import { createConsumptionEventForOrder, processConsumptionEvent } from "./inventoryConsumption";

const TRANSITIONS: Record<string, string[]> = {
  draft: ["submitted", "cancelled"],
  submitted: ["in_kitchen", "ready", "cancelled"],
  in_kitchen: ["ready", "cancelled"],
  ready: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};

export async function transitionOrderStatus(
  db: Knex,
  input: {
    orderId: string;
    accountId: string;
    to: string;
    userId: string | null;
    cancelReason?: string;
  }
): Promise<{ consumptionEventId: string | null }> {
  const consumptionEventId = await db.transaction(async (trx) => {
    const order = await trx("orders")
      .where({ id: input.orderId, account_id: input.accountId })
      .forUpdate()
      .first();
    if (!order) throw err.notFound();
    if (!TRANSITIONS[order.status]?.includes(input.to)) {
      throw err.validation({ status: ar.errors.bad_status_transition });
    }

    const patch: Record<string, unknown> = { status: input.to, updated_at: trx.fn.now() };
    if (input.to === "submitted") patch.submitted_at = trx.fn.now();
    if (input.to === "in_kitchen") patch.in_kitchen_at = trx.fn.now();
    if (input.to === "ready") patch.ready_at = trx.fn.now();
    if (input.to === "completed") patch.completed_at = trx.fn.now();
    if (input.to === "cancelled") {
      patch.cancelled_at = trx.fn.now();
      if (input.cancelReason) patch.cancel_reason = input.cancelReason;
    }
    await trx("orders").where({ id: order.id }).update(patch);
    await trx("order_status_history").insert({
      id: newId(),
      order_id: order.id,
      from_status: order.status,
      to_status: input.to,
      changed_by: input.userId,
    });
    if (order.table_id) {
      if (input.to === "submitted" || input.to === "in_kitchen") {
        await trx("dining_tables").where({ id: order.table_id }).update({ status: "occupied", updated_at: trx.fn.now() });
      }
      if (input.to === "completed" || input.to === "cancelled") {
        await trx("dining_tables").where({ id: order.table_id }).update({ status: "cleaning", updated_at: trx.fn.now() });
      }
    }
    if (input.to === "completed") {
      return createConsumptionEventForOrder(trx, order, input.userId);
    }
    return null;
  });

  if (consumptionEventId) await processConsumptionEvent(db, consumptionEventId);
  return { consumptionEventId };
}
