import { randomUUID } from "node:crypto";
import { NextFunction, Request, Response } from "express";

const REQUEST_ID_MAX_LENGTH = 128;
const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const SECRET_KEY_PATTERN =
  /authorization|cookie|password|passphrase|pin|token|api[_-]?key|private[_-]?key|secret|card[_-]?number|card[_-]?holder|cvv|cvc|\bpan\b/i;
const REDACTED = "[REDACTED]";

export type LogLevel = "info" | "warn" | "error";

export interface StructuredLogEntry {
  timestamp: string;
  level: LogLevel;
  event: string;
  [key: string]: unknown;
}

export interface StructuredLogSink {
  write(entry: StructuredLogEntry): void;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      requestId: string;
    }
  }
}

function redactString(value: string): string {
  return value
    .replace(/\bBearer\s+[^\s,;]+/gi, `Bearer ${REDACTED}`)
    .replace(
      /\b(password|passphrase|pin|token|api[_-]?key|private[_-]?key|secret)\s*[:=]\s*[^\s,;]+/gi,
      (_match, key: string) => `${key}=${REDACTED}`
    );
}

export function redactSensitive(value: unknown, key = "", seen = new WeakSet<object>()): unknown {
  if (SECRET_KEY_PATTERN.test(key)) return REDACTED;
  if (typeof value === "string") return redactString(value);
  if (value === null || typeof value !== "object") return value;
  if (seen.has(value)) return "[CIRCULAR]";
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => redactSensitive(item, "", seen));
  }

  return Object.fromEntries(
    Object.entries(value).map(([childKey, childValue]) => [
      childKey,
      redactSensitive(childValue, childKey, seen),
    ])
  );
}

const consoleSink: StructuredLogSink = {
  write(entry) {
    process.stdout.write(`${JSON.stringify(entry)}\n`);
  },
};

const silentSink: StructuredLogSink = { write() {} };

export function createStructuredLogger(
  sink: StructuredLogSink = process.env.NODE_ENV === "test" ? silentSink : consoleSink
): StructuredLogSink {
  return {
    write(entry) {
      try {
        sink.write(redactSensitive(entry) as StructuredLogEntry);
      } catch {
        // Observability failures must not change request behavior.
      }
    },
  };
}

export function resolveRequestId(value: string | string[] | undefined): string {
  const candidate = Array.isArray(value) ? "" : value?.trim() ?? "";
  if (
    candidate.length > 0 &&
    candidate.length <= REQUEST_ID_MAX_LENGTH &&
    REQUEST_ID_PATTERN.test(candidate)
  ) {
    return candidate;
  }
  return randomUUID();
}

export function normalizeRoute(originalUrl: string): string {
  const path = originalUrl.split("?", 1)[0] || "/";
  return path
    .split("/")
    .map((segment) => {
      if (/^\d+$/.test(segment)) return ":id";
      if (/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(segment)) return ":id";
      return segment.length > 64 ? ":value" : segment;
    })
    .join("/");
}

function requestIdentity(req: Request): Record<string, string> {
  if (req.user) {
    return {
      account_id: req.user.accountId,
      ...(req.user.branchId ? { branch_id: req.user.branchId } : {}),
      user_id: req.user.id,
    };
  }
  if (req.apiClient) {
    return { account_id: req.apiClient.accountId };
  }
  return {};
}

export function requestObservability(logger: StructuredLogSink) {
  return (req: Request, res: Response, next: NextFunction) => {
    const requestId = resolveRequestId(req.headers["x-request-id"]);
    const startedAt = process.hrtime.bigint();
    req.requestId = requestId;
    res.setHeader("x-request-id", requestId);

    res.once("finish", () => {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      const level: LogLevel = res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info";
      logger.write({
        timestamp: new Date().toISOString(),
        level,
        event: "http.request.completed",
        request_id: requestId,
        method: req.method,
        route: normalizeRoute(req.originalUrl),
        status_code: res.statusCode,
        duration_ms: Number(durationMs.toFixed(2)),
        ...requestIdentity(req),
      });
    });

    next();
  };
}

export function unexpectedErrorFields(error: unknown): Record<string, string> {
  if (!(error instanceof Error)) return { error_name: "UnknownError" };
  const fields: Record<string, string> = { error_name: error.name || "Error" };
  const code = (error as Error & { code?: unknown }).code;
  if (typeof code === "string" && /^[A-Z0-9_]{1,32}$/i.test(code)) {
    fields.error_code = code;
  }
  return fields;
}
