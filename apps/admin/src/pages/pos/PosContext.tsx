import { createContext, type ReactNode, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "react-router-dom";
import { api, resolveAssetUrl } from "../../lib/api";
import { t } from "../../lib/t";
import { Receipt, FullOrder } from "../../components/Receipt";
import { OrderDetail } from "../../components/OrderDetail";
import { useMe } from "../../lib/me";
import { Drawer } from "../../components/ui/overlays";
import { PosCartLine } from "../../components/pos/PosCartLine";

interface MenuModifier {
  id: string;
  name_ar: string;
  price_delta: string | number;
}
interface MenuGroup {
  id: string;
  name_ar: string;
  min_select: number;
  max_select: number;
  is_required: boolean;
  modifiers: MenuModifier[];
}
interface MenuVariant {
  id: string;
  name_ar: string;
  price_delta: string | number;
}
interface MenuProduct {
  id: string;
  name_ar: string;
  effective_price: number;
  is_available: boolean;
  pos_visible?: boolean;
  image_url?: string | null;
  ingredients_ar?: string | null;
  portion_note_ar?: string | null;
  availability_note_ar?: string | null;
  variants: MenuVariant[];
  modifier_groups: MenuGroup[];
}
interface MenuCategory {
  id: string;
  name_ar: string;
  products: MenuProduct[];
}
interface Branch {
  id: string;
  name: string;
}
interface OrderSource {
  id: string;
  code: string;
  name_ar: string;
  supports_takeaway: boolean;
  supports_delivery: boolean;
}
interface DeliveryZone {
  id: string;
  name_ar: string;
  fee: string | number;
  min_order: string | number;
  is_active: boolean;
}
interface CustomerAddress {
  label?: string | null;
  area?: string | null;
  landmark?: string | null;
  floor?: string | null;
  notes?: string | null;
  is_default?: boolean;
}
interface PosCustomer {
  id: string;
  name: string;
  phone?: string | null;
  alt_phone?: string | null;
  address?: string | null;
  addresses?: CustomerAddress[] | string | null;
}
interface Shift {
  id: string;
  opened_at: string;
  opening_cash: string | number;
  totals?: {
    cash_sales: number;
    card_sales: number;
    wallet_sales: number;
    expected_cash: number;
    orders_count: number;
  };
}
interface ShiftOrderPreviewItem {
  id: string;
  name_ar: string;
  variant_name_ar?: string | null;
  qty: number;
  image_url?: string | null;
}
interface ShiftOrderSummary {
  id: string;
  order_no: number;
  order_prefix?: string | null;
  order_type: string;
  source_name?: string | null;
  status: string;
  kitchen_status: "draft" | "waiting" | "preparing" | "ready" | "completed" | "cancelled";
  payment_status: "unpaid" | "partial" | "paid";
  subtotal: string | number;
  discount: string | number;
  service_fee: string | number;
  vat_amount: string | number;
  delivery_fee: string | number;
  rounding_adjustment: string | number;
  total: string | number;
  paid_amount: string | number;
  item_count: number;
  preview_items: ShiftOrderPreviewItem[];
  created_at: string;
  submitted_at?: string | null;
  in_kitchen_at?: string | null;
  ready_at?: string | null;
  completed_at?: string | null;
  cancelled_at?: string | null;
}

interface Settings {
  show_product_images: boolean;
  require_open_shift_for_cash: boolean;
  enabled_payment_methods: string[];
  receipt_printing_enabled: boolean;
  allow_discounts: boolean;
  // YKMS-02E — الإعدادات مصدر الحقيقة
  order_type_takeaway_enabled: boolean;
  order_type_delivery_enabled: boolean;
  default_delivery_fee: number;
  min_delivery_order: number;
  max_discount_without_manager: number;
  max_cashier_discount_percent: number;
  discount_reason_required: boolean;
  vat_enabled: boolean;
  vat_percentage: number;
  prices_include_vat: boolean;
  service_fee_enabled: boolean;
  service_fee_type: "percent" | "fixed";
  service_fee_value: number;
  rounding_rule: "none" | "nearest_050" | "nearest_1";
  require_customer_for_delivery: boolean;
  require_address_for_delivery: boolean;
}
interface OrderQuoteSummary {
  subtotal: number;
  discount: number;
  delivery_fee: number;
  service_fee: number;
  vat_amount: number;
  rounding_adjustment: number;
  total: number;
}
interface CartLine {
  key: string;
  product: MenuProduct;
  variant?: MenuVariant | null;
  modifiers: MenuModifier[];
  qty: number;
  notes: string;
}
type OrderType = "takeaway" | "delivery";
type AdminPanel = "shift" | null;
type PaymentMethod = "cash" | "card" | "wallet" | "unpaid";

const CAT_ORDER = ["الكل", "ساندوتشات", "أطباق", "وجبات", "الحواوشي", "البطاطس", "فواتح الشهية", "إضافات", "مشروبات"];
const paymentLabels: Record<PaymentMethod, string> = {
  cash: t.pos.cash,
  card: t.pos.card,
  wallet: t.pos.wallet,
  unpaid: t.pos.unpaid,
};

const money = (v: number) => `${v.toFixed(2)} ${t.reports.egp}`;
const unitPrice = (line: CartLine) =>
  line.product.effective_price +
  Number(line.variant?.price_delta ?? 0) +
  line.modifiers.reduce((sum, mod) => sum + Number(mod.price_delta), 0);
const cartLineKey = (product: MenuProduct, variant?: MenuVariant | null, modifiers: MenuModifier[] = []) =>
  `${product.id}|${variant?.id ?? ""}|${modifiers.map((modifier) => modifier.id).sort().join(",")}`;
const catRank = (name: string) => {
  const index = CAT_ORDER.indexOf(name);
  return index === -1 ? 99 : index;
};

function parseAddresses(customer: PosCustomer | null): CustomerAddress[] {
  if (!customer?.addresses) return [];
  if (Array.isArray(customer.addresses)) return customer.addresses;
  try {
    const parsed = JSON.parse(customer.addresses);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function addressText(address: CustomerAddress): string {
  return [address.area, address.landmark, address.floor, address.notes]
    .map((value) => value?.trim())
    .filter(Boolean)
    .join(" — ");
}

export function usePosState() {
  const [params] = useSearchParams();
  const { can } = useMe();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState(params.get("branch") ?? "");
  const [sources, setSources] = useState<OrderSource[]>([]);
  const [sourceId, setSourceId] = useState("");
  const [settings, setSettings] = useState<Settings | null>(null);
  const [shift, setShift] = useState<Shift | null>(null);
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [activeCat, setActiveCat] = useState("الكل");
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
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
  const [error, setError] = useState("");
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

  async function loadMenu(currentBranchId = branchId, currentSourceId = sourceId) {
    if (!currentBranchId) return;
    const query = currentSourceId ? "?source_id=" + encodeURIComponent(currentSourceId) : "";
    const response = await api<{ data: { categories: MenuCategory[] } }>("/branches/" + currentBranchId + "/menu" + query);
    const sorted = [...response.data.categories].sort((a, b) => catRank(a.name_ar) - catRank(b.name_ar));
    const refreshed = new Map(sorted.flatMap((category) => category.products).map((product) => [product.id, product]));
    setCategories(sorted);
    setCart((rows) => rows.map((line) => ({ ...line, product: refreshed.get(line.product.id) ?? line.product })));
    setActiveCat("الكل");
  }

  useEffect(() => {
    if (!branchId) return;
    setSourceId("");
    loadMenu(branchId, "").catch((e: Error) => setError(e.message));
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
    if (!branchId) return;
    loadMenu(branchId, sourceId).catch((e: Error) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchId, sourceId]);

  useEffect(() => {
    if (!historyOpen || !branchId) return;
    void loadHistory();
    const timer = window.setInterval(() => void loadHistory(true), 10000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyOpen, branchId]);

  // YKMS-02E: إخفاء الأصناف غير المرئية في POS (pos_visible === false)
  const allProducts = useMemo(
    () => categories.flatMap((category) => category.products).filter((p) => p.pos_visible !== false),
    [categories]
  );
  const visibleProducts = useMemo(() => {
    if (search) {
      return allProducts.filter(
        (product) =>
          product.name_ar.includes(search) ||
          product.ingredients_ar?.includes(search) ||
          product.portion_note_ar?.includes(search)
      );
    }
    if (activeCat === "الكل") return allProducts;
    return (categories.find((category) => category.name_ar === activeCat)?.products ?? []).filter((p) => p.pos_visible !== false);
  }, [categories, allProducts, activeCat, search]);

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

  const localSubtotal = cart.reduce((sum, line) => sum + unitPrice(line) * line.qty, 0);
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
  const itemCount = cart.reduce((sum, line) => sum + line.qty, 0);

  function addProduct(product: MenuProduct, variant?: MenuVariant | null, modifiers: MenuModifier[] = []) {
    const key = cartLineKey(product, variant, modifiers);
    setCart((current) => {
      const found = current.find((line) => line.key === key && !line.notes);
      if (found) {
        return current.map((line) => (line === found ? { ...line, qty: line.qty + 1 } : line));
      }
      return [...current, { key, product, variant, modifiers, qty: 1, notes: "" }];
    });
  }

  function quickRemove(product: MenuProduct, variant?: MenuVariant | null, modifiers: MenuModifier[] = []) {
    const key = cartLineKey(product, variant, modifiers);
    setCart((rows) => {
      const exactIndex = rows.findIndex((line) => line.key === key && !line.notes);
      const fallbackIndex = exactIndex === -1 ? rows.findIndex((line) => line.key === key) : exactIndex;
      if (fallbackIndex === -1) return rows;
      return rows.flatMap((line, index) => {
        if (index !== fallbackIndex) return [line];
        return line.qty > 1 ? [{ ...line, qty: line.qty - 1 }] : [];
      });
    });
  }

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
      setCart([]);
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
    setBranches,
    branchId,
    setBranchId,
    sources,
    setSources,
    sourceId,
    setSourceId,
    settings,
    setSettings,
    shift,
    setShift,
    categories,
    setCategories,
    activeCat,
    setActiveCat,
    search,
    setSearch,
    cart,
    setCart,
    orderType,
    setOrderType,
    customers,
    setCustomers,
    customerId,
    setCustomerId,
    deliveryAddress,
    setDeliveryAddress,
    deliveryPhone,
    setDeliveryPhone,
    deliveryZones,
    setDeliveryZones,
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
    setQuickBusy,
    discount,
    setDiscount,
    discountReason,
    setDiscountReason,
    orderNotes,
    setOrderNotes,
    payment,
    setPayment,
    shellControlsRoot,
    setShellControlsRoot,
    shellSessionRoot,
    setShellSessionRoot,
    searchInputRef,
    sourceSelectRef,
    msg,
    setMsg,
    error,
    setError,
    done,
    setDone,
    busy,
    setBusy,
    quoteState,
    setQuoteState,
    quoteBusy,
    setQuoteBusy,
    quoteError,
    setQuoteError,
    historyOpen,
    setHistoryOpen,
    historyBusy,
    setHistoryBusy,
    historyError,
    setHistoryError,
    history,
    setHistory,
    historyOrder,
    setHistoryOrder,
    historyOrderBusy,
    setHistoryOrderBusy,
    historyOrderError,
    setHistoryOrderError,
    historySearch,
    setHistorySearch,
    expandedHistoryId,
    setExpandedHistoryId,
    adminPanel,
    setAdminPanel,
    cartDrawerOpen,
    setCartDrawerOpen,
    quotePayload,
    quoteKey,
    currentQuote,
    loadCustomers,
    selectDeliveryCustomer,
    loadShift,
    loadHistory,
    openHistoryOrder,
    loadMenu,
    allProducts,
    visibleProducts,
    selectedCustomer,
    selectedZone,
    customerAddressOptions,
    customerPhoneOptions,
    localSubtotal,
    subtotal,
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
    openShift,
    closeShift,
    createQuickCustomer,
    addQuickAddress,
    addQuickPhone,
    fireOrder,
    normalizedHistorySearch,
    filteredHistory,
    shiftOrdersCount,
  };
}

export type PosController = ReturnType<typeof usePosState>;

const PosContext = createContext<PosController | null>(null);

export function PosProvider({ children }: { children: ReactNode }) {
  const value = usePosState();
  return <PosContext.Provider value={value}>{children}</PosContext.Provider>;
}

export function usePosController(): PosController {
  const value = useContext(PosContext);
  if (!value) throw new Error("usePosController must be used inside PosProvider");
  return value;
}
