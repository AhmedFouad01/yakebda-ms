import { Knex } from "knex";

const PERMISSION = { key: "kitchen.manage", name_ar: "إيقاف/استئناف المطبخ", group: "المطبخ" } as const;
export const HOLD_REASONS = ["equipment_issue", "ingredient_shortage", "customer_request", "quality_check", "other"] as const;

/**
 * ADR-005 — Kitchen Pause & Order Hold.
 * Branch pause state is a single row per (account, branch), created lazily on
 * first pause. Order holds are append-only periods; a partial unique index
 * guarantees at most one ACTIVE hold per order while preserving history.
 * down() is local-safe only: it discards pause/hold operational history
 * (audit_logs rows survive) — see ADR-005 rollback notes.
 */
export async function up(db: Knex): Promise<void> {
  await db.schema.createTable("kitchen_branch_states", (t) => {
    t.uuid("id").primary();
    t.uuid("account_id").notNullable().references("id").inTable("accounts").onDelete("cascade");
    t.uuid("branch_id").notNullable().references("id").inTable("branches").onDelete("cascade");
    t.boolean("is_paused").notNullable().defaultTo(false);
    t.timestamp("paused_at").nullable();
    t.uuid("paused_by").nullable().references("id").inTable("users");
    t.string("pause_reason", 300).nullable();
    t.timestamp("resumed_at").nullable();
    t.uuid("resumed_by").nullable().references("id").inTable("users");
    // Optimistic counter; writers also take FOR UPDATE on the row.
    t.integer("version").notNullable().defaultTo(0);
    // Idempotent replay detection for the last transition in each direction.
    t.string("last_pause_key", 180).nullable();
    t.string("last_resume_key", 180).nullable();
    t.timestamps(true, true);
    t.unique(["account_id", "branch_id"]);
  });

  await db.schema.createTable("kitchen_order_holds", (t) => {
    t.uuid("id").primary();
    t.uuid("account_id").notNullable().references("id").inTable("accounts").onDelete("cascade");
    t.uuid("branch_id").notNullable().references("id").inTable("branches");
    t.uuid("order_id").notNullable().references("id").inTable("orders").onDelete("cascade");
    t.string("reason_code", 40).notNullable();
    t.string("reason_note", 500).nullable();
    t.timestamp("held_at").notNullable().defaultTo(db.fn.now());
    t.uuid("held_by").notNullable().references("id").inTable("users");
    t.timestamp("resumed_at").nullable();
    t.uuid("resumed_by").nullable().references("id").inTable("users");
    t.string("hold_key", 180).notNullable();
    t.string("resume_key", 180).nullable();
    t.timestamp("created_at").notNullable().defaultTo(db.fn.now());
    t.index(["account_id", "order_id"]);
  });

  await db.raw(
    `alter table kitchen_order_holds add constraint kitchen_order_holds_reason_chk
       check (reason_code in ('${HOLD_REASONS.join("','")}'))`
  );
  await db.raw(
    `alter table kitchen_order_holds add constraint kitchen_order_holds_other_note_chk
       check (reason_code <> 'other' or (reason_note is not null and length(trim(reason_note)) > 0))`
  );
  // At most one ACTIVE hold per order; full history retained.
  await db.raw(
    `create unique index kitchen_order_holds_active_uq
       on kitchen_order_holds (order_id) where resumed_at is null`
  );

  await db("permissions").insert(PERMISSION).onConflict("key").merge(["name_ar", "group"]);
  // ADR-005 default role mapping: owner/admin only. Other roles by deliberate grant.
  await db.raw(`
    insert into role_permissions (role_id, permission_key)
    select r.id, '${PERMISSION.key}'
      from roles r
     where r.key in ('owner', 'admin')
    on conflict (role_id, permission_key) do nothing;
  `);
}

export async function down(db: Knex): Promise<void> {
  await db("role_permissions").where({ permission_key: PERMISSION.key }).del();
  await db("permissions").where({ key: PERMISSION.key }).del();
  await db.schema.dropTableIfExists("kitchen_order_holds");
  await db.schema.dropTableIfExists("kitchen_branch_states");
}
