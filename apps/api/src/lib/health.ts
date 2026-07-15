import { Knex } from "knex";

export type ReadinessFailureReason = "timeout" | "database_unavailable";

export type ReadinessResult =
  | { ready: true }
  | { ready: false; reason: ReadinessFailureReason };

class ReadinessTimeoutError extends Error {}

export async function checkDatabaseReadiness(
  db: Knex,
  timeoutMs: number
): Promise<ReadinessResult> {
  let timeout: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      db.raw("select 1 as ready"),
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => reject(new ReadinessTimeoutError()), timeoutMs);
      }),
    ]);
    return { ready: true };
  } catch (error) {
    return {
      ready: false,
      reason: error instanceof ReadinessTimeoutError ? "timeout" : "database_unavailable",
    };
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
