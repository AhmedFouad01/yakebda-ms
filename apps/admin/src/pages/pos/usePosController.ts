import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../../lib/api";
import { t } from "../../lib/t";
import type { FullOrder } from "../../components/Receipt";
import { useMe } from "../../lib/me";
import type {
  AdminPanel,
  Branch,
  OrderQuoteSummary,
  OrderSource,
  OrderType,
  PaymentMethod,
  Settings,
} from "./types";
import { usePosCart } from "./usePosCart";
import { usePosCatalog } from "./usePosCatalog";
import { usePosShift } from "./usePosShift";
import { usePosHistory } from "./usePosHistory";
import { usePosDelivery } from "./usePosDelivery";

export function usePosController() {
  const [params] = useSearchParams();
  const { can } = useMe();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState(params.get("branch") ?? "");
  const [sources, setSources] = useState<OrderSource[]>([]);
  const [sourceId, setSourceId] = useState("");
  const [settings, setSettings] = useState<Settings | null>(null);
  const [error, setError] = useState("");
  const { shift, refreshShift, applyShiftSnapshot, openShift, closeShift } = usePosShift({
    branchId,
    onError: setError,
  });
  const {
    cart,
    setCart,
    addProduct,
    quickRemove,
    refreshProducts,
    resetCart,
    itemCount,
    localSubtotal,
  } = usePosCart();
  const {
    categories,
    activeCat,
    setActiveCat,
    search,
    setSearch,
    visibleProducts,
    refreshCatalog,
  } = usePosCatalog({
    branchId,
    sourceId,
    refreshCartProducts: refreshProducts,
    onError: setError,
  });
  const [orderType, setOrderType] = useState<OrderType>("takeaway");
  const [discount, setDiscount] = useState(0);
  const [discountReason, setDiscountReason] = useState("");
  const [orderNotes, setOrderNotes] = useState("");
  const [payment, setPayment] = useState<PaymentMethod>("cash");
  const [shellControlsRoot, setShellControlsRoot] = useState<HTMLElement | null>(null);
  const [shellSessionRoot, setShellSessionRoot] = useState<HTMLElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const sourceSelectRef = useRef<HTMLSelectElement>(null);
  const [msg, setMsg] = useState("");
  const {
    customers,
    customerId,
    deliveryAddress,
    setDeliveryAddress,
    deliveryPhone,
    setDeliveryPhone,
    deliveryZones,
    deliveryZoneId,
    setDeliveryZoneId,
    deliveryFee,
    setDeliveryFee,
    customerModalOpen,
    setCustomerModalOpen,
    addressModalOpen,
    setAddressModalOpen,
    phoneModalOpen,
    setPhoneModalOpen,
    quickName,
    setQuickName,
    quickPhone,
    setQuickPhone,
    quickAddress,
    setQuickAddress,
    quickAddressLabel,
    setQuickAddressLabel,
    quickExtraPhone,
    setQuickExtraPhone,
    quickBusy,
    selectedCustomer,
    selectedZone,
    customerAddressOptions,
    customerPhoneOptions,
    selectDeliveryCustomer,
    createQuickCustomer,
    addQuickAddress,
    addQuickPhone,
    resetDeliveryDraft,
  } = usePosDelivery({
    branchId,
    orderType,
    can,
    onError: setError,
    onMessage: setMsg,
  });
  const [done, setDone] = useState<FullOrder | null>(null);
  const [busy, setBusy] = useState(false);
  const [quoteState, setQuoteState] = useState<{ key: string; data: OrderQuoteSummary } | null>(null);
  const [quoteBusy, setQuoteBusy] = useState(false);
  const [quoteError, setQuoteError] = useState("");
  const {
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
  } = usePosHistory({
    branchId,
    currentShiftOrderCount: shift?.totals?.orders_count,
    applyShiftSnapshot,
  });

  const [adminPanel, setAdminPanel] = useState<AdminPanel>(null);
  const [cartDrawerOpen, setCartDrawerOpen] = useState(false);

  const quotePayload = useMemo(() => ({
    branch_id: branchId,
    source_id: sourceId || null,
    order_type: orderType,
    delivery_zone_id: orderType === "delivery" ? deliveryZoneId || null : null,
    delivery_fee: orderType === "delivery" ? deliveryFee : 0,
    discount: settings?.allow_discounts ? discount : 0,
    discount_reason: discount > 0 ? discountReason || null : null,
    items: cart.map((line) => ({
      product_id: line.product.id,
      variant_id: line.variant?.id ?? null,
      qty: line.qty,
      notes: line.notes || null,
      modifier_ids: line.modifiers.map((modifier) => modifier.id),
    })),
  }), [branchId, sourceId, orderType, deliveryZoneId, deliveryFee, discount, discountReason, settings?.allow_discounts, cart]);
  const quoteKey = useMemo(() => JSON.stringify(quotePayload), [quotePayload]);
  const currentQuote = quoteState?.key === quoteKey ? quoteState.data : null;

  useEffect(() => {
    setShellControlsRoot(document.getElementById("pos-appshell-controls"));
    setShellSessionRoot(document.getElementById("pos-appshell-session"));
  }, []);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const editing = target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
      if (event.key === "/" && !editing) {
        event.preventDefault();
        searchInputRef.current?.focus();
      } else if (event.key === "F2") {
        event.preventDefault();
        sourceSelectRef.current?.focus();
      } else if (event.key === "F4") {
        event.preventDefault();
        setHistoryOpen(true);
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);

  useEffect(() => {
    if (!cartDrawerOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setCartDrawerOpen(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [cartDrawerOpen]);

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
        .catch((e: Error) => {
          if (!cancelled) {
            setQuoteState(null);
            setQuoteError(e.message);
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
  useEffect(() => {
    let cancelled = false;
    api<{ data: Branch[] }>("/branches")
      .then((response) => {
        if (cancelled) return;
        setBranches(response.data);
        setBranchId((current) => current || response.data[0]?.id || "");
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!branchId) return;
    setSourceId("");
    refreshCatalog(branchId, "").catch((e: Error) => setError(e.message));
    api<{ data: Settings }>(`/settings?branch_id=${branchId}`).then((response) => {
      setSettings(response.data);
      setPayment((current) =>
        response.data.enabled_payment_methods.includes(current) ? current : (response.data.enabled_payment_methods[0] as PaymentMethod)
      );
      // YKMS-02E: النوع الافتراضي يتبع الإعدادات (الصالة مخفية أصلًا)
      setOrderType((current) => {
        if (current === "takeaway" && !response.data.order_type_takeaway_enabled && response.data.order_type_delivery_enabled) return "delivery";
        if (current === "delivery" && !response.data.order_type_delivery_enabled && response.data.order_type_takeaway_enabled) return "takeaway";
        return current;
      });
    });
    refreshShift(branchId);
  }, [branchId]);

  useEffect(() => {
    if (!branchId) return;
    let cancelled = false;
    setSources([]);
    setSourceId("");
    api<{ data: OrderSource[] }>("/order-sources?active_only=true&order_type=" + orderType)
      .then((response) => {
        if (!cancelled) setSources(response.data);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      });
    return () => { cancelled = true; };
  }, [branchId, orderType]);


  const subtotal = currentQuote?.subtotal ?? localSubtotal;
  // أنواع الطلب من الإعدادات، بينما كل القيم المالية النهائية تأتي من server quote.
  const enabledOrderTypes = (["takeaway", "delivery"] as const).filter((type) =>
    type === "takeaway" ? settings?.order_type_takeaway_enabled !== false : settings?.order_type_delivery_enabled !== false
  );
  const activeDeliveryFee = currentQuote?.delivery_fee ?? (orderType === "delivery" ? deliveryFee : 0);
  const serviceFeeEstimate = currentQuote?.service_fee ?? 0;
  const vatEstimate = currentQuote?.vat_amount ?? 0;
  const total = currentQuote?.total ?? 0;
  const deliveryMinimum = Math.max(settings?.min_delivery_order ?? 0, Number(selectedZone?.min_order ?? 0));
  const belowMinDelivery = orderType === "delivery" && deliveryMinimum > 0 && subtotal < deliveryMinimum;
  const discountOverLimit =
    discount > 0 &&
    !!settings &&
    (discount > settings.max_discount_without_manager ||
      (subtotal > 0 && (discount / subtotal) * 100 > settings.max_cashier_discount_percent));
  const discountReasonMissing = discount > 0 && !!settings?.discount_reason_required && !discountReason.trim();
  const cashBlocked = payment === "cash" && !!settings?.require_open_shift_for_cash && !shift;
  const enabledMethods = (settings?.enabled_payment_methods ?? ["cash", "card", "wallet", "unpaid"]) as PaymentMethod[];
  async function fireOrder() {
    setError("");
    setMsg("");
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
          discount: settings?.allow_discounts ? discount : 0,
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
      setDiscount(0);
      setDiscountReason("");
      setOrderNotes("");
      resetDeliveryDraft();
      setCartDrawerOpen(false);
      setMsg(`${t.pos.orderCreated} ${order.order_no}`);
      await refreshShift(branchId);
      if (historyOpen) await refreshHistory(true);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return {
    can,
    branches,
    branchId,
    setBranchId,
    sources,
    sourceId,
    setSourceId,
    settings,
    shift,
    categories,
    activeCat,
    setActiveCat,
    search,
    setSearch,
    cart,
    setCart,
    orderType,
    setOrderType,
    customers,
    customerId,
    deliveryAddress,
    setDeliveryAddress,
    deliveryPhone,
    setDeliveryPhone,
    deliveryZones,
    deliveryZoneId,
    setDeliveryZoneId,
    setDeliveryFee,
    customerModalOpen,
    setCustomerModalOpen,
    addressModalOpen,
    setAddressModalOpen,
    phoneModalOpen,
    setPhoneModalOpen,
    quickName,
    setQuickName,
    quickPhone,
    setQuickPhone,
    quickAddress,
    setQuickAddress,
    quickAddressLabel,
    setQuickAddressLabel,
    quickExtraPhone,
    setQuickExtraPhone,
    quickBusy,
    discount,
    setDiscount,
    discountReason,
    setDiscountReason,
    orderNotes,
    setOrderNotes,
    payment,
    setPayment,
    shellControlsRoot,
    shellSessionRoot,
    searchInputRef,
    sourceSelectRef,
    msg,
    setMsg,
    error,
    setError,
    done,
    setDone,
    busy,
    currentQuote,
    quoteBusy,
    quoteError,
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
    adminPanel,
    setAdminPanel,
    cartDrawerOpen,
    setCartDrawerOpen,
    visibleProducts,
    selectedCustomer,
    customerAddressOptions,
    customerPhoneOptions,
    enabledOrderTypes,
    activeDeliveryFee,
    serviceFeeEstimate,
    vatEstimate,
    total,
    deliveryMinimum,
    belowMinDelivery,
    discountOverLimit,
    discountReasonMissing,
    cashBlocked,
    enabledMethods,
    itemCount,
    addProduct,
    quickRemove,
    selectDeliveryCustomer,
    openShift,
    closeShift,
    createQuickCustomer,
    addQuickAddress,
    addQuickPhone,
    fireOrder,
    filteredHistory,
    shiftOrdersCount,
    openHistoryOrder,
  };
}

export type PosController = ReturnType<typeof usePosController>;
