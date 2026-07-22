import { createReadStream } from "node:fs";
import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawn } from "node:child_process";
import { AtomicFileStore, SystronicClient } from "@scc/client-sdk";

function run(command: string, args: string[], stdinPath?: string): Promise<string> {
  return new Promise((accept, reject) => {
    const child = spawn(command, args);
    let output = "", error = "";
    if (stdinPath) createReadStream(stdinPath).pipe(child.stdin); else child.stdin.end();
    child.stdout.on("data", (chunk) => { output += String(chunk); });
    child.stderr.on("data", (chunk) => { error += String(chunk); });
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? accept(output) : reject(new Error(`${args.at(-1)}_failed:${code}:${error.slice(0, 200)}`)));
  });
}

async function latestDump(directory: string) {
  const files = (await readdir(directory)).filter((name) => name.endsWith(".dump"));
  if (!files.length) throw new Error("backup_not_found");
  const ranked = await Promise.all(files.map(async (name) => ({ name, modified: (await stat(resolve(directory, name))).mtimeMs })));
  return resolve(directory, ranked.sort((a, b) => b.modified - a.modified)[0]!.name);
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  const container = process.env.SCC_POSTGRES_CONTAINER;
  if (!databaseUrl || !container) throw new Error("DATABASE_URL and SCC_POSTGRES_CONTAINER are required");
  const source = new URL(databaseUrl);
  const user = decodeURIComponent(source.username);
  const sourceDatabase = source.pathname.slice(1);
  const targetDatabase = `${sourceDatabase}_restore_test`;
  if (!targetDatabase.endsWith("_restore_test")) throw new Error("unsafe_restore_target");
  const directory = resolve(process.env.SCC_BACKUP_DIR ?? ".scc-pilot/backups");
  const dump = process.env.SCC_BACKUP_FILE ? resolve(process.env.SCC_BACKUP_FILE) : await latestDump(directory);

  await run("docker", ["exec", container, "dropdb", "--if-exists", "-U", user, targetDatabase]);
  try {
    await run("docker", ["exec", container, "createdb", "-U", user, targetDatabase]);
    await run("docker", ["exec", "-i", container, "pg_restore", "-U", user, "-d", targetDatabase, "--no-owner", "--no-privileges"], dump);
    const count = Number((await run("docker", ["exec", container, "psql", "-U", user, "-d", targetDatabase, "-Atc", "select count(*) from information_schema.tables where table_schema='public'"])).trim());
    if (!Number.isInteger(count) || count < 10) throw new Error("restore_validation_failed");
    const metadataPath = `${dump}.json`;
    const metadata = JSON.parse(await readFile(metadataPath, "utf8"));
    metadata.restoreTestedAt = new Date().toISOString();
    metadata.restoredTableCount = count;
    await writeFile(metadataPath, JSON.stringify(metadata, null, 2), { mode: 0o600 });
    if (process.env.SCC_STATE_PATH) {
      const client = new SystronicClient({
        baseUrl: process.env.SCC_BASE_URL ?? "http://127.0.0.1:4000",
        productId: process.env.SCC_PRODUCT_ID ?? "33333333-3333-4333-8333-333333333333",
        appVersion: process.env.SCC_APP_VERSION ?? "0.1.0",
        sdkVersion: "0.1.0-pilot.1",
        store: new AtomicFileStore(resolve(process.env.SCC_STATE_PATH)),
      });
      await client.reportBackup({ status: "succeeded", integrity: "verified", restoreTestedAt: metadata.restoreTestedAt, locationClass: "local" });
    }
    process.stdout.write(JSON.stringify({ status: "succeeded", restoreTestedAt: metadata.restoreTestedAt, restoredTableCount: count }) + "\n");
  } finally {
    await run("docker", ["exec", container, "dropdb", "--if-exists", "-U", user, targetDatabase]);
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : "restore_test_failed"}\n`);
  process.exitCode = 1;
});
