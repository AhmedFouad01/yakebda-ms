import { makeKnex } from "./knex";

async function main() {
  const db = makeKnex(process.env.DATABASE_URL);
  const [batch, files] = await db.migrate.latest();
  console.log(`Migrated batch ${batch}:`, files);
  await db.destroy();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
