const BASE = "/api/v1";
const ASSET_ORIGIN = String(import.meta.env.VITE_API_ORIGIN ?? "").replace(/\/$/, "");
const AUTH_PATHS = new Set(["/auth/login", "/auth/pin-login"]);
let redirectingToLogin = false;

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

function expireSession(path: string) {
  if (AUTH_PATHS.has(path)) return;
  setToken(null);
  if (redirectingToLogin || window.location.pathname === "/login") return;
  redirectingToLogin = true;
  window.location.replace("/login");
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
  if (!res.ok) {
    if (res.status === 401) expireSession(path);
    throw new ApiFail(
      res.status,
      res.status === 401 && !AUTH_PATHS.has(path)
        ? "انتهت جلسة الدخول. سجّل الدخول مرة أخرى."
        : data.message ?? "حدث خطأ غير متوقع.",
      data.details
    );
  }
  return data;
}

interface CursorResponse<T> {
  data: T[];
  next_cursor: string | null;
  has_more: boolean;
}

function withCursor(path: string, limit: number, cursor: string | null): string {
  const url = new URL(path, "http://local.invalid");
  url.searchParams.set("limit", String(limit));
  if (cursor) url.searchParams.set("cursor", cursor);
  return `${url.pathname}${url.search}`;
}

export async function apiAllPages<T>(path: string, limit = 100): Promise<{ data: T[] }> {
  const data: T[] = [];
  const seen = new Set<string>();
  let cursor: string | null = null;

  for (let page = 0; page < 1000; page += 1) {
    const response: CursorResponse<T> = await api<CursorResponse<T>>(withCursor(path, limit, cursor));
    data.push(...response.data);
    if (!response.has_more) return { data };
    if (!response.next_cursor || seen.has(response.next_cursor)) {
      throw new ApiFail(500, "تعذر استكمال تحميل القائمة.");
    }
    seen.add(response.next_cursor);
    cursor = response.next_cursor;
  }

  throw new ApiFail(500, "تجاوز تحميل القائمة الحد التشغيلي الآمن.");
}

/** YKMS-02G — تنزيل ملف ثنائي (Excel) مع ترويسة المصادقة. */
export async function downloadFile(path: string, filename: string): Promise<void> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}) },
  });
  if (!res.ok) {
    if (res.status === 401) expireSession(path);
    throw new ApiFail(
      res.status,
      res.status === 401 ? "انتهت جلسة الدخول. سجّل الدخول مرة أخرى." : "تعذّر التنزيل"
    );
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** YKMS-02G — قراءة ملف كـ base64 (بدون بادئة data:) للرفع/الاستيراد. */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result);
      resolve(result.replace(/^data:[^;]+;base64,/, ""));
    };
    reader.onerror = () => reject(new Error("تعذّرت قراءة الملف"));
    reader.readAsDataURL(file);
  });
}

/**
 * Resolve uploaded assets against the API origin.
 * Vite development proxies /uploads; packaged Windows/WebView2 builds can set
 * VITE_API_ORIGIN (for example http://127.0.0.1:3001).
 */
export function resolveAssetUrl(value: string | null | undefined): string {
  if (!value) return "";
  if (/^(https?:|data:|blob:)/i.test(value)) return value;
  const path = value.startsWith("/") ? value : `/${value}`;
  return ASSET_ORIGIN ? `${ASSET_ORIGIN}${path}` : path;
}
