import { createApp } from "./app";
import { db } from "./db/knex";
import { config } from "./config";
import { createStructuredLogger, unexpectedErrorFields } from "./lib/observability";

const logger = createStructuredLogger();

async function main() {
  await db.migrate.latest();
  const app = createApp(db);
  app.listen(config.port, () => {
    logger.write({
      timestamp: new Date().toISOString(),
      level: "info",
      event: "api.started",
      port: config.port,
    });
  });
}
main().catch((e) => {
  logger.write({
    timestamp: new Date().toISOString(),
    level: "error",
    event: "api.start_failed",
    ...unexpectedErrorFields(e),
  });
  process.exit(1);
});
