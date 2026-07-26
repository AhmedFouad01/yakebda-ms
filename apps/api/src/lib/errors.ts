import { ar } from "../i18n/ar";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: keyof typeof ar.errors,
    public details?: unknown,
    message?: string
  ) {
    super(message ?? ar.errors[code] ?? code);
  }
}

export const err = {
  unauthorized: () => new ApiError(401, "unauthorized"),
  forbidden: () => new ApiError(403, "forbidden"),
  notFound: () => new ApiError(404, "not_found"),
  validation: (details?: unknown) => new ApiError(422, "validation", details),
  conflict: (details?: unknown, message?: string) => new ApiError(409, "conflict", details, message),
  badCredentials: () => new ApiError(401, "bad_credentials"),
  badPin: () => new ApiError(401, "bad_pin"),
  rateLimited: (details?: unknown) => new ApiError(429, "too_many_attempts", details),
  locked: (details?: unknown) => new ApiError(423, "account_locked", details),
};
