import { Knex } from "knex";

/** Delivery checkout context selected at sale time. */
export async function up(db: Knex): Promise<void> {
  await db.schema.alterTable("orders", (t) => {
    t.uuid("delivery_zone_id").nullable().references("delivery_zones.id").onDelete("SET NULL");
    t.string("delivery_zone_name_snapshot").nullable();
    t.string("delivery_phone_snapshot").nullable();
    t.index(["delivery_zone_id"]);
  });
}

export async function down(db: Knex): Promise<void> {
  await db.schema.alterTable("orders", (t) => {
    t.dropIndex(["delivery_zone_id"]);
    t.dropColumn("delivery_phone_snapshot");
    t.dropColumn("delivery_zone_name_snapshot");
    t.dropColumn("delivery_zone_id");
  });
}
