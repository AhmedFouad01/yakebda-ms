import { useState, type Dispatch, type SetStateAction } from "react";
import type { FullOrder } from "../../components/Receipt";
import { api } from "../../lib/api";
import { t } from "../../lib/t";
import type { CartLine, OrderQuoteSummary, OrderType, PaymentMethod } from "./types";

export interface UsePosSubmissionOptions {
  branchId: string;
  sourceId: string;
  orderType: OrderType;
  payment: PaymentMethod;
  discount: number;
  discountReason: string;
  orderNotes: string;
  allowDiscounts: boolean | undefined;
  cart: CartLine[];
  currentQuote: OrderQuoteSummary | null;
  customerId: string;
  deliveryAddress: string;
  deliveryPhone: string;
  deliveryZoneId: string;
  deliveryFee: number;
  historyOpen: boolean;
  resetCart: () => void;
  resetOrderDraft: () => void;
  resetDeliveryDraft: () => void;
  closeCartDrawer: () => void;
  refreshShift: (currentBranchId: string) => Promise<void>;
  refreshHistory: (silent?: boolean) => Promise<void>;
  onError: (message: string) => void;
  onMessage: (message: string) => void;
}

export interface UsePosSubmissionResult {
  done: FullOrder | null;
  setDone: Dispatch<SetStateAction<FullOrder | null>>;
  busy: boolean;
  fireOrder: () => Promise<void>;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function usePosSubmission({
  branchId,
  sourceId,
  orderType,
  payment,
  discount,
  discountReason,
  orderNotes,
  allowDiscounts,
  cart,
  currentQuote,
  customerId,
  deliveryAddress,
  deliveryPhone,
  deliveryZoneId,
  deliveryFee,
  historyOpen,
  resetCart,
  resetOrderDraft,
  resetDeliveryDraft,
  closeCartDrawer,
  refreshShift,
  refreshHistory,
  onError,
  onMessage,
}: UsePosSubmissionOptions): UsePosSubmissionResult {
  const [done, setDone] = useState<FullOrder | null>(null);
  const [busy, setBusy] = useState(false);

  async function fireOrder(): Promise<void> {
    onError("");
    onMessage("");
    if (!sourceId || !cart.length || busy || !currentQuote) return;
    setBusy(true);
    try {
      const response = await api<{ data: FullOrder }>("/orders", {
        method: "POST",
        body: {
          branch_id: branchId,
          source_id: sourceId,
          order_type: orderType,
          table_id: null,
          customer_id: orderType === "delivery" && customerId ? customerId : null,
          delivery_address: orderType === "delivery" ? deliveryAddress || null : null,
          delivery_phone: orderType === "delivery" ? deliveryPhone || null : null,
          delivery_zone_id: orderType === "delivery" ? deliveryZoneId || null : null,
          delivery_fee: orderType === "delivery" ? deliveryFee : 0,
          submit: true,
          payment_method: payment,
          discount: allowDiscounts ? discount : 0,
          discount_reason: discount > 0 ? discountReason || null : null,
          notes: orderNotes || null,
          items: cart.map((line) => ({
            product_id: line.product.id,
            variant_id: line.variant?.id ?? null,
            qty: line.qty,
            notes: line.notes || null,
            modifier_ids: line.modifiers.map((modifier) => modifier.id),
          })),
        },
      });
      const order = response.data;
      setDone(order);
      resetCart();
      resetOrderDraft();
      resetDeliveryDraft();
      closeCartDrawer();
      onMessage(`${t.pos.orderCreated} ${order.order_no}`);
      await refreshShift(branchId);
      if (historyOpen) await refreshHistory(true);
    } catch (error: unknown) {
      onError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return { done, setDone, busy, fireOrder };
}
