import { useEffect, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { FullOrder } from "../../components/Receipt";
import { api } from "../../lib/api";
import type { Shift, ShiftOrderSummary } from "./types";

interface UsePosHistoryOptions {
  branchId: string;
  currentShiftOrderCount: number | null | undefined;
  applyShiftSnapshot: (snapshot: Shift | null) => void;
}

interface UsePosHistoryResult {
  historyOpen: boolean;
  setHistoryOpen: Dispatch<SetStateAction<boolean>>;
  historyBusy: boolean;
  historyError: string;
  history: ShiftOrderSummary[];
  historyOrder: FullOrder | null;
  setHistoryOrder: Dispatch<SetStateAction<FullOrder | null>>;
  historyOrderBusy: boolean;
  historyOrderError: string;
  historySearch: string;
  setHistorySearch: Dispatch<SetStateAction<string>>;
  expandedHistoryId: string | null;
  setExpandedHistoryId: Dispatch<SetStateAction<string | null>>;
  filteredHistory: ShiftOrderSummary[];
  shiftOrdersCount: number;
  refreshHistory: (silent?: boolean) => Promise<void>;
  openHistoryOrder: (id: string) => Promise<void>;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function usePosHistory({
  branchId,
  currentShiftOrderCount,
  applyShiftSnapshot,
}: UsePosHistoryOptions): UsePosHistoryResult {
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyBusy, setHistoryBusy] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [history, setHistory] = useState<ShiftOrderSummary[]>([]);
  const [historyOrder, setHistoryOrder] = useState<FullOrder | null>(null);
  const [historyOrderBusy, setHistoryOrderBusy] = useState(false);
  const [historyOrderError, setHistoryOrderError] = useState("");
  const [historySearch, setHistorySearch] = useState("");
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);

  async function refreshHistory(silent = false): Promise<void> {
    if (!branchId) return;
    if (!silent) setHistoryBusy(true);
    setHistoryError("");
    try {
      const response = await api<{ data: { shift: Shift | null; orders: ShiftOrderSummary[] } }>(
        `/orders/current-shift?branch_id=${branchId}`
      );
      applyShiftSnapshot(response.data.shift);
      setHistory(response.data.orders);
    } catch (error: unknown) {
      setHistoryError(errorMessage(error));
    } finally {
      if (!silent) setHistoryBusy(false);
    }
  }

  async function openHistoryOrder(id: string): Promise<void> {
    if (historyOrderBusy) return;
    setHistoryOrderBusy(true);
    setHistoryOrderError("");
    try {
      const response = await api<{ data: FullOrder }>(`/orders/${id}`);
      setHistoryOpen(false);
      setHistoryOrder(response.data);
    } catch (error: unknown) {
      setHistoryOrderError(errorMessage(error));
    } finally {
      setHistoryOrderBusy(false);
    }
  }

  useEffect(() => {
    if (!historyOpen || !branchId) return;
    void refreshHistory();
    const timer = window.setInterval(() => void refreshHistory(true), 10000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyOpen, branchId]);

  const normalizedHistorySearch = historySearch.trim().replace(/^#/, "").toLocaleLowerCase("ar-EG");
  const filteredHistory = normalizedHistorySearch
    ? history.filter((order) => `${order.order_prefix ?? ""}${order.order_no}`.toLocaleLowerCase("ar-EG").includes(normalizedHistorySearch))
    : history;
  const shiftOrdersCount = currentShiftOrderCount ?? history.length;

  return {
    historyOpen,
    setHistoryOpen,
    historyBusy,
    historyError,
    history,
    historyOrder,
    setHistoryOrder,
    historyOrderBusy,
    historyOrderError,
    historySearch,
    setHistorySearch,
    expandedHistoryId,
    setExpandedHistoryId,
    filteredHistory,
    shiftOrdersCount,
    refreshHistory,
    openHistoryOrder,
  };
}
