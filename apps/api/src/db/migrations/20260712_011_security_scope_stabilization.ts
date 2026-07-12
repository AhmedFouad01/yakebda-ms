import { Knex } from "knex";
import { syncPermissionCatalog } from "../seedData";

/**
 * Security stabilization:
 * - adds customers.lookup for least-privilege POS customer search;
 * - removes full CRM management from the system cashier role;
 * - grants lookup to operational and administrative system roles.
 */
export async function up(db: Knex): Promise<void> {
  await syncPermissionCatalog(db);

  const lookupRoles = await db("roles")
    .where({ is_system: true })
    .whereIn("key", ["cashier", "manager", "owner", "admin"]);

  for (const role of lookupRoles) {
    await db("role_permissions")
      .insert({ role_id: role.id, permission_key: "customers.lookup" })
      .onConflict(["role_id", "permission_key"])
      .ignore();
  }

  const cashierRoles = await db("roles").where({ is_system: true, key: "cashier" });
  for (const role of cashierRoles) {
    await db("role_permissions")
      .where({ role_id: role.id, permission_key: "customers.manage" })
      .del();
  }
}

export async function down(db: Knex): Promise<void> {
  const cashierRoles = await db("roles").where({ is_system: true, key: "cashier" });
  for (const role of cashierRoles) {
    await db("role_permissions")
      .insert({ role_id: role.id, permission_key: "customers.manage" })
      .onConflict(["role_id", "permission_key"])
      .ignore();
  }

  await db("role_permissions").where({ permission_key: "customers.lookup" }).del();
  await db("permissions").where({ key: "customers.lookup" }).del();
}
