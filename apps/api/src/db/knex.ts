import knex, { Knex } from "knex";
import { config } from "../config";
import * as m001 from "./migrations/20260705_001_foundation";
import * as m002 from "./migrations/20260709_002_ykms_02_restaurant_mvp";
import * as m003 from "./migrations/20260709_003_ykms_02b_operational_pos";
import * as m004 from "./migrations/20260710_004_ykms_02c_settings";
import * as m005 from "./migrations/20260710_005_ykms_02d_menu_pos_os";
import * as m006 from "./migrations/20260710_006_ykms_02d_menu_cleanup";
import * as m007 from "./migrations/20260710_007_ykms_02e_settings_architecture";
import * as m008 from "./migrations/20260710_008_ykms_02f_operational_ui";
import * as m009 from "./migrations/20260711_009_ykms_02g_bread_type";
import * as m010 from "./migrations/20260711_010_ykms_02g_crm";
import * as m011 from "./migrations/20260712_011_security_scope_stabilization";
import * as m012 from "./migrations/20260712_012_order_integrity_stabilization";
import * as m013 from "./migrations/20260712_013_order_sources_price_lists";
import * as m014 from "./migrations/20260712_014_delivery_checkout_context";
import * as m015 from "./migrations/20260713_015_payment_integrity";
import * as m016 from "./migrations/20260713_016_auth_lockout";
import * as m017 from "./migrations/20260713_017_read_permission_scoping";
import * as m018 from "./migrations/20260713_018_print_job_reliability";
import * as m019 from "./migrations/20260713_019_refunds_shift_variance";
import * as m020 from "./migrations/20260716_020_cursor_pagination_indexes";
import * as m021 from "./migrations/20260716_021_inventory_foundation";
import * as m022 from "./migrations/20260716_022_inventory_recipes_consumption";

/**
 * Migrations are registered in code (migrationSource) so they run identically
 * under tsx, vitest and a compiled build without loader issues.
 */
const MIGRATIONS: Record<string, { up: (db: Knex) => Promise<void>; down: (db: Knex) => Promise<void> }> = {
  "20260705_001_foundation": m001,
  "20260709_002_ykms_02_restaurant_mvp": m002,
  "20260709_003_ykms_02b_operational_pos": m003,
  "20260710_004_ykms_02c_settings": m004,
  "20260710_005_ykms_02d_menu_pos_os": m005,
  "20260710_006_ykms_02d_menu_cleanup": m006,
  "20260710_007_ykms_02e_settings_architecture": m007,
  "20260710_008_ykms_02f_operational_ui": m008,
  "20260711_009_ykms_02g_bread_type": m009,
  "20260711_010_ykms_02g_crm": m010,
  "20260712_011_security_scope_stabilization": m011,
  "20260712_012_order_integrity_stabilization": m012,
  "20260712_013_order_sources_price_lists": m013,
  "20260712_014_delivery_checkout_context": m014,
  "20260713_015_payment_integrity": m015,
  "20260713_016_auth_lockout": m016,
  "20260713_017_read_permission_scoping": m017,
  "20260713_018_print_job_reliability": m018,
  "20260713_019_refunds_shift_variance": m019,
  "20260716_020_cursor_pagination_indexes": m020,
  "20260716_021_inventory_foundation": m021,
  "20260716_022_inventory_recipes_consumption": m022,
};

const migrationSource: Knex.MigrationSource<string> = {
  getMigrations: async () => Object.keys(MIGRATIONS),
  getMigrationName: (name) => name,
  getMigration: async (name) => MIGRATIONS[name],
};

export function makeKnex(connection?: string): Knex {
  return knex({
    client: "pg",
    connection:
      connection ??
      (process.env.NODE_ENV === "test" ? config.testDatabaseUrl : config.databaseUrl),
    migrations: { migrationSource },
    pool: { min: 0, max: 10 },
  });
}

export const db = makeKnex();
