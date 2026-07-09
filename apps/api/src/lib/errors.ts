import { ar } from "../i18n/ar";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: keyof typeof ar.errors,
    public details?: unknown
  ) {
    super(ar.errors[code] ?? code);
  }
}

export const err = {
  unauthorized: () => new ApiError(401, "unauthorized"),
  forbidden: () => new ApiError(403, "forbidden"),
  notFound: () => new ApiError(404, "not_found"),
  validation: (details?: unknown) => new ApiError(422, "validation", details),
  conflict: () => new ApiError(409, "conflict"),
  badCredentials: () => new ApiError(401, "bad_credentials"),
  badPin: () => new ApiError(401, "bad_pin"),
};
