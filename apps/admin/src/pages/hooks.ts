import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";

export function useList<T = any>(path: string | null) {
  const [data, setData] = useState<T[]>([]);
  const [error, setError] = useState("");
  const reload = useCallback(async () => {
    if (!path) return; // YKMS-02C: مسار null = لا تطلب (بدون صلاحية)
    try {
      const res = await api<{ data: T[] }>(path);
      setData(res.data);
      setError("");
    } catch (e: any) {
      setError(e.message);
    }
  }, [path]);
  useEffect(() => {
    reload();
  }, [reload]);
  return { data, error, reload };
}
