import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "react-router-dom";
import { api, resolveAssetUrl } from "../lib/api";
import { t } from "../lib/t";
import { Receipt, FullOrder } from "../components/Receipt";
import { OrderDetail } from "../components/OrderDetail";
import { useMe } from "../lib/me";
import { Drawer } from "../components/ui/overlays";

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

export function Pos() {
  const [params] = useSearchParams();
  const { can, me } = useMe();
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
  const [cashTender, setCashTender] = useState<number | null>(null);
  const [shellControlsRoot, setShellControlsRoot] = useState<HTMLElement | null>(null);
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
  const tenderSuggestions = useMemo(() => {
    if (total <= 0) return [] as number[];
    const exact = Math.round(total * 100) / 100;
    const roundUp = (step: number) => Math.ceil((exact + 0.0001) / step) * step;
    const middleStep = exact < 200 ? 50 : 100;
    const highStep = exact < 200 ? 100 : exact < 1000 ? 500 : 1000;
    const values = [exact, roundUp(middleStep), roundUp(highStep)];
    return values.filter((value, index) => values.findIndex((candidate) => Math.abs(candidate - value) < 0.01) === index).slice(0, 3);
  }, [total]);
  const selectedChange = cashTender == null ? 0 : Math.max(0, Math.round((cashTender - total) * 100) / 100);

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
      setCashTender(null);
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

  return (
    <div className="posx" dir="rtl">
      {shellControlsRoot && createPortal(
        <div className="posx-shell-order-controls">
          <div className="seg dark posx-shell-order-types">
            {enabledOrderTypes.map((type) => (
              <button
                type="button"
                key={type}
                className={orderType === type ? "active" : ""}
                onClick={() => {
                  setOrderType(type);
                  setSourceId("");
                  setDeliveryZoneId("");
                  setDeliveryFee(0);
                  setCashTender(null);
                }}
              >
                {t.orders.types[type]}
              </button>
            ))}
          </div>
          <label className="posx-shell-source">
            <span>مصدر الطلب</span>
            <select value={sourceId} onChange={(event) => setSourceId(event.target.value)} aria-label="مصدر الطلب" required>
              <option value="">اختر مصدر الطلب…</option>
              {sources.map((source) => <option key={source.id} value={source.id}>{source.name_ar}</option>)}
            </select>
          </label>
        </div>,
        shellControlsRoot
      )}

      <div className="posx-body">
        <section className="posx-menu">
          <div className="posx-menu-top">
            <div className="posx-menu-tools">
              <select value={branchId} onChange={(e) => setBranchId(e.target.value)} title="الفرع">
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>{branch.name}</option>
              ))}
            </select>
            <span className={shift ? "posx-shift on" : "posx-shift off"}>
              <span>{me?.name ?? "الكاشير"}</span>
              <span>{shift ? t.shift.openTitle : t.shift.noShift}</span>
              {can("shifts.manage") && <button onClick={() => setAdminPanel("shift")}>{shift ? t.shift.close : t.shift.open}</button>}
            </span>
            <input className="posx-search" placeholder="ابحث باسم الصنف أو المكونات…" value={search} onChange={(e) => setSearch(e.target.value)} />
            <button className="posx-history-btn" onClick={() => setHistoryOpen(true)}>سجل الطلبات</button>
            <button
              type="button"
              className="posx-cart-toggle"
              aria-controls="posx-cart-drawer"
              aria-expanded={cartDrawerOpen}
              onClick={() => setCartDrawerOpen(true)}
            >
              السلة <span>{itemCount}</span>
            </button>
            </div>
            <div className="posx-cats">
            <button className={activeCat === "الكل" && !search ? "active" : ""} onClick={() => { setActiveCat("الكل"); setSearch(""); }}>الكل</button>
              {categories.map((category) => (
                <button key={category.id} className={category.name_ar === activeCat && !search ? "active" : ""} onClick={() => { setActiveCat(category.name_ar); setSearch(""); }}>
                  {category.name_ar}
                </button>
              ))}
            </div>
          </div>
          <div className="posx-grid">
            {visibleProducts.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                cartLines={cart}
                showImage={settings?.show_product_images !== false}
                money={money}
                onAdd={(variant, modifiers) => addProduct(product, variant, modifiers)}
                onQuickRemove={(variant, modifiers) => quickRemove(product, variant, modifiers)}
              />
            ))}
          </div>
        </section>

        <aside id="posx-cart-drawer" className={`posx-cart${cartDrawerOpen ? " is-open" : ""}`}>
          <div className="posx-cart-head">
            <h3>{t.pos.cart}</h3>
            <strong>{itemCount} صنف</strong>
            <button type="button" className="posx-cart-close" aria-label="إغلاق السلة" onClick={() => setCartDrawerOpen(false)}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <path d="M6 6l12 12M18 6 6 18" />
              </svg>
            </button>
          </div>
          {/* YKMS-02F: إحصائيات الشيفت انتقلت لشاشة «إدارة الشيفت» — السلة للتشغيل فقط */}
          {error && <div className="alert dark-alert">{error}</div>}
          {msg && <div className="ok dark-ok">{msg}</div>}

          <div className="posx-cart-scroll">
            <div className="posx-cart-lines">
            {!cart.length && <div className="posx-empty">{t.pos.emptyCart}</div>}
            {cart.map((line, index) => (
              <div key={`${line.key}-${index}`} className="posx-line">
                <ProductThumb product={line.product} />
                <div className="posx-line-content">
                  <div className="posx-line-head">
                    <span className="posx-line-name">{line.product.name_ar}</span>
                    <span className="posx-line-total">{money(unitPrice(line) * line.qty)}</span>
                  </div>
                  <div className="posx-line-selection">
                    {line.variant?.name_ar && <span>{line.variant.name_ar}</span>}
                    {line.modifiers.map((modifier) => <span key={modifier.id}>{modifier.name_ar}</span>)}
                  </div>
                  <div className="posx-line-actions">
                    <span className="posx-line-qty" aria-label={`الكمية ${line.qty}`}>{line.qty}</span>
                    <button aria-label="زيادة الكمية" onClick={() => setCart((rows) => rows.map((row, i) => (i === index ? { ...row, qty: row.qty + 1 } : row)))}>+</button>
                    <button aria-label="تقليل الكمية" onClick={() => setCart((rows) => rows.flatMap((row, i) => i !== index ? [row] : row.qty > 1 ? [{ ...row, qty: row.qty - 1 }] : []))}>−</button>
                    <button className="rm" aria-label="حذف الصنف من الطلب" onClick={() => setCart((rows) => rows.filter((_, i) => i !== index))}>✕</button>
                  </div>
                  <input className="posx-line-note" placeholder={t.pos.itemNotes} value={line.notes} onChange={(e) => setCart((rows) => rows.map((row, i) => (i === index ? { ...row, notes: e.target.value } : row)))} />
                </div>
              </div>
            ))}
          </div>

          <div className="posx-opts">
            {orderType === "delivery" && (
              <div className="posx-delivery-fields">
                <label className="posx-delivery-field posx-delivery-field-full">
                  <span className="posx-delivery-label">
                    <b>العميل</b>
                    <button
                      type="button"
                      className="posx-quick-add"
                      aria-label="إضافة عميل جديد"
                      title={can("customers.manage") ? "إضافة عميل جديد" : "تحتاج صلاحية إدارة العملاء"}
                      disabled={!can("customers.manage")}
                      onClick={() => setCustomerModalOpen(true)}
                    >+</button>
                  </span>
                  <select
                    value={customerId}
                    onChange={(event) => selectDeliveryCustomer(customers.find((item) => item.id === event.target.value) ?? null)}
                  >
                    <option value="">اختر العميل…</option>
                    {customers.map((customer) => (
                      <option key={customer.id} value={customer.id}>
                        {customer.name}{customer.phone ? ` — ${customer.phone}` : ""}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="posx-delivery-field posx-delivery-field-full">
                  <span className="posx-delivery-label">
                    <b>عنوان التوصيل</b>
                    <button
                      type="button"
                      className="posx-quick-add"
                      aria-label="إضافة عنوان للعميل"
                      title={!selectedCustomer ? "اختر العميل أولًا" : "إضافة عنوان جديد"}
                      disabled={!selectedCustomer || !can("customers.manage")}
                      onClick={() => setAddressModalOpen(true)}
                    >+</button>
                  </span>
                  <select value={deliveryAddress} disabled={!selectedCustomer} onChange={(event) => setDeliveryAddress(event.target.value)}>
                    <option value="">اختر عنوان التوصيل…</option>
                    {customerAddressOptions.map((address) => (
                      <option key={address.value} value={address.value}>{address.label} — {address.value}</option>
                    ))}
                  </select>
                </label>

                <div className="posx-delivery-split posx-delivery-field-full">
                  <label className="posx-delivery-field">
                    <span className="posx-delivery-label"><b>زون التوصيل</b></span>
                    <select
                      value={deliveryZoneId}
                      onChange={(event) => {
                        const nextId = event.target.value;
                        const zone = deliveryZones.find((item) => item.id === nextId);
                        setDeliveryZoneId(nextId);
                        setDeliveryFee(zone ? Number(zone.fee) : 0);
                      }}
                    >
                      <option value="">اختر الزون…</option>
                      {deliveryZones.map((zone) => (
                        <option key={zone.id} value={zone.id}>{zone.name_ar} — {money(Number(zone.fee))}</option>
                      ))}
                    </select>
                  </label>

                  <label className="posx-delivery-field">
                    <span className="posx-delivery-label">
                      <b>رقم التليفون</b>
                      <button
                        type="button"
                        className="posx-quick-add"
                        aria-label="إضافة رقم تليفون"
                        title={!selectedCustomer ? "اختر العميل أولًا" : "إضافة أو تحديث الرقم الإضافي"}
                        disabled={!selectedCustomer || !can("customers.manage")}
                        onClick={() => setPhoneModalOpen(true)}
                      >+</button>
                    </span>
                    <select value={deliveryPhone} disabled={!selectedCustomer} onChange={(event) => setDeliveryPhone(event.target.value)}>
                      <option value="">اختر رقم التليفون…</option>
                      {customerPhoneOptions.map((phone, index) => (
                        <option key={phone} value={phone}>{index === 0 ? "الأساسي" : "الإضافي"} — {phone}</option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>
            )}
            {settings?.allow_discounts !== false && (
              <>
                <input type="number" min={0} placeholder={t.pos.discount} value={discount || ""} onChange={(e) => setDiscount(Number(e.target.value))} />
                {discount > 0 && settings?.discount_reason_required && (
                  <input placeholder={t.pos.discountReason} value={discountReason} onChange={(e) => setDiscountReason(e.target.value)} />
                )}
                {discountOverLimit && <div className="posx-warn">{t.pos.discountNeedsManager}</div>}
              </>
            )}
            {belowMinDelivery && <div className="posx-warn">{t.pos.belowMinDelivery} ({money(deliveryMinimum)})</div>}
            <input placeholder={t.pos.orderNotes} value={orderNotes} onChange={(e) => setOrderNotes(e.target.value)} />
            <div className="seg dark wrap">
              {enabledMethods.map((method) => (
                <button key={method} className={payment === method ? "active" : ""} onClick={() => { setPayment(method); setCashTender(null); }}>{paymentLabels[method] ?? method}</button>
              ))}
            </div>
            {cashBlocked && <div className="posx-warn">{t.shift.cashNeedsShift}</div>}
            </div>
          </div>

          <div className="posx-totals">
            {(currentQuote?.discount ?? discount) > 0 && <div className="receipt-row"><span>{t.pos.discount}</span><span>{money(currentQuote?.discount ?? discount)}</span></div>}
            {serviceFeeEstimate > 0 && <div className="receipt-row"><span>{t.pos.serviceFee}</span><span>{money(serviceFeeEstimate)}</span></div>}
            {orderType === "delivery" && activeDeliveryFee > 0 && <div className="receipt-row"><span>{t.pos.deliveryFee}</span><span>{money(activeDeliveryFee)}</span></div>}
            {vatEstimate > 0 && <div className="receipt-row"><span>{t.pos.vat} ({settings?.vat_percentage}%)</span><span>{money(vatEstimate)}</span></div>}
            <div className="receipt-row posx-total"><span>{t.pos.total}</span><span>{quoteBusy && !currentQuote ? "…" : money(total)}</span></div>
            {payment === "cash" && total > 0 && (
              <div className="posx-change-panel">
                <span className="posx-change-title">استلم من العميل</span>
                <div className="posx-change-options">
                  {tenderSuggestions.map((amount) => {
                    const change = Math.max(0, Math.round((amount - total) * 100) / 100);
                    const exact = change < 0.01;
                    return (
                      <button
                        type="button"
                        key={amount}
                        className={`posx-change-option${cashTender != null && Math.abs(cashTender - amount) < 0.01 ? " active" : ""}`}
                        onClick={() => setCashTender(amount)}
                      >
                        <b>{money(amount)}</b>
                        <span>{exact ? "بدون باقي" : `الباقي ${money(change)}`}</span>
                      </button>
                    );
                  })}
                </div>
                {cashTender != null && (
                  <div className="posx-change-result">
                    <span>الباقي للعميل</span>
                    <strong>{money(selectedChange)}</strong>
                  </div>
                )}
              </div>
            )}
          </div>

          {(() => {
            // YKMS-02F: أسباب تعطيل واضحة — لا زر معطّل بلا تفسير
            const deliveryIncomplete =
              orderType === "delivery" &&
              ((settings?.require_customer_for_delivery !== false && !customerId) ||
                (settings?.require_address_for_delivery !== false && !deliveryAddress.trim()) ||
                !deliveryZoneId ||
                !deliveryPhone.trim());
            const fireReason = !cart.length
              ? "السلة فارغة"
              : !sourceId
                ? "اختر مصدر الطلب"
              : quoteError
                ? quoteError
                : quoteBusy || !currentQuote
                  ? "جاري حساب الإجمالي"
                  : deliveryIncomplete
                ? "بيانات الدليفري ناقصة"
                : belowMinDelivery
                  ? "أقل من الحد الأدنى للتوصيل"
                  : discountReasonMissing
                    ? "سبب الخصم مطلوب"
                    : discountOverLimit && !can("orders.discount_above_limit")
                      ? "الخصم يتطلب موافقة مدير"
                      : null;
            const payReason = fireReason ?? (cashBlocked ? "يجب فتح شيفت" : null);
            const fireDisabled = busy || !!fireReason;
            return (
              <div className="posx-fire-wrap">
                <button className="posx-order-now" disabled={fireDisabled || !!payReason} title={payReason ?? undefined} onClick={fireOrder}>
                  {busy ? "جاري تسجيل الطلب…" : "طلب الآن"}
                </button>
                {(payReason ?? fireReason) && <div className="posx-fire-reason">{payReason ?? fireReason}</div>}
              </div>
            );
          })()}
        </aside>
        {cartDrawerOpen && (
          <button
            type="button"
            className="posx-cart-backdrop"
            aria-label="إغلاق السلة"
            onClick={() => setCartDrawerOpen(false)}
          />
        )}
      </div>

      <Drawer open={historyOpen} onClose={() => setHistoryOpen(false)} title="سجل طلبات الشيفت" wide>
        <div className="posx-history">
          <div className="posx-history-toolbar">
            <label className="posx-history-search">
              <span>بحث برقم الطلب</span>
              <input
                inputMode="numeric"
                placeholder="مثال: 31 أو #31"
                value={historySearch}
                onChange={(event) => setHistorySearch(event.target.value)}
              />
            </label>
            <div className="posx-history-kpi" aria-label={`إجمالي طلبات الشيفت ${shiftOrdersCount}`}>
              <span>إجمالي طلبات الشيفت</span>
              <strong>{shiftOrdersCount}</strong>
            </div>
          </div>

          {historyBusy && <div className="posx-history-empty">جارٍ تحميل الطلبات…</div>}
          {!historyBusy && historyError && <div className="alert dark-alert">{historyError}</div>}
          {historyOrderBusy && <div className="posx-history-empty">جارٍ تحميل تفاصيل الطلب…</div>}
          {!historyOrderBusy && historyOrderError && <div className="alert dark-alert">{historyOrderError}</div>}
          {!historyBusy && !historyError && !shift && (
            <div className="posx-history-empty">لا يوجد شيفت مفتوح لهذا الكاشير.</div>
          )}
          {!historyBusy && !historyError && shift && !history.length && (
            <div className="posx-history-empty">لم يتم تسجيل طلبات في الشيفت الحالي بعد.</div>
          )}
          {!historyBusy && !historyError && history.length > 0 && !filteredHistory.length && (
            <div className="posx-history-empty">لا يوجد طلب مطابق لرقم البحث.</div>
          )}

          <div className="posx-history-list">
            {filteredHistory.map((order) => {
              const expanded = expandedHistoryId === order.id;
              const amount = Number(order.total);
              const paymentState = order.payment_status === "paid" ? "مدفوع" : order.payment_status === "partial" ? "مدفوع جزئيًا" : "غير مدفوع";
              const kitchenState =
                order.kitchen_status === "waiting" ? "في انتظار المطبخ" :
                order.kitchen_status === "preparing" ? "قيد التحضير" :
                order.kitchen_status === "ready" ? "جاهز" :
                order.kitchen_status === "completed" ? "مكتمل" :
                order.kitchen_status === "cancelled" ? "ملغي" : "مسودة";
              return (
                <article key={order.id} className={`posx-history-card${expanded ? " expanded" : ""}`}>
                  <button
                    type="button"
                    className="posx-history-summary"
                    aria-expanded={expanded}
                    aria-controls={`shift-order-${order.id}`}
                    onClick={() => setExpandedHistoryId((current) => current === order.id ? null : order.id)}
                  >
                    <span className="posx-history-main">
                      <strong>#{order.order_prefix ?? ""}{order.order_no}</strong>
                      <span>{new Date(order.created_at).toLocaleString("ar-EG", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
                    </span>
                    <span className="posx-history-meta">
                      <span>{t.orders.types[order.order_type] ?? order.order_type}</span>
                      <span>{order.item_count} قطعة</span>
                       <span>{order.source_name ?? "مصدر غير مسجل"}</span>
                      <span className={`posx-history-status pay-${order.payment_status}`}>{paymentState}</span>
                      <span className={`posx-history-status kitchen-${order.kitchen_status}`}>{kitchenState}</span>
                    </span>
                    <span className="posx-history-expand-icon" aria-hidden>{expanded ? "−" : "+"}</span>
                  </button>

                  {expanded && (
                    <div id={`shift-order-${order.id}`} className="posx-history-expanded">
                      <div className="posx-history-items">
                        {order.preview_items.map((item) => {
                          const src = resolveAssetUrl(item.image_url);
                          return (
                            <span key={item.id} className="posx-history-item">
                              {src ? <img src={src} alt="" /> : <span className="posx-history-item-ph">{item.name_ar.trim().charAt(0)}</span>}
                              <span className="posx-history-item-copy">
                                <b>{item.qty} × {item.name_ar}</b>
                                {item.variant_name_ar && <small>{item.variant_name_ar}</small>}
                              </span>
                            </span>
                          );
                        })}
                      </div>
                      <div className="posx-history-expanded-foot">
                        <strong>{money(amount)}</strong>
                        <button type="button" disabled={historyOrderBusy} onClick={() => openHistoryOrder(order.id)}>فتح التفاصيل الكاملة</button>
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </div>
      </Drawer>

      {historyOrder && (
        <div className="modal-back" onClick={() => setHistoryOrder(null)}>
          <div className="modal od-modal" role="dialog" aria-modal="true" aria-labelledby="pos-order-detail-title" onClick={(e) => e.stopPropagation()}>
            <header className="od-modal-head">
              <div className="od-modal-title">
                <h3 id="pos-order-detail-title">تفاصيل الطلب #{historyOrder.order_prefix ?? ""}{historyOrder.order_no}</h3>
                <span className="od-modal-meta">{new Date(historyOrder.created_at).toLocaleString("ar-EG")}</span>
              </div>
              <button type="button" className="od-modal-x" onClick={() => setHistoryOrder(null)} aria-label="إغلاق تفاصيل الطلب">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                  <path d="M6 6l12 12M18 6 6 18" />
                </svg>
              </button>
            </header>
            <div className="od-modal-body">
              <OrderDetail order={historyOrder} />
            </div>
          </div>
        </div>
      )}

      {done && (
        <div className="modal-back" onClick={() => setDone(null)}>
          <div className="modal receipt-modal" onClick={(e) => e.stopPropagation()}>
            <Receipt order={done} />
            <div className="pos-actions">
              {settings?.receipt_printing_enabled && <button className="primary" onClick={async () => { try { await api(`/orders/${done.id}/print`, { method: "POST", body: {} }); setMsg(`${t.pos.orderCreated} ${done.order_no} — ${t.pos.printReceipt} ✓`); } catch (e: any) { setError(e.message); } }}>{t.pos.printReceipt}</button>}
              <button onClick={() => setDone(null)}>{t.pos.close}</button>
            </div>
          </div>
        </div>
      )}
      {customerModalOpen && (
        <div className="modal-back" onClick={() => setCustomerModalOpen(false)}>
          <div className="modal posx-quick-modal" role="dialog" aria-modal="true" aria-labelledby="quick-customer-title" onClick={(event) => event.stopPropagation()}>
            <h3 id="quick-customer-title">إضافة عميل جديد</h3>
            <label className="field"><span>اسم العميل</span><input autoFocus value={quickName} onChange={(event) => setQuickName(event.target.value)} /></label>
            <label className="field"><span>رقم التليفون</span><input dir="ltr" inputMode="tel" value={quickPhone} onChange={(event) => setQuickPhone(event.target.value)} /></label>
            <label className="field"><span>العنوان الأول (اختياري)</span><textarea rows={3} value={quickAddress} onChange={(event) => setQuickAddress(event.target.value)} /></label>
            <div className="pos-actions">
              <button className="primary" disabled={quickBusy || !quickName.trim() || !quickPhone.trim()} onClick={() => void createQuickCustomer()}>{quickBusy ? "جارٍ الحفظ…" : "إضافة واختيار"}</button>
              <button onClick={() => setCustomerModalOpen(false)}>إلغاء</button>
            </div>
          </div>
        </div>
      )}

      {addressModalOpen && selectedCustomer && (
        <div className="modal-back" onClick={() => setAddressModalOpen(false)}>
          <div className="modal posx-quick-modal" role="dialog" aria-modal="true" aria-labelledby="quick-address-title" onClick={(event) => event.stopPropagation()}>
            <h3 id="quick-address-title">إضافة عنوان — {selectedCustomer.name}</h3>
            <label className="field"><span>اسم العنوان</span><input value={quickAddressLabel} placeholder="المنزل / العمل" onChange={(event) => setQuickAddressLabel(event.target.value)} /></label>
            <label className="field"><span>العنوان</span><textarea autoFocus rows={3} value={quickAddress} onChange={(event) => setQuickAddress(event.target.value)} /></label>
            <div className="pos-actions">
              <button className="primary" disabled={quickBusy || !quickAddress.trim()} onClick={() => void addQuickAddress()}>{quickBusy ? "جارٍ الحفظ…" : "حفظ واختيار"}</button>
              <button onClick={() => setAddressModalOpen(false)}>إلغاء</button>
            </div>
          </div>
        </div>
      )}

      {phoneModalOpen && selectedCustomer && (
        <div className="modal-back" onClick={() => setPhoneModalOpen(false)}>
          <div className="modal posx-quick-modal" role="dialog" aria-modal="true" aria-labelledby="quick-phone-title" onClick={(event) => event.stopPropagation()}>
            <h3 id="quick-phone-title">{selectedCustomer.alt_phone ? "تحديث الرقم الإضافي" : "إضافة رقم إضافي"} — {selectedCustomer.name}</h3>
            <label className="field"><span>رقم التليفون</span><input autoFocus dir="ltr" inputMode="tel" value={quickExtraPhone} onChange={(event) => setQuickExtraPhone(event.target.value)} /></label>
            <div className="pos-actions">
              <button className="primary" disabled={quickBusy || !quickExtraPhone.trim()} onClick={() => void addQuickPhone()}>{quickBusy ? "جارٍ الحفظ…" : "حفظ واختيار"}</button>
              <button onClick={() => setPhoneModalOpen(false)}>إلغاء</button>
            </div>
          </div>
        </div>
      )}

      {adminPanel === "shift" && (
        <div className="modal-back" onClick={() => setAdminPanel(null)}>
          <div className="modal posx-admin-modal" onClick={(e) => e.stopPropagation()}>
            <ShiftPanel shift={shift} money={money} openShift={openShift} closeShift={closeShift} />
          </div>
        </div>
      )}
    </div>
  );
}

function ProductThumb({ product }: { product: MenuProduct }) {
  const src = resolveAssetUrl(product.image_url);
  const [broken, setBroken] = useState(false);

  useEffect(() => setBroken(false), [src]);

  return (
    <span className="posx-line-thumb" aria-hidden>
      {src && !broken
        ? <img src={src} alt="" onError={() => setBroken(true)} />
        : <span>{product.name_ar.trim().charAt(0)}</span>}
    </span>
  );
}

function ShiftPanel({
  shift,
  money,
  openShift,
  closeShift,
}: {
  shift: Shift | null;
  money: (value: number) => string;
  openShift: (openingCash: number) => Promise<boolean>;
  closeShift: (actualCash: number) => Promise<boolean>;
}) {
  const [cashValue, setCashValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [panelError, setPanelError] = useState("");

  async function submitShiftAction() {
    if (busy) return;
    const amount = Number(cashValue);
    if (!Number.isFinite(amount) || amount < 0) {
      setPanelError("أدخل مبلغًا صحيحًا لا يقل عن صفر");
      return;
    }
    setBusy(true);
    setPanelError("");
    const ok = shift ? await closeShift(amount) : await openShift(amount);
    if (ok) setCashValue("");
    setBusy(false);
  }

  return (
    <div>
      <h3>إدارة الشيفت</h3>
      <div className="posx-shift-stats large">
        <div><span>حالة الشيفت</span><b>{shift ? "مفتوح" : "مغلق"}</b></div>
        <div><span>افتتاحي</span><b>{money(Number(shift?.opening_cash ?? 0))}</b></div>
        <div><span>نقدي</span><b>{money(Number(shift?.totals?.cash_sales ?? 0))}</b></div>
        <div><span>طلبات</span><b>{shift?.totals?.orders_count ?? 0}</b></div>
        <div><span>المتوقع</span><b>{money(Number(shift?.totals?.expected_cash ?? 0))}</b></div>
      </div>
      <label className="field">
        <span>{shift ? t.shift.closingCash : t.shift.openingCash}</span>
        <input
          type="number"
          min="0"
          step="0.01"
          inputMode="decimal"
          value={cashValue}
          onChange={(event) => setCashValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void submitShiftAction();
          }}
          disabled={busy}
          autoFocus
        />
      </label>
      {panelError && <div className="alert">{panelError}</div>}
      <div className="pos-actions">
        <button className="primary" disabled={busy || cashValue === ""} onClick={() => void submitShiftAction()}>
          {busy ? "جارٍ الحفظ…" : shift ? "إغلاق الشيفت" : "فتح شيفت"}
        </button>
      </div>
    </div>
  );
}

/**
 * POS product card v2.
 * The selected size and bread stay inline for speed. Left click increments the
 * exact selected configuration; right click decrements that same configuration.
 */
function ProductCard({
  product,
  cartLines,
  showImage,
  money,
  onAdd,
  onQuickRemove,
}: {
  product: MenuProduct;
  cartLines: CartLine[];
  showImage: boolean;
  money: (value: number) => string;
  onAdd: (variant: MenuVariant | null, modifiers: MenuModifier[]) => void;
  onQuickRemove: (variant: MenuVariant | null, modifiers: MenuModifier[]) => void;
}) {
  const inlineGroups = product.modifier_groups.filter((group) => group.is_required && group.max_select === 1);
  const breadTerms = Array.from(new Set(
    inlineGroups.flatMap((group) => group.modifiers.map((modifier) => modifier.name_ar.trim())).filter(Boolean)
  ));

  function sizeLabel(name: string) {
    let label = name.trim();
    for (const bread of breadTerms) label = label.split(bread).join(" ");
    label = label.replace(/\b(فينو|سياحي)\b/g, " ").replace(/[\-–—/|]+/g, " ").replace(/\s+/g, " ").trim();
    return label || name.trim();
  }

  const sizeOptions = product.variants.reduce<Array<{ label: string; fallback: MenuVariant }>>((result, item) => {
    const label = sizeLabel(item.name_ar);
    if (!result.some((option) => option.label === label)) result.push({ label, fallback: item });
    return result;
  }, []);

  const [breadSel, setBreadSel] = useState<Record<string, MenuModifier>>(() => {
    const initial: Record<string, MenuModifier> = {};
    for (const group of inlineGroups) if (group.modifiers[0]) initial[group.id] = group.modifiers[0];
    return initial;
  });
  const [variant, setVariant] = useState<MenuVariant | null>(product.variants[0] ?? null);

  const selectedModifiers = Object.values(breadSel);
  const selectedBreadNames = selectedModifiers.map((modifier) => modifier.name_ar.trim()).filter(Boolean);
  const selectedSize = variant ? sizeLabel(variant.name_ar) : sizeOptions[0]?.label ?? "";

  function chooseVariant(size: string, breadNames = selectedBreadNames) {
    const exact = product.variants.find((item) => {
      if (sizeLabel(item.name_ar) !== size) return false;
      return breadNames.length === 0 || breadNames.every((bread) => item.name_ar.includes(bread));
    });
    return exact ?? product.variants.find((item) => sizeLabel(item.name_ar) === size) ?? null;
  }

  function selectSize(size: string) {
    setVariant(chooseVariant(size));
  }

  function selectModifier(group: MenuGroup, modifier: MenuModifier) {
    setBreadSel((current) => ({ ...current, [group.id]: modifier }));
    if (selectedSize) {
      const nextBreadNames = Object.entries(breadSel)
        .map(([groupId, selected]) => groupId === group.id ? modifier.name_ar.trim() : selected.name_ar.trim())
        .filter(Boolean);
      setVariant(chooseVariant(selectedSize, nextBreadNames));
    }
  }

  const imageSrc = resolveAssetUrl(product.image_url);
  const [imageBroken, setImageBroken] = useState(false);
  useEffect(() => setImageBroken(false), [imageSrc]);

  const priceNow =
    product.effective_price +
    Number(variant?.price_delta ?? 0) +
    selectedModifiers.reduce((sum, modifier) => sum + Number(modifier.price_delta ?? 0), 0);
  const selectedKey = cartLineKey(product, variant, selectedModifiers);
  const selectedQty = cartLines
    .filter((line) => line.key === selectedKey)
    .reduce((sum, line) => sum + line.qty, 0);
  const hasInlineOptions = sizeOptions.length > 0 || inlineGroups.length > 0;

  function add() {
    if (product.is_available) onAdd(variant, selectedModifiers);
  }

  function isControl(target: EventTarget | null) {
    return target instanceof HTMLElement && Boolean(target.closest("button, input, select, textarea, a"));
  }

  return (
    <article
      className={product.is_available ? "posx-card2" : "posx-card2 off"}
      role="button"
      tabIndex={product.is_available ? 0 : -1}
      aria-label={`${product.name_ar} — كليك شمال للإضافة، كليك يمين للتقليل`}
      onClick={(event) => { if (!isControl(event.target)) add(); }}
      onContextMenu={(event) => {
        event.preventDefault();
        if (!isControl(event.target) && selectedQty > 0) onQuickRemove(variant, selectedModifiers);
      }}
      onKeyDown={(event) => {
        if ((event.key === "Enter" || event.key === " ") && !isControl(event.target)) {
          event.preventDefault();
          add();
        }
      }}
    >
      <div className="posx-card2-media">
        {showImage && imageSrc && !imageBroken
          ? <img className="posx-card2-img" src={imageSrc} alt={product.name_ar} onError={() => setImageBroken(true)} />
          : <span className="posx-card2-img ph" />}
        <span className="posx-card2-price">{money(priceNow)}</span>
        {selectedQty > 0 && <span className="posx-card2-qty-badge">×{selectedQty}</span>}
      </div>

      <div className="posx-card2-info">
        <h3 className="posx-card2-name">{product.name_ar}</h3>
      </div>

      {!product.is_available && <div className="posx-card2-off">{product.availability_note_ar ?? t.menu.unavailable}</div>}

      {product.is_available && (
        <div className="posx-card2-options">
          {sizeOptions.length > 0 && (
            <div className="posx-card2-opt">
              <span className="posx-card2-opt-label">الحجم</span>
              <div className="posx-chips" role="group" aria-label="الحجم">
                {sizeOptions.map((option) => (
                  <button
                    type="button"
                    key={option.label}
                    className={selectedSize === option.label ? "active" : ""}
                    onClick={(event) => { event.stopPropagation(); selectSize(option.label); }}
                    onContextMenu={(event) => event.stopPropagation()}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {inlineGroups.map((group) => (
            <div key={group.id} className="posx-card2-opt">
              <span className="posx-card2-opt-label">{group.name_ar.includes("عيش") ? "نوع العيش" : group.name_ar}</span>
              <div className="posx-chips" role="group" aria-label={group.name_ar}>
                {group.modifiers.map((modifier) => (
                  <button
                    type="button"
                    key={modifier.id}
                    className={breadSel[group.id]?.id === modifier.id ? "active" : ""}
                    onClick={(event) => { event.stopPropagation(); selectModifier(group, modifier); }}
                    onContextMenu={(event) => event.stopPropagation()}
                  >
                    {modifier.name_ar}
                  </button>
                ))}
              </div>
            </div>
          ))}

          {!hasInlineOptions && <div className="posx-card2-direct">اضغط على الكارت للإضافة</div>}
        </div>
      )}
    </article>
  );
}
