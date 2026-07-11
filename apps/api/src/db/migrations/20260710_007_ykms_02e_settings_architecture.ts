import { Knex } from "knex";

/**
 * YKMS-02E — Settings Architecture / Operational Configuration.
 * - Branch operational flags (order types per branch; dine-in stays hidden/disabled).
 * - Product operational flags (POS visibility, kitchen printing, discountable, prep station).
 * - Prep stations (جريل/قلاية/تجهيز/مشروبات) + category defaults.
 * - Delivery zones + drivers (light) + order driver link.
 * - Order tax/service/rounding snapshot columns.
 * Settings values themselves live in the existing key-value `settings` table (02C).
 */
export async function up(db: Knex): Promise<void> {
  await db.schema.createTable("prep_stations", (t) => {
    t.uuid("id").primary();
    t.uuid("account_id").notNullable().references("accounts.id");
    t.string("name_ar").notNullable(); // جريل / قلاية / تجهيز / مشروبات
    t.integer("sort_order").notNullable().defaultTo(0);
    t.boolean("is_active").notNullable().defaultTo(true);
    t.timestamps(true, true);
    t.index(["account_id", "sort_order"]);
  });

  await db.schema.alterTable("branches", (t) => {
    t.string("phone").nullable();
    t.boolean("accepts_takeaway").notNullable().defaultTo(true);
    t.boolean("accepts_delivery").notNullable().defaultTo(true);
    t.boolean("dine_in_enabled").notNullable().defaultTo(false); // قرار YAKEBDA: الصالة مقفولة حاليًا
  });

  await db.schema.alterTable("products", (t) => {
    t.boolean("pos_visible").notNullable().defaultTo(true);
    t.boolean("kitchen_printable").notNullable().defaultTo(true);
    t.boolean("discountable").notNullable().defaultTo(true);
    t.uuid("prep_station_id").nullable().references("prep_stations.id").onDelete("SET NULL");
    t.string("unavailability_reason_ar").nullable();
  });

  await db.schema.alterTable("categories", (t) => {
    t.uuid("default_prep_station_id").nullable().references("prep_stations.id").onDelete("SET NULL");
    t.integer("default_prep_time_minutes").notNullable().defaultTo(0);
  });

  await db.schema.createTable("delivery_zones", (t) => {
    t.uuid("id").primary();
    t.uuid("account_id").notNullable().references("accounts.id");
    t.string("name_ar").notNullable();
    t.decimal("fee", 10, 2).notNullable().defaultTo(0);
    t.decimal("min_order", 10, 2).notNullable().defaultTo(0);
    t.boolean("is_active").notNullable().defaultTo(true);
    t.timestamps(true, true);
    t.index(["account_id"]);
  });

  await db.schema.createTable("drivers", (t) => {
    t.uuid("id").primary();
    t.uuid("account_id").notNullable().references("accounts.id");
    t.string("name").notNullable();
    t.string("phone").nullable();
    t.boolean("is_active").notNullable().defaultTo(true);
    t.timestamps(true, true);
    t.index(["account_id", "is_active"]);
  });

  await db.schema.alterTable("orders", (t) => {
    t.uuid("driver_id").nullable().references("drivers.id").onDelete("SET NULL");
    t.decimal("vat_amount", 10, 2).notNullable().defaultTo(0);
    t.decimal("service_fee", 10, 2).notNullable().defaultTo(0);
    t.decimal("rounding_adjustment", 10, 2).notNullable().defaultTo(0);
    t.string("order_prefix").nullable(); // T/D/O + بادئة عامة — snapshot وقت الإنشاء
    t.string("discount_reason").nullable();
  });
}

export async function down(db: Knex): Promise<void> {
  await db.schema.alterTable("orders", (t) => {
    t.dropColumn("discount_reason");
    t.dropColumn("order_prefix");
    t.dropColumn("rounding_adjustment");
    t.dropColumn("service_fee");
    t.dropColumn("vat_amount");
    t.dropColumn("driver_id");
  });
  await db.schema.dropTableIfExists("drivers");
  await db.schema.dropTableIfExists("delivery_zones");
  await db.schema.alterTable("categories", (t) => {
    t.dropColumn("default_prep_time_minutes");
    t.dropColumn("default_prep_station_id");
  });
  await db.schema.alterTable("products", (t) => {
    t.dropColumn("unavailability_reason_ar");
    t.dropColumn("prep_station_id");
    t.dropColumn("discountable");
    t.dropColumn("kitchen_printable");
    t.dropColumn("pos_visible");
  });
  await db.schema.alterTable("branches", (t) => {
    t.dropColumn("dine_in_enabled");
    t.dropColumn("accepts_delivery");
    t.dropColumn("accepts_takeaway");
    t.dropColumn("phone");
  });
  await db.schema.dropTableIfExists("prep_stations");
}
