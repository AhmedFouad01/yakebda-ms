import { createApp } from "./app";
import { db } from "./db/knex";
import { config } from "./config";

async function main() {
  await db.migrate.latest();
  const app = createApp(db);
  app.listen(config.port, () => {
    console.log(`YAKEBDA MS API v1 يعمل على المنفذ ${config.port}`);
  });
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
