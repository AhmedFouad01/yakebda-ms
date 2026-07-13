import { randomUUID } from "crypto";
import { Knex } from "knex";

/**
 * YKMS-02H — Order sources and source-specific product rules.
 *
 * A source is an operational sales channel (counter, phone, app, aggregator).
 * Products remain canonical; sources only store availability and price overrides.
 */
export async function up(db: Knex): Promise<void> {
  await db.schema.createTable("order_sources", (t) => {
    t.uuid("id").primary();
    t.uuid("account_id").notNullable().references("accounts.id").onDelete("CASCADE");
    t.string("code").notNullable();
    t.string("name_ar").notNullable();
    t.boolean("is_active").notNullable().defaultTo(true);
    t.boolean("supports_takeaway").notNullable().defaultTo(true);
    t.boolean("supports_delivery").notNullable().defaultTo(true);
    t.integer("sort_order").notNullable().defaultTo(0);
    t.timestamps(true, true);
    t.unique(["account_id", "code"]);
    t.index(["account_id", "is_active", "sort_order"]);
  });

  await db.schema.createTable("source_product_rules", (t) => {
    t.uuid("source_id").notNullable().references("order_sources.id").onDelete("CASCADE");
    t.uuid("product_id").notNullable().references("products.id").onDelete("CASCADE");
    t.decimal("price_override", 10, 2).nullable();
    t.boolean("is_available").notNullable().defaultTo(true);
    t.timestamps(true, true);
    t.primary(["source_id", "product_id"]);
    t.index(["product_id"]);
  });

  await db.schema.alterTable("orders", (t) => {
    t.uuid("source_id").nullable().references("order_sources.id").onDelete("SET NULL");
    t.string("source_name_snapshot").nullable();
    t.index(["source_id"]);
  });

  const accounts = await db("accounts").select("id");
  for (const account of accounts) {
    await db("order_sources")
      .insert({
        id: randomUUID(),
        account_id: account.id,
        code: "direct",
        name_ar: "طلب مباشر",
        is_active: true,
        supports_takeaway: true,
        supports_delivery: true,
        sort_order: 0,
      })
      .onConflict(["account_id", "code"])
      .ignore();
  }
}

export async function down(db: Knex): Promise<void> {
  await db.schema.alterTable("orders", (t) => {
    t.dropIndex(["source_id"]);
    t.dropColumn("source_name_snapshot");
    t.dropColumn("source_id");
  });
  await db.schema.dropTableIfExists("source_product_rules");
  await db.schema.dropTableIfExists("order_sources");
}
