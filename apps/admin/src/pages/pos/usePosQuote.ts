import { useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api";
import type { CartLine, OrderQuoteSummary, OrderType } from "./types";

export interface UsePosQuoteOptions {
  branchId: string;
  sourceId: string;
  orderType: OrderType;
  deliveryZoneId: string;
  deliveryFee: number;
  discount: number;
  discountReason: string;
  allowDiscounts: boolean | undefined;
  cart: CartLine[];
  localSubtotal: number;
}

export interface UsePosQuoteResult {
  currentQuote: OrderQuoteSummary | null;
  quoteBusy: boolean;
  quoteError: string;
  subtotal: number;
  activeDeliveryFee: number;
  serviceFeeEstimate: number;
  vatEstimate: number;
  total: number;
}

export function usePosQuote({
  branchId,
  sourceId,
  orderType,
  deliveryZoneId,
  deliveryFee,
  discount,
  discountReason,
  allowDiscounts,
  cart,
  localSubtotal,
}: UsePosQuoteOptions): UsePosQuoteResult {
  const [quoteState, setQuoteState] = useState<{ key: string; data: OrderQuoteSummary } | null>(null);
  const [quoteBusy, setQuoteBusy] = useState(false);
  const [quoteError, setQuoteError] = useState("");

  const quotePayload = useMemo(() => ({
    branch_id: branchId,
    source_id: sourceId || null,
    order_type: orderType,
    delivery_zone_id: orderType === "delivery" ? deliveryZoneId || null : null,
    delivery_fee: orderType === "delivery" ? deliveryFee : 0,
    discount: allowDiscounts ? discount : 0,
    discount_reason: discount > 0 ? discountReason || null : null,
    items: cart.map((line) => ({
      product_id: line.product.id,
      variant_id: line.variant?.id ?? null,
      qty: line.qty,
      notes: line.notes || null,
      modifier_ids: line.modifiers.map((modifier) => modifier.id),
    })),
  }), [branchId, sourceId, orderType, deliveryZoneId, deliveryFee, discount, discountReason, allowDiscounts, cart]);
  const quoteKey = useMemo(() => JSON.stringify(quotePayload), [quotePayload]);
  const currentQuote = quoteState?.key === quoteKey ? quoteState.data : null;

  useEffect(() => {
    if (!branchId || !sourceId || !cart.length || (orderType === "delivery" && !deliveryZoneId)) {
      setQuoteState(null);
      setQuoteBusy(false);
      setQuoteError("");
      return;
    }
    let cancelled = false;
    setQuoteBusy(true);
    setQuoteError("");
    const timer = window.setTimeout(() => {
      api<{ data: OrderQuoteSummary }>("/orders/quote", { method: "POST", body: quotePayload })
        .then((response) => {
          if (!cancelled) setQuoteState({ key: quoteKey, data: response.data });
        })
        .catch((error: Error) => {
          if (!cancelled) {
            setQuoteState(null);
            setQuoteError(error.message);
          }
        })
        .finally(() => {
          if (!cancelled) setQuoteBusy(false);
        });
    }, 200);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [branchId, sourceId, orderType, deliveryZoneId, cart.length, quoteKey, quotePayload]);

  const subtotal = currentQuote?.subtotal ?? localSubtotal;
  // أنواع الطلب من الإعدادات، بينما كل القيم المالية النهائية تأتي من server quote.
  const activeDeliveryFee = currentQuote?.delivery_fee ?? (orderType === "delivery" ? deliveryFee : 0);
  const serviceFeeEstimate = currentQuote?.service_fee ?? 0;
  const vatEstimate = currentQuote?.vat_amount ?? 0;
  const total = currentQuote?.total ?? 0;

  return {
    currentQuote,
    quoteBusy,
    quoteError,
    subtotal,
    activeDeliveryFee,
    serviceFeeEstimate,
    vatEstimate,
    total,
  };
}
