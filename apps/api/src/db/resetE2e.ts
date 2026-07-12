import { makeKnex } from "./knex";
import { seedFoundation } from "./seedData";

/**
 * Deterministic database reset used only by Playwright/CI.
 * It never runs from the application runtime.
 */
async function main() {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("E2E reset is allowed only when NODE_ENV=test");
  }

  const db = makeKnex(process.env.DATABASE_URL);
  try {
    await db.migrate.rollback(undefined, true);
    await db.migrate.latest();
    const seed = await seedFoundation(db);
    console.log(`E2E database ready for ${seed.ownerEmail}`);
  } finally {
    await db.destroy();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
