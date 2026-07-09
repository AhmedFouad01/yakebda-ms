const BASE = "/api/v1";

export function getToken(): string | null {
  return sessionStorage.getItem("ykms_token");
}
export function setToken(t: string | null) {
  if (t) sessionStorage.setItem("ykms_token", t);
  else sessionStorage.removeItem("ykms_token");
}

export class ApiFail extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message);
  }
}

export async function api<T = any>(
  path: string,
  opts: { method?: string; body?: unknown } = {}
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: opts.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiFail(res.status, data.message ?? "حدث خطأ غير متوقع.", data.details);
  return data;
}
