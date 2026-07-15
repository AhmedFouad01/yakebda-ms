import { z } from "zod";
import { ApiError } from "./errors";

export const DEFAULT_PAGE_LIMIT = 50;
export const MAX_PAGE_LIMIT = 100;
export const MAX_CURSOR_LENGTH = 1024;

const cursorEnvelopeSchema = z
  .object({
    version: z.number().int(),
    endpoint: z.string().min(1).max(100),
    sort: z.string().min(1).max(100),
    values: z.unknown(),
  })
  .strict();

export interface CursorDefinition<TValues> {
  endpoint: string;
  sort: string;
  values: z.ZodType<TValues>;
}

export interface CursorPageRequest<TValues> {
  limit: number;
  cursor: TValues | null;
}

export interface CursorPage<T> {
  data: T[];
  next_cursor: string | null;
  has_more: boolean;
}

interface PageLimits {
  defaultLimit?: number;
  maximumLimit?: number;
}

function badRequest(field: "cursor" | "limit", message: string): ApiError {
  return new ApiError(400, "validation", { [field]: message });
}

function readSingleQueryValue(value: unknown, field: "cursor" | "limit"): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") {
    throw badRequest(field, field === "cursor" ? "مؤشر الصفحة غير صالح" : "حد الصفحة غير صالح");
  }
  return value;
}

function parseLimit(value: unknown, limits: PageLimits): number {
  const defaultLimit = limits.defaultLimit ?? DEFAULT_PAGE_LIMIT;
  const maximumLimit = limits.maximumLimit ?? MAX_PAGE_LIMIT;
  const raw = readSingleQueryValue(value, "limit");

  if (raw === undefined) return defaultLimit;
  if (!/^[1-9]\d*$/.test(raw)) throw badRequest("limit", "حد الصفحة يجب أن يكون عددًا صحيحًا موجبًا");

  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed > maximumLimit) {
    throw badRequest("limit", `حد الصفحة يجب ألا يتجاوز ${maximumLimit}`);
  }
  return parsed;
}

export function encodeCursor<TValues>(definition: CursorDefinition<TValues>, values: TValues): string {
  const validated = definition.values.safeParse(values);
  if (!validated.success) throw new Error("Cursor values do not match the endpoint contract");

  return Buffer.from(
    JSON.stringify({
      version: 1,
      endpoint: definition.endpoint,
      sort: definition.sort,
      values: validated.data,
    }),
    "utf8"
  ).toString("base64url");
}

export function decodeCursor<TValues>(
  value: unknown,
  definition: CursorDefinition<TValues>
): TValues | null {
  const raw = readSingleQueryValue(value, "cursor");
  if (raw === undefined) return null;
  if (!raw || raw.length > MAX_CURSOR_LENGTH || !/^[A-Za-z0-9_-]+$/.test(raw)) {
    throw badRequest("cursor", "مؤشر الصفحة غير صالح");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
  } catch {
    throw badRequest("cursor", "مؤشر الصفحة غير صالح");
  }

  const envelope = cursorEnvelopeSchema.safeParse(parsed);
  if (!envelope.success) throw badRequest("cursor", "مؤشر الصفحة غير صالح");
  if (envelope.data.version !== 1) throw badRequest("cursor", "إصدار مؤشر الصفحة غير مدعوم");
  if (envelope.data.endpoint !== definition.endpoint || envelope.data.sort !== definition.sort) {
    throw badRequest("cursor", "مؤشر الصفحة لا يطابق هذا المسار أو الترتيب");
  }

  const values = definition.values.safeParse(envelope.data.values);
  if (!values.success) throw badRequest("cursor", "قيم مؤشر الصفحة غير صالحة");
  return values.data;
}

export function parseCursorPage<TValues>(
  query: { cursor?: unknown; limit?: unknown },
  definition: CursorDefinition<TValues>,
  limits: PageLimits = {}
): CursorPageRequest<TValues> {
  return {
    limit: parseLimit(query.limit, limits),
    cursor: decodeCursor(query.cursor, definition),
  };
}

export function createCursorPage<T, TValues>(
  rows: T[],
  limit: number,
  definition: CursorDefinition<TValues>,
  cursorValues: (row: T) => TValues
): CursorPage<T> {
  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;
  const last = data.at(-1);

  return {
    data,
    next_cursor: hasMore && last ? encodeCursor(definition, cursorValues(last)) : null,
    has_more: hasMore,
  };
}
