import { createApp } from "./app";
import { db } from "./db/knex";
import { config } from "./config";
import { createStructuredLogger, unexpectedErrorFields } from "./lib/observability";
import { YakebdaSccIntegration } from "./scc/integration";

const logger = createStructuredLogger();

async function main() {
  await db.migrate.latest();
  const sccIntegration = new YakebdaSccIntegration(db);
  await sccIntegration.start();
  const app = createApp(db, { sccIntegration });
  const server = app.listen(config.port, () => {
    logger.write({
      timestamp: new Date().toISOString(),
      level: "info",
      event: "api.started",
      port: config.port,
    });
  });
  const shutdown = () => { void sccIntegration.stop().finally(() => server.close(() => void db.destroy())); };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
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
