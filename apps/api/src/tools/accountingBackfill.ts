import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { makeKnex } from "../db/knex";
import { buildAccountingBackfillReport } from "../modules/accountingBackfill";

function valueAfter(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const confirmTestDatabase = args.includes("--confirm-test-db");
  const accountId = valueAfter(args, "--account-id");
  const output = valueAfter(args, "--out");
  const limitValue = valueAfter(args, "--limit");
  const limit = limitValue ? Number(limitValue) : undefined;
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > 5000)) {
    throw new Error("--limit must be an integer from 1 to 5000");
  }
  const db = makeKnex();
  try {
    const report = await buildAccountingBackfillReport(db, { accountId, limit, apply, confirmTestDatabase });
    const rendered = `${JSON.stringify(report, null, 2)}\n`;
    if (output) await writeFile(resolve(output), rendered, { encoding: "utf8", flag: "wx" });
    else process.stdout.write(rendered);
  } finally {
    await db.destroy();
  }
}

void main();
