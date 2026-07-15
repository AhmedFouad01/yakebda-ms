import { Knex } from "knex";

const SYSTEM_ACCOUNTS = [
  ["1000", "cash", "النقدية", "asset"],
  ["1010", "card_clearing", "تسويات البطاقات", "asset"],
  ["1020", "wallet_clearing", "تسويات المحافظ", "asset"],
  ["1100", "inventory", "المخزون", "asset"],
  ["2100", "accounts_payable", "الموردون", "liability"],
  ["2200", "vat_payable", "ضريبة القيمة المضافة", "liability"],
  ["3000", "sales_revenue", "إيرادات المبيعات", "revenue"],
  ["4000", "cogs", "تكلفة البضاعة المباعة", "expense"],
  ["5000", "waste_expense", "مصروف الهالك", "expense"],
  ["5100", "inventory_variance", "فروق المخزون", "expense"],
  ["5200", "cash_variance", "فروق وحركات النقدية", "expense"],
] as const;

export async function up(db: Knex): Promise<void> {
  await db.schema.createTable("accounting_accounts", (table) => {
    table.uuid("id").primary();
    table.uuid("account_id").notNullable().references("accounts.id").onDelete("RESTRICT");
    table.string("code", 30).notNullable();
    table.string("system_key", 60).nullable();
    table.string("name_ar", 160).notNullable();
    table.string("account_type", 30).notNullable();
    table.boolean("is_active").notNullable().defaultTo(true);
    table.timestamps(true, true);
    table.unique(["account_id", "code"]);
    table.unique(["id", "account_id"]);
  });
  await db.raw(`
    alter table accounting_accounts
      add constraint accounting_accounts_type_check check (account_type in ('asset', 'liability', 'equity', 'revenue', 'expense'));
    create unique index accounting_accounts_system_key_idx
      on accounting_accounts (account_id, system_key)
      where system_key is not null
  `);

  await db.schema.createTable("accounting_mappings", (table) => {
    table.uuid("id").primary();
    table.uuid("account_id").notNullable().references("accounts.id").onDelete("RESTRICT");
    table.string("event_type", 80).notNullable();
    table.string("dimension_key", 80).notNullable().defaultTo("default");
    table.uuid("debit_account_id").notNullable();
    table.uuid("credit_account_id").notNullable();
    table.uuid("vat_account_id").nullable();
    table.timestamps(true, true);
    table.unique(["account_id", "event_type", "dimension_key"]);
    table.foreign(["debit_account_id", "account_id"]).references(["id", "account_id"]).inTable("accounting_accounts").onDelete("RESTRICT");
    table.foreign(["credit_account_id", "account_id"]).references(["id", "account_id"]).inTable("accounting_accounts").onDelete("RESTRICT");
    table.foreign(["vat_account_id", "account_id"]).references(["id", "account_id"]).inTable("accounting_accounts").onDelete("RESTRICT");
  });

  await db.schema.createTable("accounting_periods", (table) => {
    table.uuid("id").primary();
    table.uuid("account_id").notNullable().references("accounts.id").onDelete("RESTRICT");
    table.date("starts_on").notNullable();
    table.date("ends_on").notNullable();
    table.string("status", 20).notNullable().defaultTo("open");
    table.uuid("locked_by").nullable().references("users.id").onDelete("SET NULL");
    table.timestamp("locked_at").nullable();
    table.timestamps(true, true);
    table.unique(["account_id", "starts_on", "ends_on"]);
  });
  await db.raw(`
    alter table accounting_periods
      add constraint accounting_periods_date_order check (starts_on <= ends_on),
      add constraint accounting_periods_status_check check (status in ('open', 'locked'))
  `);

  await db.schema.createTable("journal_entries", (table) => {
    table.uuid("id").primary();
    table.uuid("account_id").notNullable().references("accounts.id").onDelete("RESTRICT");
    table.uuid("branch_id").nullable().references("branches.id").onDelete("RESTRICT");
    table.uuid("financial_event_id").nullable().references("financial_events.id").onDelete("RESTRICT");
    table.string("event_type", 80).notNullable();
    table.string("source_type", 60).notNullable();
    table.string("source_id", 160).notNullable();
    table.uuid("order_id").nullable().references("orders.id").onDelete("RESTRICT");
    table.uuid("payment_id").nullable().references("payments.id").onDelete("RESTRICT");
    table.uuid("original_payment_id").nullable().references("payments.id").onDelete("RESTRICT");
    table.date("entry_date").notNullable();
    table.text("description").notNullable();
    table.jsonb("meta").notNullable().defaultTo("{}");
    table.uuid("reversal_of_entry_id").nullable().references("journal_entries.id").onDelete("RESTRICT");
    table.uuid("created_by").nullable().references("users.id").onDelete("SET NULL");
    table.timestamp("posted_at").notNullable().defaultTo(db.fn.now());
    table.timestamp("created_at").notNullable().defaultTo(db.fn.now());
    table.unique(["financial_event_id"]);
    table.unique(["id", "account_id"]);
    table.index(["account_id", "entry_date", "id"], "journal_entries_scope_idx");
    table.index(["account_id", "order_id", "event_type"], "journal_entries_order_idx");
  });
  await db.raw(`
    create unique index journal_entries_one_reversal_idx
      on journal_entries (reversal_of_entry_id)
      where reversal_of_entry_id is not null
  `);

  await db.schema.createTable("journal_lines", (table) => {
    table.uuid("id").primary();
    table.uuid("account_id").notNullable().references("accounts.id").onDelete("RESTRICT");
    table.uuid("entry_id").notNullable();
    table.uuid("accounting_account_id").notNullable();
    table.uuid("branch_id").nullable().references("branches.id").onDelete("RESTRICT");
    table.string("component", 40).notNullable();
    table.decimal("debit", 18, 2).notNullable().defaultTo(0);
    table.decimal("credit", 18, 2).notNullable().defaultTo(0);
    table.timestamp("created_at").notNullable().defaultTo(db.fn.now());
    table.foreign(["entry_id", "account_id"]).references(["id", "account_id"]).inTable("journal_entries").onDelete("RESTRICT");
    table.foreign(["accounting_account_id", "account_id"]).references(["id", "account_id"]).inTable("accounting_accounts").onDelete("RESTRICT");
    table.index(["entry_id"]);
    table.index(["accounting_account_id", "created_at"], "journal_lines_account_idx");
  });
  await db.raw(`
    alter table journal_lines
      add constraint journal_lines_one_side_positive check (
        (debit > 0 and credit = 0) or (credit > 0 and debit = 0)
      )
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

    create trigger journal_entries_period_guard
      before insert on journal_entries
      for each row execute function ykms_guard_accounting_period();

    create or replace function ykms_guard_journal_balance()
    returns trigger
    language plpgsql
    as $$
    declare
      v_entry uuid;
      v_debit numeric;
      v_credit numeric;
    begin
      v_entry := coalesce(new.entry_id, old.entry_id);
      select coalesce(sum(debit), 0), coalesce(sum(credit), 0)
        into v_debit, v_credit
        from journal_lines where entry_id = v_entry;
      if abs(v_debit - v_credit) > 0.001 then
        raise exception using errcode = '23514', constraint = 'journal_entry_unbalanced', message = 'Journal entry must balance';
      end if;
      return null;
    end;
    $$;

    create constraint trigger journal_lines_balance_guard
      after insert or update or delete on journal_lines
      deferrable initially deferred
      for each row execute function ykms_guard_journal_balance();

    create or replace function ykms_guard_journal_entry_balance()
    returns trigger
    language plpgsql
    as $$
    declare
      v_debit numeric;
      v_credit numeric;
    begin
      select coalesce(sum(debit), 0), coalesce(sum(credit), 0)
        into v_debit, v_credit
        from journal_lines where entry_id = new.id;
      if v_debit = 0 or abs(v_debit - v_credit) > 0.001 then
        raise exception using errcode = '23514', constraint = 'journal_entry_unbalanced', message = 'Journal entry must contain balanced lines';
      end if;
      return null;
    end;
    $$;

    create constraint trigger journal_entries_balance_guard
      after insert on journal_entries
      deferrable initially deferred
      for each row execute function ykms_guard_journal_entry_balance();

    create or replace function ykms_guard_posted_journal_immutable()
    returns trigger
    language plpgsql
    as $$
    begin
      raise exception using errcode = '55000', message = 'Posted journals are immutable';
    end;
    $$;

    create trigger journal_entries_immutable_guard
      before update or delete on journal_entries
      for each row execute function ykms_guard_posted_journal_immutable();
    create trigger journal_lines_immutable_guard
      before update or delete on journal_lines
      for each row execute function ykms_guard_posted_journal_immutable();
  `);

  const accounts = await db("accounts").select("id");
  for (const account of accounts) {
    const ids: Record<string, string> = {};
    for (const [code, systemKey, nameAr, accountType] of SYSTEM_ACCOUNTS) {
      const id = db.raw("gen_random_uuid()");
      await db("accounting_accounts").insert({ id, account_id: account.id, code, system_key: systemKey, name_ar: nameAr, account_type: accountType });
      ids[systemKey] = (await db("accounting_accounts").where({ account_id: account.id, system_key: systemKey }).first()).id;
    }
    const mappings = [
      ["payment.captured", "cash", ids.cash, ids.sales_revenue, ids.vat_payable],
      ["payment.captured", "card", ids.card_clearing, ids.sales_revenue, ids.vat_payable],
      ["payment.captured", "wallet", ids.wallet_clearing, ids.sales_revenue, ids.vat_payable],
      ["refund.posted", "cash", ids.sales_revenue, ids.cash, ids.vat_payable],
      ["refund.posted", "card", ids.sales_revenue, ids.card_clearing, ids.vat_payable],
      ["refund.posted", "wallet", ids.sales_revenue, ids.wallet_clearing, ids.vat_payable],
      ["cash.movement", "cash_in", ids.cash, ids.cash_variance, null],
      ["cash.movement", "cash_out", ids.cash_variance, ids.cash, null],
      ["inventory.receipt", "default", ids.inventory, ids.accounts_payable, null],
      ["inventory.consumption", "default", ids.cogs, ids.inventory, null],
      ["inventory.waste", "default", ids.waste_expense, ids.inventory, null],
      ["inventory.adjustment", "positive", ids.inventory, ids.inventory_variance, null],
      ["inventory.adjustment", "negative", ids.inventory_variance, ids.inventory, null],
    ];
    for (const [eventType, dimensionKey, debitId, creditId, vatId] of mappings) {
      await db("accounting_mappings").insert({
        id: db.raw("gen_random_uuid()"),
        account_id: account.id,
        event_type: eventType,
        dimension_key: dimensionKey,
        debit_account_id: debitId,
        credit_account_id: creditId,
        vat_account_id: vatId,
      });
    }
  }
}

export async function down(db: Knex): Promise<void> {
  await db.raw("drop trigger if exists journal_lines_immutable_guard on journal_lines");
  await db.raw("drop trigger if exists journal_entries_immutable_guard on journal_entries");
  await db.raw("drop trigger if exists journal_lines_balance_guard on journal_lines");
  await db.raw("drop trigger if exists journal_entries_balance_guard on journal_entries");
  await db.raw("drop trigger if exists journal_entries_period_guard on journal_entries");
  await db.raw("drop function if exists ykms_guard_posted_journal_immutable()");
  await db.raw("drop function if exists ykms_guard_journal_balance()");
  await db.raw("drop function if exists ykms_guard_journal_entry_balance()");
  await db.raw("drop function if exists ykms_guard_accounting_period()");
  await db.schema.dropTableIfExists("journal_lines");
  await db.schema.dropTableIfExists("journal_entries");
  await db.schema.dropTableIfExists("accounting_periods");
  await db.schema.dropTableIfExists("accounting_mappings");
  await db.schema.dropTableIfExists("accounting_accounts");
}
