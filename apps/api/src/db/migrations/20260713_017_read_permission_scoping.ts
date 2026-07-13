import { Knex } from "knex";

const READ_PERMISSIONS = [
  { key: "settings.view", name_ar: "عرض إعدادات التشغيل", group: "الإعدادات" },
  { key: "customers.view", name_ar: "عرض قائمة العملاء", group: "العملاء" },
] as const;

/**
 * Adds explicit read permissions and preserves the invariant that a manage
 * permission always implies its corresponding read permission, including for
 * roles created after this migration has run.
 */
export async function up(db: Knex): Promise<void> {
  await db("permissions")
    .insert(READ_PERMISSIONS)
    .onConflict("key")
    .merge(["name_ar", "group"]);

  await db.raw(`
    insert into role_permissions (role_id, permission_key)
    select distinct rp.role_id, 'settings.view'
      from role_permissions rp
     where rp.permission_key = 'settings.manage'
    on conflict (role_id, permission_key) do nothing;

    insert into role_permissions (role_id, permission_key)
    select distinct rp.role_id, 'customers.view'
      from role_permissions rp
     where rp.permission_key = 'customers.manage'
    on conflict (role_id, permission_key) do nothing;

    create or replace function ykms_grant_implied_read_permission()
    returns trigger
    language plpgsql
    as $$
    begin
      if new.permission_key = 'settings.manage' then
        insert into role_permissions (role_id, permission_key)
        values (new.role_id, 'settings.view')
        on conflict (role_id, permission_key) do nothing;
      elsif new.permission_key = 'customers.manage' then
        insert into role_permissions (role_id, permission_key)
        values (new.role_id, 'customers.view')
        on conflict (role_id, permission_key) do nothing;
      end if;
      return new;
    end;
    $$;

    drop trigger if exists role_permissions_imply_read_after_insert on role_permissions;
    create trigger role_permissions_imply_read_after_insert
      after insert on role_permissions
      for each row
      execute function ykms_grant_implied_read_permission();
  `);
}

export async function down(db: Knex): Promise<void> {
  await db.raw(`
    drop trigger if exists role_permissions_imply_read_after_insert on role_permissions;
    drop function if exists ykms_grant_implied_read_permission();
  `);
  await db("role_permissions")
    .whereIn("permission_key", READ_PERMISSIONS.map((permission) => permission.key))
    .del();
  await db("permissions")
    .whereIn("key", READ_PERMISSIONS.map((permission) => permission.key))
    .del();
}
