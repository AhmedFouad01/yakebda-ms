import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../../lib/api";
import { t } from "../../lib/t";
import type { FullOrder } from "../../components/Receipt";
import { useMe } from "../../lib/me";
import type {
  AdminPanel,
  Branch,
  CustomerAddress,
  DeliveryZone,
  OrderQuoteSummary,
  OrderSource,
  OrderType,
  PaymentMethod,
  PosCustomer,
  Settings,
  Shift,
  ShiftOrderSummary,
} from "./types";
import { addressText, parseAddresses } from "./utils";
import { usePosCart } from "./usePosCart";
import { usePosCatalog } from "./usePosCatalog";

export function usePosController() {
  const [params] = useSearchParams();
  const { can } = useMe();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState(params.get("branch") ?? "");
  const [sources, setSources] = useState<OrderSource[]>([]);
  const [sourceId, setSourceId] = useState("");
  const [settings, setSettings] = useState<Settings | null>(null);
  const [shift, setShift] = useState<Shift | null>(null);
  const [error, setError] = useState("");
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
  const [customers, setCustomers] = useState<PosCustomer[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [deliveryPhone, setDeliveryPhone] = useState("");
  const [deliveryZones, setDeliveryZones] = useState<DeliveryZone[]>([]);
  const [deliveryZoneId, setDeliveryZoneId] = useState("");
  const [deliveryFee, setDeliveryFee] = useState(0);
  const [customerModalOpen, setCustomerModalOpen] = useState(false);
  const [addressModalOpen, setAddressModalOpen] = useState(false);
  const [phoneModalOpen, setPhoneModalOpen] = useState(false);
  const [quickName, setQuickName] = useState("");
  const [quickPhone, setQuickPhone] = useState("");
  const [quickAddress, setQuickAddress] = useState("");
  const [quickAddressLabel, setQuickAddressLabel] = useState("الرئيسي");
  const [quickExtraPhone, setQuickExtraPhone] = useState("");
  const [quickBusy, setQuickBusy] = useState(false);
  const [discount, setDiscount] = useState(0);
  const [discountReason, setDiscountReason] = useState("");
  const [orderNotes, setOrderNotes] = useState("");
  const [payment, setPayment] = useState<PaymentMethod>("cash");
  const [shellControlsRoot, setShellControlsRoot] = useState<HTMLElement | null>(null);
  const [shellSessionRoot, setShellSessionRoot] = useState<HTMLElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const sourceSelectRef = useRef<HTMLSelectElement>(null);
  const [msg, setMsg] = useState("");
  const [done, setDone] = useState<FullOrder | null>(null);
  const [busy, setBusy] = useState(false);
  const [quoteState, setQuoteState] = useState<{ key: string; data: OrderQuoteSummary } | null>(null);
  const [quoteBusy, setQuoteBusy] = useState(false);
  const [quoteError, setQuoteError] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyBusy, setHistoryBusy] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [history, setHistory] = useState<ShiftOrderSummary[]>([]);
  const [historyOrder, setHistoryOrder] = useState<FullOrder | null>(null);
  const [historyOrderBusy, setHistoryOrderBusy] = useState(false);
  const [historyOrderError, setHistoryOrderError] = useState("");
  const [historySearch, setHistorySearch] = useState("");
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);

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

  async function loadCustomers(preferredId?: string) {
    if (!can("customers.lookup") && !can("customers.manage")) {
      setCustomers([]);
      return;
    }
    const response = await api<{ data: PosCustomer[] }>("/customers/lookup");
    setCustomers(response.data);
    if (preferredId) {
      const customer = response.data.find((item) => item.id === preferredId);
      if (customer) selectDeliveryCustomer(customer, response.data);
    }
  }

  function selectDeliveryCustomer(customer: PosCustomer | null, rows = customers) {
    if (!customer) {
      setCustomerId("");
      setDeliveryAddress("");
      setDeliveryPhone("");
      return;
    }
    const current = rows.find((item) => item.id === customer.id) ?? customer;
    setCustomerId(current.id);
    const savedAddresses = parseAddresses(current);
    const preferredAddress = savedAddresses.find((item) => item.is_default) ?? savedAddresses[0];
    setDeliveryAddress(current.address?.trim() || (preferredAddress ? addressText(preferredAddress) : ""));
    setDeliveryPhone(current.phone?.trim() || current.alt_phone?.trim() || "");
  }

  useEffect(() => {
    let cancelled = false;
    if (!can("customers.lookup") && !can("customers.manage")) {
      setCustomers([]);
      return;
    }
    api<{ data: PosCustomer[] }>("/customers/lookup")
      .then((response) => {
        if (!cancelled) setCustomers(response.data);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      });
    return () => { cancelled = true; };
  }, [can]);

  useEffect(() => {
    if (orderType !== "delivery") {
      setDeliveryZones([]);
      setDeliveryZoneId("");
      setDeliveryFee(0);
      return;
    }
    let cancelled = false;
    api<{ data: DeliveryZone[] }>("/delivery-zones")
      .then((response) => {
        if (cancelled) return;
        const active = response.data.filter((zone) => zone.is_active !== false);
        setDeliveryZones(active);
        setDeliveryZoneId((current) => active.some((zone) => zone.id === current) ? current : "");
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      });
    return () => { cancelled = true; };
  }, [orderType, branchId]);

  async function loadShift(currentBranchId: string) {
    try {
      const response = await api<{ data: Shift | null }>(`/shifts/current?branch_id=${currentBranchId}`);
      setShift(response.data);
    } catch {
      setShift(null);
    }
  }

  async function loadHistory(silent = false) {
    if (!branchId) return;
    if (!silent) setHistoryBusy(true);
    setHistoryError("");
    try {
      const response = await api<{ data: { shift: Shift | null; orders: ShiftOrderSummary[] } }>(
        `/orders/current-shift?branch_id=${branchId}`
      );
      setShift(response.data.shift);
      setHistory(response.data.orders);
    } catch (e: any) {
      setHistoryError(e.message);
    } finally {
      if (!silent) setHistoryBusy(false);
    }
  }

  async function openHistoryOrder(id: string) {
    if (historyOrderBusy) return;
    setHistoryOrderBusy(true);
    setHistoryOrderError("");
    try {
      const response = await api<{ data: FullOrder }>(`/orders/${id}`);
      setHistoryOpen(false);
      setHistoryOrder(response.data);
    } catch (e: any) {
      setHistoryOrderError(e.message);
    } finally {
      setHistoryOrderBusy(false);
    }
  }

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
    loadShift(branchId);
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


  useEffect(() => {
    if (!historyOpen || !branchId) return;
    void loadHistory();
    const timer = window.setInterval(() => void loadHistory(true), 10000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyOpen, branchId]);

  const selectedCustomer = customers.find((customer) => customer.id === customerId) ?? null;
  const selectedZone = deliveryZones.find((zone) => zone.id === deliveryZoneId) ?? null;
  const customerAddressOptions = (() => {
    const options: Array<{ label: string; value: string }> = [];
    const add = (label: string, value?: string | null) => {
      const clean = value?.trim();
      if (clean && !options.some((item) => item.value === clean)) options.push({ label, value: clean });
    };
    add("العنوان الرئيسي", selectedCustomer?.address);
    for (const address of parseAddresses(selectedCustomer)) {
      const value = addressText(address);
      add(address.label?.trim() || "عنوان محفوظ", value);
    }
    return options;
  })();
  const customerPhoneOptions = Array.from(new Set(
    [selectedCustomer?.phone?.trim(), selectedCustomer?.alt_phone?.trim()].filter(Boolean) as string[]
  ));

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
  async function openShift(openingCash: number): Promise<boolean> {
    if (!branchId) return false;
    try {
      await api("/shifts/open", { method: "POST", body: { branch_id: branchId, opening_cash: openingCash } });
      await loadShift(branchId);
      setError("");
      return true;
    } catch (e: any) {
      setError(e.message);
      return false;
    }
  }

  async function closeShift(actualCash: number): Promise<boolean> {
    if (!shift) return false;
    try {
      await api(`/shifts/${shift.id}/close`, { method: "POST", body: { actual_cash: actualCash } });
      await loadShift(branchId);
      setError("");
      return true;
    } catch (e: any) {
      setError(e.message);
      return false;
    }
  }

  async function createQuickCustomer() {
    if (!quickName.trim() || !quickPhone.trim() || quickBusy) return;
    setQuickBusy(true);
    setError("");
    try {
      const initialAddress = quickAddress.trim();
      const response = await api<{ data: PosCustomer }>("/customers", {
        method: "POST",
        body: {
          name: quickName.trim(),
          phone: quickPhone.trim(),
          address: initialAddress || null,
          addresses: initialAddress ? [{ label: "الرئيسي", area: initialAddress, is_default: true }] : [],
        },
      });
      await loadCustomers(response.data.id);
      setQuickName("");
      setQuickPhone("");
      setQuickAddress("");
      setCustomerModalOpen(false);
      setMsg("تمت إضافة العميل واختياره");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setQuickBusy(false);
    }
  }

  async function addQuickAddress() {
    if (!selectedCustomer || !quickAddress.trim() || quickBusy) return;
    setQuickBusy(true);
    setError("");
    try {
      const existing = parseAddresses(selectedCustomer);
      const nextAddress: CustomerAddress = {
        label: quickAddressLabel.trim() || "عنوان إضافي",
        area: quickAddress.trim(),
        is_default: existing.length === 0 && !selectedCustomer.address,
      };
      await api("/customers/" + selectedCustomer.id, {
        method: "PATCH",
        body: {
          address: selectedCustomer.address || (nextAddress.is_default ? quickAddress.trim() : null),
          addresses: [...existing, nextAddress],
        },
      });
      await loadCustomers(selectedCustomer.id);
      setDeliveryAddress(quickAddress.trim());
      setQuickAddress("");
      setQuickAddressLabel("الرئيسي");
      setAddressModalOpen(false);
      setMsg("تم حفظ عنوان التوصيل");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setQuickBusy(false);
    }
  }

  async function addQuickPhone() {
    if (!selectedCustomer || !quickExtraPhone.trim() || quickBusy) return;
    setQuickBusy(true);
    setError("");
    try {
      const body = selectedCustomer.phone?.trim()
        ? { alt_phone: quickExtraPhone.trim() }
        : { phone: quickExtraPhone.trim() };
      await api("/customers/" + selectedCustomer.id, { method: "PATCH", body });
      await loadCustomers(selectedCustomer.id);
      setDeliveryPhone(quickExtraPhone.trim());
      setQuickExtraPhone("");
      setPhoneModalOpen(false);
      setMsg(selectedCustomer.alt_phone ? "تم تحديث الرقم الإضافي" : "تم حفظ الرقم الإضافي");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setQuickBusy(false);
    }
  }

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
      setCustomerId("");
      setDeliveryAddress("");
      setDeliveryPhone("");
      setDeliveryZoneId("");
      setDeliveryFee(0);
      setCartDrawerOpen(false);
      setMsg(`${t.pos.orderCreated} ${order.order_no}`);
      await loadShift(branchId);
      if (historyOpen) await loadHistory(true);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const normalizedHistorySearch = historySearch.trim().replace(/^#/, "").toLocaleLowerCase("ar-EG");
  const filteredHistory = normalizedHistorySearch
    ? history.filter((order) => `${order.order_prefix ?? ""}${order.order_no}`.toLocaleLowerCase("ar-EG").includes(normalizedHistorySearch))
    : history;
  const shiftOrdersCount = shift?.totals?.orders_count ?? history.length;

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
