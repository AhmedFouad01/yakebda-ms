import knex, { Knex } from "knex";
import { config } from "../config";
import * as m001 from "./migrations/20260705_001_foundation";
import * as m002 from "./migrations/20260709_002_ykms_02_restaurant_mvp";

/**
 * Migrations are registered in code (migrationSource) so they run identically
 * under tsx, vitest and a compiled build without loader issues.
 */
const MIGRATIONS: Record<string, { up: (db: Knex) => Promise<void>; down: (db: Knex) => Promise<void> }> = {
  "20260705_001_foundation": m001,
  "20260709_002_ykms_02_restaurant_mvp": m002,
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
