import { useCallback, useEffect, useState } from "react";
import { api, apiAllPages } from "../lib/api";

export function useList<T = any>(path: string | null, options: { allPages?: boolean } = {}) {
  const [data, setData] = useState<T[]>([]);
  const [error, setError] = useState("");
  const reload = useCallback(async () => {
    if (!path) return; // YKMS-02C: مسار null = لا تطلب (بدون صلاحية)
    try {
      const res = options.allPages
        ? await apiAllPages<T>(path)
        : await api<{ data: T[] }>(path);
      setData(res.data);
      setError("");
    } catch (e: any) {
      setError(e.message);
    }
  }, [path, options.allPages]);
  useEffect(() => {
    reload();
  }, [reload]);
  return { data, error, reload };
}
