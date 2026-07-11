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

/** YKMS-02G — تنزيل ملف ثنائي (Excel) مع ترويسة المصادقة. */
export async function downloadFile(path: string, filename: string): Promise<void> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}) },
  });
  if (!res.ok) throw new ApiFail(res.status, "تعذّر التنزيل");
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
