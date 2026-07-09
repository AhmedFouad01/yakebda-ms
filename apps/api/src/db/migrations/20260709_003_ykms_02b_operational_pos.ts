import { Knex } from "knex";

/**
 * YKMS-02B — Operational POS Core
 * Adds cashier shifts/cash movements and links payments to shifts.
 */
export async function up(db: Knex): Promise<void> {
  await db.schema.createTable("shifts", (t) => {
    t.uuid("id").primary();
    t.uuid("account_id").notNullable().references("accounts.id");
    t.uuid("branch_id").notNullable().references("branches.id");
    t.uuid("cashier_user_id").notNullable().references("users.id");
    t.timestamp("opened_at").notNullable().defaultTo(db.fn.now());
    t.timestamp("closed_at").nullable();
    t.decimal("opening_cash", 10, 2).notNullable().defaultTo(0);
    t.decimal("closing_cash", 10, 2).nullable();
    t.decimal("expected_cash", 10, 2).nullable();
    t.decimal("actual_cash", 10, 2).nullable();
    t.string("status").notNullable().defaultTo("open"); // open | closed
    t.text("notes").nullable();
    t.timestamps(true, true);
    t.index(["account_id", "status"]);
    t.index(["branch_id", "status"]);
    t.index(["cashier_user_id", "status"]);
  });

  await db.schema.createTable("shift_cash_movements", (t) => {
    t.uuid("id").primary();
    t.uuid("shift_id").notNullable().references("shifts.id").onDelete("CASCADE");
    t.string("type").notNullable(); // cash_in | cash_out
    t.decimal("amount", 10, 2).notNullable();
    t.string("reason").notNullable();
    t.uuid("created_by").nullable().references("users.id");
    t.timestamp("created_at").notNullable().defaultTo(db.fn.now());
    t.index(["shift_id", "created_at"]);
  });

  await db.schema.table("payments", (t) => {
    t.uuid("shift_id").nullable().references("shifts.id").onDelete("SET NULL");
    t.index(["shift_id"]);
  });
}

export async function down(db: Knex): Promise<void> {
  await db.schema.table("payments", (t) => {
    t.dropIndex(["shift_id"]);
    t.dropColumn("shift_id");
  });
  await db.schema.dropTableIfExists("shift_cash_movements");
  await db.schema.dropTableIfExists("shifts");
}
