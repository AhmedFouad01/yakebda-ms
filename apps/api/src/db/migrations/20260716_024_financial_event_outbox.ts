import { Knex } from "knex";

const PERMISSIONS = [
  { key: "accounting.view", name_ar: "عرض الأحداث المالية", group: "الحسابات" },
  { key: "accounting.manage", name_ar: "إدارة معالجة الأحداث المالية", group: "الحسابات" },
] as const;

export async function up(db: Knex): Promise<void> {
  await db.schema.createTable("financial_events", (table) => {
    table.uuid("id").primary();
    table.uuid("account_id").notNullable().references("accounts.id").onDelete("RESTRICT");
    table.uuid("branch_id").nullable().references("branches.id").onDelete("RESTRICT");
    table.string("source_type", 60).notNullable();
    table.string("source_id", 160).notNullable();
    table.string("event_type", 80).notNullable();
    table.string("idempotency_key", 180).notNullable();
    table.integer("payload_version").notNullable().defaultTo(1);
    table.jsonb("payload").notNullable();
    table.string("status", 20).notNullable().defaultTo("pending");
    table.integer("attempts").notNullable().defaultTo(0);
    table.timestamp("next_attempt_at").nullable();
    table.text("last_error").nullable();
    table.string("claimed_by", 120).nullable();
    table.timestamp("claimed_at").nullable();
    table.timestamp("posted_at").nullable();
    table.timestamps(true, true);
    table.unique(["account_id", "idempotency_key"]);
    table.index(["status", "next_attempt_at", "created_at", "id"], "financial_events_claim_idx");
    table.index(["account_id", "source_type", "source_id"], "financial_events_source_idx");
    table.index(["account_id", "branch_id", "created_at"], "financial_events_scope_idx");
  });
  await db.raw(`
    alter table financial_events
      add constraint financial_events_status_check check (status in ('pending', 'processing', 'posted', 'failed', 'dead')),
      add constraint financial_events_attempts_nonnegative check (attempts >= 0),
      add constraint financial_events_payload_version_positive check (payload_version > 0)
  `);

  await db("permissions").insert(PERMISSIONS).onConflict("key").ignore();
  const roles = await db("roles").whereIn("key", ["owner", "admin", "manager", "accountant"]).select("id", "key");
  for (const role of roles) {
    const keys = role.key === "manager" ? ["accounting.view"] : PERMISSIONS.map((permission) => permission.key);
    await db("role_permissions")
      .insert(keys.map((permissionKey) => ({ role_id: role.id, permission_key: permissionKey })))
      .onConflict(["role_id", "permission_key"])
      .ignore();
  }
}

export async function down(db: Knex): Promise<void> {
  await db("role_permissions").whereIn("permission_key", PERMISSIONS.map((permission) => permission.key)).delete();
  await db("permissions").whereIn("key", PERMISSIONS.map((permission) => permission.key)).delete();
  await db.schema.dropTableIfExists("financial_events");
}
