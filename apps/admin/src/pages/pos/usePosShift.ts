import { useState } from "react";
import { api } from "../../lib/api";
import type { Shift } from "./types";

interface UsePosShiftOptions {
  branchId: string;
  onError: (message: string) => void;
}

interface UsePosShiftResult {
  shift: Shift | null;
  refreshShift: (currentBranchId: string) => Promise<void>;
  applyShiftSnapshot: (nextShift: Shift | null) => void;
  openShift: (openingCash: number) => Promise<boolean>;
  closeShift: (actualCash: number) => Promise<boolean>;
}

export function usePosShift({ branchId, onError }: UsePosShiftOptions): UsePosShiftResult {
  const [shift, setShift] = useState<Shift | null>(null);

  async function refreshShift(currentBranchId: string): Promise<void> {
    try {
      const response = await api<{ data: Shift | null }>(`/shifts/current?branch_id=${currentBranchId}`);
      setShift(response.data);
    } catch {
      setShift(null);
    }
  }

  function applyShiftSnapshot(nextShift: Shift | null): void {
    setShift(nextShift);
  }

  async function openShift(openingCash: number): Promise<boolean> {
    if (!branchId) return false;
    try {
      await api("/shifts/open", { method: "POST", body: { branch_id: branchId, opening_cash: openingCash } });
      await refreshShift(branchId);
      onError("");
      return true;
    } catch (e: any) {
      onError(e.message);
      return false;
    }
  }

  async function closeShift(actualCash: number): Promise<boolean> {
    if (!shift) return false;
    try {
      await api(`/shifts/${shift.id}/close`, { method: "POST", body: { actual_cash: actualCash } });
      await refreshShift(branchId);
      onError("");
      return true;
    } catch (e: any) {
      onError(e.message);
      return false;
    }
  }

  return { shift, refreshShift, applyShiftSnapshot, openShift, closeShift };
}
