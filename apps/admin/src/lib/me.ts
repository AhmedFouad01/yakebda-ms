import { useCallback, useEffect, useState } from "react";
import { api, getToken } from "./api";

/**
 * YKMS-02C — صلاحيات المستخدم الحالي في الواجهة.
 * تمنع الواجهة من طلب endpoints لا يملك المستخدم صلاحيتها (ضجيج 403).
 */

export interface Me {
  id: string;
  name: string;
  accountId: string;
  branchId?: string | null;
  permissions: string[];
  roles: string[];
}

let cached: Me | null = null;
let inflight: Promise<Me | null> | null = null;
const listeners = new Set<(m: Me | null) => void>();

export function clearMe() {
  cached = null;
  inflight = null;
  listeners.forEach((l) => l(null));
}

export async function loadMe(): Promise<Me | null> {
  if (cached) return cached;
  if (!getToken()) return null;
  if (!inflight) {
    inflight = api<{ user: Me }>("/auth/me")
      .then((r) => {
        cached = r.user;
        listeners.forEach((l) => l(cached));
        return cached;
      })
      .catch(() => null)
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

export function can(me: Me | null, permission: string): boolean {
  // لا تجاوز بأسماء الأدوار: الصلاحيات وحدها مصدر الحقيقة —
  // owner/admin يحصلان على كل الصلاحيات فعليًا عبر مزامنة الهجرة 008.
  return !!me?.permissions?.includes(permission);
}

export function useMe(): { me: Me | null; ready: boolean; can: (p: string) => boolean } {
  const [me, setMe] = useState<Me | null>(cached);
  const [ready, setReady] = useState(!!cached);
  useEffect(() => {
    const listener = (m: Me | null) => setMe(m);
    listeners.add(listener);
    loadMe().then((m) => {
      setMe(m);
      setReady(true);
    });
    return () => {
      listeners.delete(listener);
    };
  }, []);
  const canPermission = useCallback((p: string) => can(me, p), [me]);
  return { me, ready, can: canPermission };
}
