import { Knex } from "knex";

const STATUS_CHECK = `
  status in (
    'pending',
    'processing',
    'posted',
    'failed',
    'dead',
    'pending_policy',
    'deferred_rounding',
    'non_posting',
    'reconciled'
  )
`;

export async function up(db: Knex): Promise<void> {
  await db.schema.table("payments", (table) => {
    table.string("idempotency_key", 180).nullable();
    table.bigInteger("allocation_sequence").nullable();
  });
  await db.raw(`
    with ranked as (
      select id, row_number() over (partition by order_id order by created_at, id) as sequence
        from payments
    )
    update payments
       set allocation_sequence = ranked.sequence
      from ranked
     where payments.id = ranked.id;
    alter table payments alter column allocation_sequence set not null;

    create unique index payments_order_idempotency_idx
      on payments (order_id, idempotency_key)
      where idempotency_key is not null;
    create unique index payments_order_allocation_sequence_idx
      on payments (order_id, allocation_sequence);

    create or replace function ykms_set_payment_allocation_sequence()
    returns trigger
    language plpgsql
    as $$
    begin
      if new.allocation_sequence is null then
        select coalesce(max(allocation_sequence), 0) + 1
          into new.allocation_sequence
          from payments
         where order_id = new.order_id;
      end if;
      return new;
    end;
    $$;

    create trigger payments_sequence_before_insert
      before insert on payments
      for each row execute function ykms_set_payment_allocation_sequence()
  `);

  await db.raw(`
    alter table branches
      add constraint branches_id_account_uq unique (id, account_id);
    alter table inventory_locations
      add constraint inventory_locations_scope_uq unique (id, account_id, branch_id);
    alter table inventory_items
      add constraint inventory_items_id_account_uq unique (id, account_id);
    alter table financial_events
      add constraint financial_events_id_account_uq unique (id, account_id);

    alter table stock_movements
      add constraint stock_movements_branch_account_fk
        foreign key (branch_id, account_id) references branches (id, account_id) on delete restrict,
      add constraint stock_movements_location_scope_fk
        foreign key (location_id, account_id, branch_id)
        references inventory_locations (id, account_id, branch_id) on delete restrict,
      add constraint stock_movements_item_account_fk
        foreign key (item_id, account_id) references inventory_items (id, account_id) on delete restrict;

    alter table financial_events
      add constraint financial_events_branch_account_fk
        foreign key (branch_id, account_id) references branches (id, account_id) on delete restrict;

    alter table journal_entries
      add constraint journal_entries_event_account_fk
        foreign key (financial_event_id, account_id)
        references financial_events (id, account_id) on delete restrict;

    create unique index financial_events_source_event_uq
      on financial_events (account_id, source_type, source_id, event_type);

    alter table financial_events drop constraint financial_events_status_check;
    alter table financial_events
      add constraint financial_events_status_check check (${STATUS_CHECK});
  `);

  await db.schema.createTable("financial_event_reconciliations", (table) => {
    table.uuid("id").primary();
    table.uuid("account_id").notNullable();
    table.uuid("branch_id").nullable();
    table.uuid("financial_event_id").notNullable();
    table.string("event_type", 80).notNullable();
    table.string("dimension_key", 80).notNullable().defaultTo("default");
    table.date("entry_date").notNullable();
    table.decimal("source_amount", 24, 4).notNullable();
    table.decimal("journal_amount", 24, 2).notNullable().defaultTo(0);
    table.decimal("residual_amount", 24, 4).notNullable();
    table.string("status", 20).notNullable().defaultTo("open");
    table.uuid("reverses_reconciliation_id").nullable();
    table.uuid("settlement_journal_id").nullable().references("journal_entries.id").onDelete("RESTRICT");
    table.timestamp("created_at").notNullable().defaultTo(db.fn.now());
    table.unique(["financial_event_id"]);
    table.foreign(["financial_event_id", "account_id"])
      .references(["id", "account_id"])
      .inTable("financial_events")
      .onDelete("RESTRICT");
    table.foreign(["branch_id", "account_id"])
      .references(["id", "account_id"])
      .inTable("branches")
      .onDelete("RESTRICT");
    table.foreign("reverses_reconciliation_id")
      .references("financial_event_reconciliations.id")
      .onDelete("RESTRICT");
    table.index(["account_id", "branch_id", "status", "entry_date"], "financial_reconciliations_open_idx");
  });
  await db.raw(`
    alter table financial_event_reconciliations
      add constraint financial_reconciliations_status_check
        check (status in ('open', 'settled', 'reversed')),
      add constraint financial_reconciliations_source_nonzero
        check (source_amount <> 0),
      add constraint financial_reconciliations_equation_check
        check (residual_amount = source_amount - journal_amount);
    create unique index financial_reconciliations_one_reverse_idx
      on financial_event_reconciliations (reverses_reconciliation_id)
      where reverses_reconciliation_id is not null;
  `);

  await db.raw(`
    create or replace function ykms_guard_financial_event_snapshot()
    returns trigger
    language plpgsql
    as $$
    begin
      if new.account_id is distinct from old.account_id
         or new.branch_id is distinct from old.branch_id
         or new.source_type is distinct from old.source_type
         or new.source_id is distinct from old.source_id
         or new.event_type is distinct from old.event_type
         or new.idempotency_key is distinct from old.idempotency_key
         or new.payload_version is distinct from old.payload_version
         or new.payload is distinct from old.payload then
        raise exception using errcode = '55000', message = 'Financial event snapshots are immutable';
      end if;
      return new;
    end;
    $$;

    create trigger financial_events_snapshot_guard
      before update on financial_events
      for each row execute function ykms_guard_financial_event_snapshot();

    create or replace function ykms_guard_financial_event_evidence()
    returns trigger
    language plpgsql
    as $$
    begin
      if new.status = 'posted' and old.status is distinct from new.status
         and not exists (
           select 1 from journal_entries where financial_event_id = new.id
         )
         and not exists (
           select 1 from financial_event_reconciliations where financial_event_id = new.id
         ) then
        raise exception using errcode = '23514', constraint = 'financial_event_posted_evidence',
          message = 'Posted financial events require journal or reconciliation evidence';
      end if;
      return new;
    end;
    $$;

    create trigger financial_events_evidence_guard
      before update of status on financial_events
      for each row execute function ykms_guard_financial_event_evidence();
  `);

  await db.raw(`
    create or replace function ykms_guard_accounting_period()
    returns trigger
    language plpgsql
    as $$
    begin
      if exists (
        select 1 from accounting_periods
         where account_id = new.account_id
           and status = 'locked'
           and new.entry_date between starts_on and ends_on
      ) then
        raise exception using errcode = '23514', constraint = 'journal_period_locked', message = 'Accounting period is locked';
      end if;
      return new;
    end;
    $$;

    create or replace function ykms_guard_period_residuals()
    returns trigger
    language plpgsql
    as $$
    begin
      if new.status = 'locked' and exists (
        select 1
          from financial_event_reconciliations
         where account_id = new.account_id
           and status = 'open'
           and entry_date between new.starts_on and new.ends_on
         group by account_id
        having abs(sum(residual_amount)) >= 0.0001
      ) then
        raise exception using errcode = '23514', constraint = 'accounting_period_open_residuals',
          message = 'Accounting period has unreconciled inventory residuals';
      end if;
      return new;
    end;
    $$;

    create trigger accounting_periods_residual_guard
      before insert or update on accounting_periods
      for each row execute function ykms_guard_period_residuals();
  `);
}

export async function down(db: Knex): Promise<void> {
  await db.raw("drop trigger if exists payments_sequence_before_insert on payments");
  await db.raw("drop function if exists ykms_set_payment_allocation_sequence()");
  await db.raw("drop trigger if exists accounting_periods_residual_guard on accounting_periods");
  await db.raw("drop function if exists ykms_guard_period_residuals()");
  await db.raw("drop trigger if exists financial_events_evidence_guard on financial_events");
  await db.raw("drop function if exists ykms_guard_financial_event_evidence()");
  await db.raw("drop trigger if exists financial_events_snapshot_guard on financial_events");
  await db.raw("drop function if exists ykms_guard_financial_event_snapshot()");

  await db.schema.dropTableIfExists("financial_event_reconciliations");

  await db.raw(`
    alter table journal_entries drop constraint if exists journal_entries_event_account_fk;
    alter table financial_events drop constraint if exists financial_events_branch_account_fk;
    alter table stock_movements drop constraint if exists stock_movements_item_account_fk;
    alter table stock_movements drop constraint if exists stock_movements_location_scope_fk;
    alter table stock_movements drop constraint if exists stock_movements_branch_account_fk;
    drop index if exists financial_events_source_event_uq;

    alter table financial_events drop constraint financial_events_status_check;
    update financial_events
       set status = 'pending'
     where status in ('pending_policy', 'deferred_rounding', 'non_posting', 'reconciled');
    alter table financial_events
      add constraint financial_events_status_check
      check (status in ('pending', 'processing', 'posted', 'failed', 'dead'));

    alter table financial_events drop constraint if exists financial_events_id_account_uq;
    alter table inventory_items drop constraint if exists inventory_items_id_account_uq;
    alter table inventory_locations drop constraint if exists inventory_locations_scope_uq;
    alter table branches drop constraint if exists branches_id_account_uq;
  `);

  await db.raw("drop index if exists payments_order_idempotency_idx");
  await db.raw("drop index if exists payments_order_allocation_sequence_idx");
  await db.schema.table("payments", (table) => {
    table.dropColumn("idempotency_key");
    table.dropColumn("allocation_sequence");
  });
}
