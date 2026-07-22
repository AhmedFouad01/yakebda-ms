import { mkdir, writeFile } from "node:fs/promises";
import { createReadStream, createWriteStream } from "node:fs";
import { spawn } from "node:child_process";
import { basename, resolve } from "node:path";
import { AtomicFileStore, SystronicClient } from "@scc/client-sdk";

function run(command: string, args: string[], capture = false): Promise<string> {
  return new Promise((accept, reject) => {
    const child = spawn(command, args, { stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit" });
    let output = "", error = "";
    child.stdout?.on("data", (chunk) => { output += String(chunk); });
    child.stderr?.on("data", (chunk) => { error += String(chunk); });
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? accept(output) : reject(new Error(`${command}_failed:${code}:${error.slice(0, 160)}`)));
  });
}

function dockerDump(container: string, database: URL, path: string): Promise<void> {
  return new Promise((accept, reject) => {
    const child = spawn("docker", ["exec", container, "pg_dump", "-U", decodeURIComponent(database.username), "-d", database.pathname.slice(1), "--format=custom", "--no-owner", "--no-privileges"]);
    const output = createWriteStream(path, { mode: 0o600 });
    let error = "";
    child.stdout.pipe(output);
    child.stderr.on("data", (chunk) => { error += String(chunk); });
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? output.end(() => accept()) : reject(new Error(`docker_pg_dump_failed:${code}:${error.slice(0, 160)}`)));
  });
}

function dockerList(container: string, path: string): Promise<string> {
  return new Promise((accept, reject) => {
    const child = spawn("docker", ["exec", "-i", container, "pg_restore", "--list"]);
    let output = "", error = "";
    createReadStream(path).pipe(child.stdin);
    child.stdout.on("data", (chunk) => { output += String(chunk); });
    child.stderr.on("data", (chunk) => { error += String(chunk); });
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? accept(output) : reject(new Error(`docker_pg_restore_failed:${code}:${error.slice(0, 160)}`)));
  });
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  const backupDir = resolve(process.env.SCC_BACKUP_DIR ?? ".scc-pilot/backups");
  await mkdir(backupDir, { recursive: true, mode: 0o700 });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const path = resolve(backupDir, `yakebda-${stamp}.dump`);
  const container = process.env.SCC_POSTGRES_CONTAINER;
  if (container) await dockerDump(container, new URL(databaseUrl), path);
  else await run("pg_dump", ["--format=custom", "--no-owner", "--no-privileges", "--file", path, databaseUrl]);
  const listing = container ? await dockerList(container, path) : await run("pg_restore", ["--list", path], true);
  if (!listing.includes("TABLE public") || !listing.includes("TOC Entries")) throw new Error("backup_integrity_failed");
  const metadata = {
    schemaVersion: 1,
    file: basename(path),
    createdAt: new Date().toISOString(),
    status: "succeeded",
    integrity: "verified",
    restoreTestedAt: null,
    locationClass: "local",
  };
  await writeFile(`${path}.json`, JSON.stringify(metadata, null, 2), { mode: 0o600 });
  if (process.env.SCC_STATE_PATH) {
    const client = new SystronicClient({
      baseUrl: process.env.SCC_BASE_URL ?? "http://127.0.0.1:4000",
      productId: process.env.SCC_PRODUCT_ID ?? "33333333-3333-4333-8333-333333333333",
      appVersion: process.env.SCC_APP_VERSION ?? "0.1.0",
      sdkVersion: "0.1.0-pilot.1",
      store: new AtomicFileStore(resolve(process.env.SCC_STATE_PATH)),
    });
    await client.reportBackup({ status: "succeeded", integrity: "verified", restoreTestedAt: null, locationClass: "local" });
  }
  process.stdout.write(JSON.stringify(metadata) + "\n");
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : "backup_failed"}\n`);
  process.exitCode = 1;
});
