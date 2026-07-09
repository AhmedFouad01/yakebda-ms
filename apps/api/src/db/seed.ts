import { makeKnex } from "./knex";
import { seedFoundation } from "./seedData";

async function main() {
  const db = makeKnex(process.env.DATABASE_URL);
  const r = await seedFoundation(db);
  console.log("Seeded demo account:");
  console.log("  owner email   :", r.ownerEmail);
  console.log("  owner password:", r.ownerPassword);
  console.log("  cashier PIN   : 1234");
  await db.destroy();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
