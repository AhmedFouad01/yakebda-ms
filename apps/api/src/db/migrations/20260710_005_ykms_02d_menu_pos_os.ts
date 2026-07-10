import { Knex } from "knex";

/**
 * YKMS-02D — Menu/POS operating details.
 * Adds product metadata needed by the cashier workflow and bulk menu import.
 */
export async function up(db: Knex): Promise<void> {
  await db.schema.alterTable("products", (t) => {
    t.text("ingredients_ar").nullable();
    t.string("portion_note_ar").nullable();
    t.decimal("cost_price", 10, 2).notNullable().defaultTo(0);
    t.integer("prep_time_minutes").notNullable().defaultTo(0);
  });
}

export async function down(db: Knex): Promise<void> {
  await db.schema.alterTable("products", (t) => {
    t.dropColumn("prep_time_minutes");
    t.dropColumn("cost_price");
    t.dropColumn("portion_note_ar");
    t.dropColumn("ingredients_ar");
  });
}
