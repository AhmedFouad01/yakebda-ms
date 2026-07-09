import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";

export function useList<T = any>(path: string) {
  const [data, setData] = useState<T[]>([]);
  const [error, setError] = useState("");
  const reload = useCallback(async () => {
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
