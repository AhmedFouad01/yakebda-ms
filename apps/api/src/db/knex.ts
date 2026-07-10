import knex, { Knex } from "knex";
import { config } from "../config";
import * as m001 from "./migrations/20260705_001_foundation";
import * as m002 from "./migrations/20260709_002_ykms_02_restaurant_mvp";
import * as m003 from "./migrations/20260709_003_ykms_02b_operational_pos";
import * as m004 from "./migrations/20260710_004_ykms_02c_settings";
import * as m005 from "./migrations/20260710_005_ykms_02d_menu_pos_os";

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
