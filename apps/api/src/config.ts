import dotenv from "dotenv";
import { isAbsolute, resolve } from "node:path";
dotenv.config();

function positiveInt(name: string, fallback: number): number {
  const value = Number(process.env[name] ?? fallback);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function enabled(name: string, fallback = false): boolean {
  return String(process.env[name] ?? fallback).toLowerCase() === "true";
}

function runtimePath(value: string): string {
  return isAbsolute(value) ? value : resolve(process.env.INIT_CWD ?? process.cwd(), value);
}

export const config = {
  env: process.env.NODE_ENV ?? "development",
  port: Number(process.env.PORT ?? 3001),
  jwtSecret: process.env.JWT_SECRET ?? "dev-secret-change-me",
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "12h",
  databaseUrl:
    process.env.DATABASE_URL ??
    "postgres://ykms:ykms@127.0.0.1:5432/ykms",
  testDatabaseUrl:
    process.env.TEST_DATABASE_URL ??
    "postgres://ykms:ykms@127.0.0.1:5432/ykms_test",
  maxPrintAttempts: positiveInt("MAX_PRINT_ATTEMPTS", 3),
  printStuckMinutes: positiveInt("PRINT_STUCK_MINUTES", 5),
  readinessDbTimeoutMs: positiveInt("READINESS_DB_TIMEOUT_MS", 1500),
  sccEnabled: enabled("SCC_ENABLED"),
  sccEnvironment: process.env.SCC_ENVIRONMENT ?? "development",
  sccBaseUrl: process.env.SCC_BASE_URL ?? "http://127.0.0.1:4000",
  sccProductId: process.env.SCC_PRODUCT_ID ?? "33333333-3333-4333-8333-333333333333",
  sccProductCode: process.env.SCC_PRODUCT_CODE ?? "YAKEBDA_MS",
  sccBranchCode: process.env.SCC_BRANCH_CODE ?? "PILOT-01",
  sccAppVersion: process.env.SCC_APP_VERSION ?? "0.1.0",
  sccHeartbeatIntervalMs: positiveInt("SCC_HEARTBEAT_INTERVAL_SECONDS", 60) * 1000,
  sccOfflineQueueLimit: positiveInt("SCC_OFFLINE_QUEUE_LIMIT", 1000),
  sccTimeoutMs: positiveInt("SCC_TIMEOUT_MS", 5000),
  sccUpdateChannel: process.env.SCC_UPDATE_CHANNEL ?? "pilot",
  sccStatePath: runtimePath(process.env.SCC_STATE_PATH ?? ".scc-pilot/state.json"),
  sccEnrollmentToken: process.env.SCC_ENROLLMENT_TOKEN ?? "",
  sccEnrollmentChallenge: process.env.SCC_ENROLLMENT_CHALLENGE ?? "",
  sccMaintenanceWindow: enabled("SCC_MAINTENANCE_WINDOW"),
};
