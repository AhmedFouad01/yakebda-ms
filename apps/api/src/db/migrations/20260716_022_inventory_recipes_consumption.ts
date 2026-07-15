import { Knex } from "knex";

export async function up(db: Knex): Promise<void> {
  await db.schema.createTable("inventory_recipes", (table) => {
    table.uuid("id").primary();
    table.uuid("account_id").notNullable().references("accounts.id").onDelete("RESTRICT");
    table.uuid("product_id").notNullable().references("products.id").onDelete("RESTRICT");
    table.uuid("variant_id").nullable().references("product_variants.id").onDelete("RESTRICT");
    table.integer("version").notNullable();
    table.string("status", 20).notNullable().defaultTo("draft");
    table.uuid("created_by").nullable().references("users.id").onDelete("SET NULL");
    table.timestamp("activated_at").nullable();
    table.timestamps(true, true);
    table.index(["account_id", "product_id", "variant_id", "status"], "inventory_recipes_lookup_idx");
  });
  await db.raw(`
    alter table inventory_recipes
      add constraint inventory_recipes_version_positive check (version > 0),
      add constraint inventory_recipes_status_check check (status in ('draft', 'active', 'retired'));
    create unique index inventory_recipes_version_unique_idx
      on inventory_recipes (account_id, product_id, coalesce(variant_id, '00000000-0000-0000-0000-000000000000'::uuid), version);
    create unique index inventory_recipes_one_active_idx
      on inventory_recipes (account_id, product_id, coalesce(variant_id, '00000000-0000-0000-0000-000000000000'::uuid))
      where status = 'active'
  `);

  await db.schema.createTable("inventory_recipe_items", (table) => {
    table.uuid("id").primary();
    table.uuid("recipe_id").notNullable().references("inventory_recipes.id").onDelete("CASCADE");
    table.uuid("inventory_item_id").notNullable().references("inventory_items.id").onDelete("RESTRICT");
    table.decimal("quantity_base", 18, 6).notNullable();
    table.unique(["recipe_id", "inventory_item_id"]);
  });
  await db.raw("alter table inventory_recipe_items add constraint inventory_recipe_items_quantity_positive check (quantity_base > 0)");

  await db.schema.createTable("inventory_consumption_events", (table) => {
    table.uuid("id").primary();
    table.uuid("account_id").notNullable().references("accounts.id").onDelete("RESTRICT");
    table.uuid("branch_id").notNullable().references("branches.id").onDelete("RESTRICT");
    table.uuid("location_id").notNullable().references("inventory_locations.id").onDelete("RESTRICT");
    table.uuid("order_id").notNullable().references("orders.id").onDelete("RESTRICT");
    table.string("event_type", 30).notNullable();
    table.string("idempotency_key", 180).notNullable();
    table.integer("payload_version").notNullable().defaultTo(1);
    table.jsonb("payload").notNullable();
    table.string("status", 20).notNullable().defaultTo("pending");
    table.integer("attempts").notNullable().defaultTo(0);
    table.timestamp("next_attempt_at").nullable();
    table.text("last_error").nullable();
    table.uuid("reverses_event_id").nullable().references("inventory_consumption_events.id").onDelete("RESTRICT");
    table.uuid("created_by").nullable().references("users.id").onDelete("SET NULL");
    table.timestamp("processed_at").nullable();
    table.timestamps(true, true);
    table.unique(["account_id", "idempotency_key"]);
    table.index(["account_id", "order_id", "event_type"], "inventory_consumption_order_idx");
    table.index(["status", "next_attempt_at", "created_at"], "inventory_consumption_retry_idx");
  });
  await db.raw(`
    alter table inventory_consumption_events
      add constraint inventory_consumption_event_type_check check (event_type in ('consume', 'reverse')),
      add constraint inventory_consumption_event_status_check check (status in ('pending', 'processing', 'posted', 'failed', 'dead')),
      add constraint inventory_consumption_payload_version_positive check (payload_version > 0)
  `);

  await db.schema.createTable("inventory_consumption_event_items", (table) => {
    table.uuid("id").primary();
    table.uuid("event_id").notNullable().references("inventory_consumption_events.id").onDelete("CASCADE");
    table.uuid("order_item_id").nullable().references("order_items.id").onDelete("RESTRICT");
    table.uuid("product_id").notNullable().references("products.id").onDelete("RESTRICT");
    table.uuid("variant_id").nullable().references("product_variants.id").onDelete("RESTRICT");
    table.uuid("recipe_id").nullable().references("inventory_recipes.id").onDelete("RESTRICT");
    table.integer("recipe_version").nullable();
    table.uuid("inventory_item_id").notNullable().references("inventory_items.id").onDelete("RESTRICT");
    table.decimal("quantity_base", 18, 6).notNullable();
    table.uuid("reverses_movement_id").nullable().references("stock_movements.id").onDelete("RESTRICT");
    table.uuid("stock_movement_id").nullable().references("stock_movements.id").onDelete("RESTRICT");
    table.index(["event_id"]);
  });
  await db.raw("alter table inventory_consumption_event_items add constraint inventory_consumption_items_quantity_positive check (quantity_base > 0)");
}

export async function down(db: Knex): Promise<void> {
  await db.schema.dropTableIfExists("inventory_consumption_event_items");
  await db.schema.dropTableIfExists("inventory_consumption_events");
  await db.schema.dropTableIfExists("inventory_recipe_items");
  await db.schema.dropTableIfExists("inventory_recipes");
}
