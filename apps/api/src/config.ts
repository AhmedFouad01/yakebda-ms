import dotenv from "dotenv";
dotenv.config();

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
};
