import { Knex } from "knex";

/**
 * YKMS-02 — Restaurant MVP schema: Menu Core, Orders/POS, Kitchen, Tables (light),
 * Customers (light), Payments. Foundation tables (20260705_001) are untouched.
 */
export async function up(db: Knex): Promise<void> {
  // ---------- Menu Core ----------
  await db.schema.createTable("categories", (t) => {
    t.uuid("id").primary();
    t.uuid("account_id").notNullable().references("accounts.id");
    t.string("name_ar").notNullable();
    t.string("name_en").nullable();
    t.text("description_ar").nullable();
    t.integer("sort_order").notNullable().defaultTo(0);
    t.boolean("is_active").notNullable().defaultTo(true);
    t.timestamps(true, true);
    t.index(["account_id", "sort_order"]);
  });

  await db.schema.createTable("products", (t) => {
    t.uuid("id").primary();
    t.uuid("account_id").notNullable().references("accounts.id");
    t.uuid("category_id").notNullable().references("categories.id");
    t.string("name_ar").notNullable();
    t.string("name_en").nullable();
    t.text("description_ar").nullable();
    t.string("sku").nullable();
    t.decimal("base_price", 10, 2).notNullable().defaultTo(0);
    t.string("image_url").nullable();
    t.integer("sort_order").notNullable().defaultTo(0);
    t.boolean("is_active").notNullable().defaultTo(true);
    t.timestamps(true, true);
    t.index(["account_id"]);
    t.index(["category_id", "sort_order"]);
  });

  await db.schema.createTable("product_variants", (t) => {
    t.uuid("id").primary();
    t.uuid("product_id").notNullable().references("products.id").onDelete("CASCADE");
    t.string("name_ar").notNullable();
    t.decimal("price_delta", 10, 2).notNullable().defaultTo(0);
    t.boolean("is_active").notNullable().defaultTo(true);
    t.timestamps(true, true);
    t.index(["product_id"]);
  });

  await db.schema.createTable("modifier_groups", (t) => {
    t.uuid("id").primary();
    t.uuid("account_id").notNullable().references("accounts.id");
    t.string("name_ar").notNullable();
    t.integer("min_select").notNullable().defaultTo(0);
    t.integer("max_select").notNullable().defaultTo(1);
    t.boolean("is_required").notNullable().defaultTo(false);
    t.integer("sort_order").notNullable().defaultTo(0);
    t.boolean("is_active").notNullable().defaultTo(true);
    t.timestamps(true, true);
    t.index(["account_id"]);
  });

  await db.schema.createTable("modifiers", (t) => {
    t.uuid("id").primary();
    t.uuid("modifier_group_id").notNullable().references("modifier_groups.id").onDelete("CASCADE");
    t.string("name_ar").notNullable();
    t.decimal("price_delta", 10, 2).notNullable().defaultTo(0);
    t.boolean("is_active").notNullable().defaultTo(true);
    t.timestamps(true, true);
    t.index(["modifier_group_id"]);
  });

  await db.schema.createTable("product_modifier_groups", (t) => {
    t.uuid("product_id").notNullable().references("products.id").onDelete("CASCADE");
    t.uuid("modifier_group_id").notNullable().references("modifier_groups.id").onDelete("CASCADE");
    t.integer("sort_order").notNullable().defaultTo(0);
    t.primary(["product_id", "modifier_group_id"]);
  });

  await db.schema.createTable("branch_product_prices", (t) => {
    t.uuid("branch_id").notNullable().references("branches.id").onDelete("CASCADE");
    t.uuid("product_id").notNullable().references("products.id").onDelete("CASCADE");
    t.decimal("price_override", 10, 2).nullable();
    t.primary(["branch_id", "product_id"]);
    t.index(["branch_id"]);
  });

  await db.schema.createTable("branch_product_availability", (t) => {
    t.uuid("branch_id").notNullable().references("branches.id").onDelete("CASCADE");
    t.uuid("product_id").notNullable().references("products.id").onDelete("CASCADE");
    t.boolean("is_available").notNullable().defaultTo(true);
    t.integer("available_count").nullable();
    t.string("availability_note_ar").nullable();
    t.primary(["branch_id", "product_id"]);
    t.index(["branch_id"]);
  });

  // ---------- Tables (light) ----------
  await db.schema.createTable("dining_tables", (t) => {
    t.uuid("id").primary();
    t.uuid("branch_id").notNullable().references("branches.id").onDelete("CASCADE");
    t.string("name_ar").notNullable(); // e.g. طاولة 1
    t.integer("seats").notNullable().defaultTo(4);
    t.string("status").notNullable().defaultTo("available"); // available | occupied | reserved | cleaning
    t.boolean("is_active").notNullable().defaultTo(true);
    t.timestamps(true, true);
    t.index(["branch_id", "status"]);
  });

  // ---------- Customers (light) ----------
  await db.schema.createTable("customers", (t) => {
    t.uuid("id").primary();
    t.uuid("account_id").notNullable().references("accounts.id");
    t.string("name").notNullable();
    t.string("phone").nullable();
    t.text("address").nullable();
    t.text("notes").nullable();
    t.timestamps(true, true);
    t.index(["account_id"]);
    t.index(["phone"]);
  });

  // ---------- Orders / POS ----------
  await db.schema.createTable("orders", (t) => {
    t.uuid("id").primary();
    t.uuid("account_id").notNullable().references("accounts.id");
    t.uuid("branch_id").notNullable().references("branches.id");
    t.integer("order_no").notNullable(); // sequential per branch
    t.string("order_type").notNullable().defaultTo("takeaway"); // dine_in | takeaway | delivery
    t.string("status").notNullable().defaultTo("draft"); // draft | submitted | in_kitchen | ready | completed | cancelled
    t.uuid("table_id").nullable().references("dining_tables.id");
    t.uuid("customer_id").nullable().references("customers.id");
    t.text("delivery_address").nullable();
    t.decimal("delivery_fee", 10, 2).notNullable().defaultTo(0);
    t.decimal("subtotal", 10, 2).notNullable().defaultTo(0);
    t.decimal("discount", 10, 2).notNullable().defaultTo(0);
    t.decimal("total", 10, 2).notNullable().defaultTo(0);
    t.text("notes").nullable();
    t.uuid("created_by").nullable().references("users.id");
    t.string("cancel_reason").nullable();
    t.timestamp("submitted_at").nullable();
    t.timestamp("completed_at").nullable();
    t.timestamps(true, true);
    t.unique(["branch_id", "order_no"]);
    t.index(["account_id", "status"]);
    t.index(["branch_id", "status"]);
    t.index(["created_at"]);
  });

  await db.schema.createTable("order_items", (t) => {
    t.uuid("id").primary();
    t.uuid("order_id").notNullable().references("orders.id").onDelete("CASCADE");
    t.uuid("product_id").notNullable().references("products.id");
    t.uuid("variant_id").nullable().references("product_variants.id");
    t.string("name_ar").notNullable(); // snapshot at sale time
    t.string("variant_name_ar").nullable();
    t.integer("qty").notNullable().defaultTo(1);
    t.decimal("unit_price", 10, 2).notNullable(); // base + variant + modifiers, snapshot
    t.decimal("line_total", 10, 2).notNullable();
    t.text("notes").nullable();
    t.string("kitchen_status").notNullable().defaultTo("new"); // new | preparing | ready | served
    t.timestamps(true, true);
    t.index(["order_id"]);
    t.index(["product_id"]);
  });

  await db.schema.createTable("order_item_modifiers", (t) => {
    t.uuid("id").primary();
    t.uuid("order_item_id").notNullable().references("order_items.id").onDelete("CASCADE");
    t.uuid("modifier_id").notNullable().references("modifiers.id");
    t.string("name_ar").notNullable(); // snapshot
    t.decimal("price_delta", 10, 2).notNullable().defaultTo(0);
    t.index(["order_item_id"]);
  });

  await db.schema.createTable("payments", (t) => {
    t.uuid("id").primary();
    t.uuid("order_id").notNullable().references("orders.id").onDelete("CASCADE");
    t.uuid("branch_id").notNullable().references("branches.id");
    t.string("method").notNullable(); // cash | card | wallet | unpaid
    t.decimal("amount", 10, 2).notNullable();
    t.uuid("received_by").nullable().references("users.id");
    t.timestamp("created_at").notNullable().defaultTo(db.fn.now());
    t.index(["order_id"]);
    t.index(["branch_id", "created_at"]);
  });

  await db.schema.createTable("order_status_history", (t) => {
    t.uuid("id").primary();
    t.uuid("order_id").notNullable().references("orders.id").onDelete("CASCADE");
    t.string("from_status").nullable();
    t.string("to_status").notNullable();
    t.uuid("changed_by").nullable().references("users.id");
    t.timestamp("created_at").notNullable().defaultTo(db.fn.now());
    t.index(["order_id"]);
  });
}

export async function down(db: Knex): Promise<void> {
  const tables = [
    "order_status_history",
    "payments",
    "order_item_modifiers",
    "order_items",
    "orders",
    "customers",
    "dining_tables",
    "branch_product_availability",
    "branch_product_prices",
    "product_modifier_groups",
    "modifiers",
    "modifier_groups",
    "product_variants",
    "products",
    "categories",
  ];
  for (const t of tables) await db.schema.dropTableIfExists(t);
}
