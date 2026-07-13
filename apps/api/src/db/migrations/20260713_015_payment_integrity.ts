import { Knex } from "knex";

/**
 * Enforces payment integrity at the database boundary.
 * The order row lock serializes concurrent payments for the same order.
 */
export async function up(db: Knex): Promise<void> {
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

    drop trigger if exists payments_guard_before_insert on payments;
    create trigger payments_guard_before_insert
      before insert on payments
      for each row
      execute function ykms_guard_payment_insert();
  `);
}

export async function down(db: Knex): Promise<void> {
  await db.raw(`
    drop trigger if exists payments_guard_before_insert on payments;
    drop function if exists ykms_guard_payment_insert();
  `);
}
