import { Knex } from "knex";

/**
 * YKMS-02D polish:
 * - normalize sandwich sizes to لقمة / هامر
 * - remove invented sauce/chili option groups from active POS menu without breaking old order snapshots
 * - hide dine-in operationally by converting existing sample dine-in orders to takeaway
 */
export async function up(db: Knex): Promise<void> {
  await db("product_variants").where({ name_ar: "صغير" }).update({ name_ar: "لقمة", updated_at: db.fn.now() });
  await db("product_variants").where({ name_ar: "كبير" }).update({ name_ar: "هامر", updated_at: db.fn.now() });
  await db("order_items").where({ variant_name_ar: "صغير" }).update({ variant_name_ar: "لقمة", updated_at: db.fn.now() });
  await db("order_items").where({ variant_name_ar: "كبير" }).update({ variant_name_ar: "هامر", updated_at: db.fn.now() });

  const sauceGroups = await db("modifier_groups").whereIn("name_ar", ["الشطة والصوص", "الصوص والشطة"]).select("id");
  const sauceGroupIds = sauceGroups.map((g) => g.id);
  if (sauceGroupIds.length) {
    // Do not delete modifiers referenced by historical order_item_modifiers.
    // Detach these option groups from products and mark them inactive so they disappear from POS.
    await db("product_modifier_groups").whereIn("modifier_group_id", sauceGroupIds).del();
    await db("modifiers").whereIn("modifier_group_id", sauceGroupIds).update({ is_active: false, updated_at: db.fn.now() });
    await db("modifier_groups").whereIn("id", sauceGroupIds).update({ is_active: false, updated_at: db.fn.now() });
  }

  await db("orders").where({ order_type: "dine_in" }).update({ order_type: "takeaway", table_id: null, updated_at: db.fn.now() });
  await db("dining_tables").update({ status: "available", updated_at: db.fn.now() });
}

export async function down(_db: Knex): Promise<void> {
  // Irreversible data cleanup.
}
