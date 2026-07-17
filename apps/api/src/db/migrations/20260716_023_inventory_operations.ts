import { Knex } from "knex";

export async function up(db: Knex): Promise<void> {
  await db.schema.createTable("inventory_stock_counts", (table) => {
    table.uuid("id").primary();
    table.uuid("account_id").notNullable().references("accounts.id").onDelete("RESTRICT");
    table.uuid("branch_id").notNullable().references("branches.id").onDelete("RESTRICT");
    table.uuid("location_id").notNullable().references("inventory_locations.id").onDelete("RESTRICT");
    table.uuid("item_id").notNullable().references("inventory_items.id").onDelete("RESTRICT");
    table.decimal("expected_quantity", 18, 6).notNullable();
    table.decimal("counted_quantity", 18, 6).notNullable();
    table.decimal("difference_quantity", 18, 6).notNullable();
    table.string("idempotency_key", 180).notNullable();
    table.text("reason").notNullable();
    table.uuid("movement_id").nullable().references("stock_movements.id").onDelete("RESTRICT");
    table.uuid("created_by").nullable().references("users.id").onDelete("SET NULL");
    table.timestamp("created_at").notNullable().defaultTo(db.fn.now());
    table.unique(["account_id", "idempotency_key"]);
    table.index(["account_id", "location_id", "item_id", "created_at"], "inventory_stock_counts_scope_idx");
  });
  await db.raw("alter table inventory_stock_counts add constraint inventory_stock_counts_nonnegative check (counted_quantity >= 0)");
  await db.raw(`
    create unique index stock_movements_one_reversal_idx
      on stock_movements (reversal_of_movement_id)
      where reversal_of_movement_id is not null
  `);
}

export async function down(db: Knex): Promise<void> {
  await db.raw("drop index if exists stock_movements_one_reversal_idx");
  await db.schema.dropTableIfExists("inventory_stock_counts");
}
