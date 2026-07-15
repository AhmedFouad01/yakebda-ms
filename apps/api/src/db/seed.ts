import { makeKnex } from "./knex";
import { seedFoundation } from "./seedData";
import { createStructuredLogger, unexpectedErrorFields } from "../lib/observability";

const logger = createStructuredLogger();

async function main() {
  const db = makeKnex(process.env.DATABASE_URL);
  const result = await seedFoundation(db);
  logger.write({
    timestamp: new Date().toISOString(),
    level: "info",
    event: "database.seed.completed",
    account_id: result.accountId,
    branch_id: result.branchId,
  });
  await db.destroy();
}
main().catch((e) => {
  logger.write({
    timestamp: new Date().toISOString(),
    level: "error",
    event: "database.seed.failed",
    ...unexpectedErrorFields(e),
  });
  process.exit(1);
});
