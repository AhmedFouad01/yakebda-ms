import { Knex } from "knex";

const PERMISSIONS = [
  { key: "inventory.view", name_ar: "عرض المخزون", group: "المخزون" },
  { key: "inventory.manage", name_ar: "إدارة المخزون", group: "المخزون" },
] as const;

export async function up(db: Knex): Promise<void> {
  await db.schema.createTable("inventory_locations", (table) => {
    table.uuid("id").primary();
    table.uuid("account_id").notNullable().references("accounts.id").onDelete("RESTRICT");
    table.uuid("branch_id").notNullable().references("branches.id").onDelete("RESTRICT");
    table.string("name_ar", 120).notNullable();
    table.boolean("is_default").notNullable().defaultTo(false);
    table.boolean("is_active").notNullable().defaultTo(true);
    table.timestamps(true, true);
    table.unique(["account_id", "branch_id", "name_ar"]);
    table.index(["account_id", "branch_id", "is_active"], "inventory_locations_scope_idx");
  });
  await db.raw(`
    create unique index inventory_locations_one_default_idx
      on inventory_locations (account_id, branch_id)
      where is_default = true
  `);

  await db.schema.createTable("inventory_units", (table) => {
    table.uuid("id").primary();
    table.uuid("account_id").notNullable().references("accounts.id").onDelete("RESTRICT");
    table.string("name_ar", 80).notNullable();
    table.string("symbol", 20).notNullable();
    table.boolean("is_active").notNullable().defaultTo(true);
    table.timestamps(true, true);
    table.unique(["account_id", "symbol"]);
  });

  await db.schema.createTable("inventory_unit_conversions", (table) => {
    table.uuid("id").primary();
    table.uuid("account_id").notNullable().references("accounts.id").onDelete("RESTRICT");
    table.uuid("from_unit_id").notNullable().references("inventory_units.id").onDelete("RESTRICT");
    table.uuid("to_unit_id").notNullable().references("inventory_units.id").onDelete("RESTRICT");
    table.decimal("factor", 18, 8).notNullable();
    table.timestamps(true, true);
    table.unique(["account_id", "from_unit_id", "to_unit_id"]);
  });
  await db.raw(`
    alter table inventory_unit_conversions
      add constraint inventory_unit_conversions_factor_positive check (factor > 0),
      add constraint inventory_unit_conversions_distinct_units check (from_unit_id <> to_unit_id)
  `);

  await db.schema.createTable("inventory_items", (table) => {
    table.uuid("id").primary();
    table.uuid("account_id").notNullable().references("accounts.id").onDelete("RESTRICT");
    table.uuid("base_unit_id").notNullable().references("inventory_units.id").onDelete("RESTRICT");
    table.string("name_ar", 160).notNullable();
    table.string("sku", 80).nullable();
    table.decimal("reorder_level", 18, 6).notNullable().defaultTo(0);
    table.boolean("is_active").notNullable().defaultTo(true);
    table.timestamps(true, true);
    table.unique(["account_id", "name_ar"]);
    table.index(["account_id", "is_active", "name_ar"], "inventory_items_scope_idx");
  });
  await db.raw(`
    create unique index inventory_items_sku_unique_idx
      on inventory_items (account_id, sku)
      where sku is not null
  `);

  await db.schema.createTable("inventory_suppliers", (table) => {
    table.uuid("id").primary();
    table.uuid("account_id").notNullable().references("accounts.id").onDelete("RESTRICT");
    table.string("name_ar", 160).notNullable();
    table.string("phone", 40).nullable();
    table.boolean("is_active").notNullable().defaultTo(true);
    table.timestamps(true, true);
    table.unique(["account_id", "name_ar"]);
  });

  await db.schema.createTable("stock_movements", (table) => {
    table.uuid("id").primary();
    table.uuid("account_id").notNullable().references("accounts.id").onDelete("RESTRICT");
    table.uuid("branch_id").notNullable().references("branches.id").onDelete("RESTRICT");
    table.uuid("location_id").notNullable().references("inventory_locations.id").onDelete("RESTRICT");
    table.uuid("item_id").notNullable().references("inventory_items.id").onDelete("RESTRICT");
    table.uuid("supplier_id").nullable().references("inventory_suppliers.id").onDelete("RESTRICT");
    table.string("movement_type", 40).notNullable();
    table.decimal("quantity_base", 18, 6).notNullable();
    table.decimal("unit_cost", 18, 4).notNullable();
    table.decimal("total_value", 18, 4).notNullable();
    table.string("source_type", 60).notNullable();
    table.string("source_id", 160).nullable();
    table.string("idempotency_key", 180).notNullable();
    table.uuid("reversal_of_movement_id").nullable().references("stock_movements.id").onDelete("RESTRICT");
    table.uuid("transfer_group_id").nullable();
    table.text("reason").nullable();
    table.uuid("created_by").nullable().references("users.id").onDelete("SET NULL");
    table.timestamp("created_at").notNullable().defaultTo(db.fn.now());
    table.unique(["account_id", "idempotency_key"]);
    table.index(["account_id", "location_id", "item_id", "created_at", "id"], "stock_movements_balance_idx");
    table.index(["account_id", "source_type", "source_id"], "stock_movements_source_idx");
    table.index(["reversal_of_movement_id"], "stock_movements_reversal_idx");
  });
  await db.raw(`
    alter table stock_movements
      add constraint stock_movements_quantity_nonzero check (quantity_base <> 0),
      add constraint stock_movements_cost_nonnegative check (unit_cost >= 0),
      add constraint stock_movements_value_direction check (
        (quantity_base > 0 and total_value >= 0)
        or (quantity_base < 0 and total_value <= 0)
      ),
      add constraint stock_movements_type_check check (
        movement_type in (
          'receipt', 'issue', 'adjustment', 'transfer_in', 'transfer_out',
          'waste', 'count_adjustment', 'consumption', 'reversal'
        )
      )
  `);

  await db.raw(`
    create or replace function ykms_stock_movements_append_only()
    returns trigger
    language plpgsql
    as $$
    begin
      raise exception using
        errcode = '55000',
        message = 'Stock movements are append-only';
    end;
    $$;

    create trigger stock_movements_append_only_guard
      before update or delete on stock_movements
      for each row execute function ykms_stock_movements_append_only()
  `);

  await db("permissions").insert(PERMISSIONS).onConflict("key").ignore();
  const grants = await db("roles")
    .whereIn("key", ["owner", "admin", "manager", "inventory_clerk"])
    .select("id", "key");
  for (const role of grants) {
    const keys = role.key === "inventory_clerk" ? ["inventory.view", "inventory.manage"] : PERMISSIONS.map((p) => p.key);
    await db("role_permissions")
      .insert(keys.map((permissionKey) => ({ role_id: role.id, permission_key: permissionKey })))
      .onConflict(["role_id", "permission_key"])
      .ignore();
  }

  const branches = await db("branches").select("id", "account_id", "name");
  for (const branch of branches) {
    await db("inventory_locations").insert({
      id: db.raw("gen_random_uuid()"),
      account_id: branch.account_id,
      branch_id: branch.id,
      name_ar: `مخزون ${branch.name}`,
      is_default: true,
    });
  }
}

export async function down(db: Knex): Promise<void> {
  await db("role_permissions").whereIn("permission_key", PERMISSIONS.map((p) => p.key)).delete();
  await db("permissions").whereIn("key", PERMISSIONS.map((p) => p.key)).delete();
  await db.raw("drop trigger if exists stock_movements_append_only_guard on stock_movements");
  await db.raw("drop function if exists ykms_stock_movements_append_only()");
  await db.schema.dropTableIfExists("stock_movements");
  await db.schema.dropTableIfExists("inventory_suppliers");
  await db.schema.dropTableIfExists("inventory_items");
  await db.schema.dropTableIfExists("inventory_unit_conversions");
  await db.schema.dropTableIfExists("inventory_units");
  await db.schema.dropTableIfExists("inventory_locations");
}
