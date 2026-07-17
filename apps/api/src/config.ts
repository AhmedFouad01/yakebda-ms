import dotenv from "dotenv";
dotenv.config();

function positiveInt(name: string, fallback: number): number {
  const value = Number(process.env[name] ?? fallback);
  return Number.isInteger(value) && value > 0 ? value : fallback;
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
};
