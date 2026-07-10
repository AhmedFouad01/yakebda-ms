import { Knex } from "knex";

/**
 * YKMS-02C — Settings module only.
 * Shifts already exist in 20260709_003_ykms_02b_operational_pos.
 */
export async function up(db: Knex): Promise<void> {
  await db.schema.createTable("settings", (t) => {
    t.uuid("id").primary();
    t.uuid("account_id").notNullable().references("accounts.id");
    t.uuid("branch_id").nullable().references("branches.id").onDelete("CASCADE"); // null = account-level
    t.string("key").notNullable();
    t.jsonb("value").notNullable();
    t.timestamps(true, true);
    t.unique(["account_id", "branch_id", "key"]);
    t.index(["account_id", "branch_id"]);
  });
}

export async function down(db: Knex): Promise<void> {
  await db.schema.dropTableIfExists("settings");
}
