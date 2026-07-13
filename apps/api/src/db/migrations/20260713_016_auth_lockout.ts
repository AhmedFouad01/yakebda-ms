import { Knex } from "knex";

/** Persistent account lock state for password and PIN authentication. */
export async function up(db: Knex): Promise<void> {
  const hasFailedCount = await db.schema.hasColumn("users", "failed_login_count");
  const hasLockedUntil = await db.schema.hasColumn("users", "locked_until");

  await db.schema.alterTable("users", (table) => {
    if (!hasFailedCount) {
      table.integer("failed_login_count").notNullable().defaultTo(0);
    }
    if (!hasLockedUntil) {
      table.timestamp("locked_until", { useTz: true }).nullable();
    }
  });
}

export async function down(db: Knex): Promise<void> {
  const hasFailedCount = await db.schema.hasColumn("users", "failed_login_count");
  const hasLockedUntil = await db.schema.hasColumn("users", "locked_until");

  await db.schema.alterTable("users", (table) => {
    if (hasLockedUntil) table.dropColumn("locked_until");
    if (hasFailedCount) table.dropColumn("failed_login_count");
  });
}
