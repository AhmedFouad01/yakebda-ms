import { Knex } from "knex";

/**
 * Adds immutable payment reversal lineage and persisted shift variance.
 * Refunds are negative payment rows tied to the original payment so shift sums
 * self-correct without deleting or rewriting financial history.
 */
export async function up(db: Knex): Promise<void> {
  await db.schema.alterTable("payments", (table) => {
    table.string("kind").notNullable().defaultTo("payment");
    table.text("reason").nullable();
    table.uuid("reversal_of_payment_id").nullable().references("payments.id").onDelete("RESTRICT");
    table.index(["reversal_of_payment_id"]);
  });

  await db.schema.alterTable("shifts", (table) => {
    table.decimal("variance", 10, 2).nullable();
    table.string("over_short").nullable();
  });

  await db.raw(`
    create or replace function ykms_guard_payment_insert()
    returns trigger
    language plpgsql
    as $$
    declare
      v_total numeric;
      v_paid numeric;
      v_original_amount numeric;
      v_original_refunded numeric;
    begin
      if new.method = 'unpaid' then
        if new.kind <> 'payment' or abs(new.amount) > 0.001 then
          raise exception using
            errcode = '23514',
            constraint = 'payments_unpaid_zero_guard',
            message = 'Unpaid marker amount must be zero';
        end if;
        return new;
      end if;

      select total
        into v_total
        from orders
       where id = new.order_id
       for update;

      select coalesce(sum(amount), 0)
        into v_paid
        from payments
       where order_id = new.order_id
         and method <> 'unpaid';

      if new.kind = 'refund' then
        if new.amount >= 0 then
          raise exception using
            errcode = '23514',
            constraint = 'payments_refund_amount_negative_guard',
            message = 'Refund amount must be negative';
        end if;

        if new.reversal_of_payment_id is null or nullif(trim(new.reason), '') is null then
          raise exception using
            errcode = '23514',
            constraint = 'payments_refund_reference_guard',
            message = 'Refund requires an original payment and reason';
        end if;

        select p.amount,
               coalesce((select sum(r.amount)
                           from payments r
                          where r.reversal_of_payment_id = p.id
                            and r.kind = 'refund'), 0)
          into v_original_amount, v_original_refunded
          from payments p
         where p.id = new.reversal_of_payment_id
           and p.order_id = new.order_id
           and p.method = new.method
           and p.kind = 'payment'
           and p.amount > 0;

        if v_original_amount is null then
          raise exception using
            errcode = '23514',
            constraint = 'payments_refund_reference_guard',
            message = 'Refund original payment is invalid';
        end if;

        if abs(new.amount) > v_original_amount + v_original_refunded + 0.001
           or v_paid + new.amount < -0.001 then
          raise exception using
            errcode = '23514',
            constraint = 'payments_refund_over_paid_guard',
            message = 'Refund exceeds refundable paid amount';
        end if;

        return new;
      end if;

      if new.kind <> 'payment' or new.amount <= 0 then
        raise exception using
          errcode = '23514',
          constraint = 'payments_amount_positive_guard',
          message = 'Payment amount must be positive';
      end if;

      if v_paid + 0.001 >= v_total then
        raise exception using
          errcode = '23514',
          constraint = 'payments_already_paid_guard',
          message = 'Order is already fully paid';
      end if;

      if v_paid + new.amount > v_total + 0.001 then
        raise exception using
          errcode = '23514',
          constraint = 'payments_over_remaining_guard',
          message = 'Payment exceeds remaining balance';
      end if;

      return new;
    end;
    $$;
  `);
}

export async function down(db: Knex): Promise<void> {
  await db.raw(`
    create or replace function ykms_guard_payment_insert()
    returns trigger
    language plpgsql
    as $$
    declare
      v_total numeric;
      v_paid numeric;
    begin
      if new.method = 'unpaid' then
        if abs(new.amount) > 0.001 then
          raise exception using
            errcode = '23514',
            constraint = 'payments_unpaid_zero_guard',
            message = 'Unpaid marker amount must be zero';
        end if;
        return new;
      end if;

      if new.amount <= 0 then
        raise exception using
          errcode = '23514',
          constraint = 'payments_amount_positive_guard',
          message = 'Payment amount must be positive';
      end if;

      select total into v_total from orders where id = new.order_id for update;
      select coalesce(sum(amount), 0)
        into v_paid
        from payments
       where order_id = new.order_id
         and method <> 'unpaid';

      if v_paid + 0.001 >= v_total then
        raise exception using
          errcode = '23514',
          constraint = 'payments_already_paid_guard',
          message = 'Order is already fully paid';
      end if;

      if v_paid + new.amount > v_total + 0.001 then
        raise exception using
          errcode = '23514',
          constraint = 'payments_over_remaining_guard',
          message = 'Payment exceeds remaining balance';
      end if;

      return new;
    end;
    $$;
  `);

  await db.schema.alterTable("shifts", (table) => {
    table.dropColumn("over_short");
    table.dropColumn("variance");
  });

  await db.schema.alterTable("payments", (table) => {
    table.dropIndex(["reversal_of_payment_id"]);
    table.dropForeign(["reversal_of_payment_id"]);
    table.dropColumn("reversal_of_payment_id");
    table.dropColumn("reason");
    table.dropColumn("kind");
  });
}
