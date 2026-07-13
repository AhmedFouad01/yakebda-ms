import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { api } from "../../lib/api";
import type { CustomerAddress, DeliveryZone, OrderType, PosCustomer } from "./types";
import { addressText, parseAddresses } from "./utils";

export interface UsePosDeliveryOptions {
  branchId: string;
  orderType: OrderType;
  can: (permission: string) => boolean;
  onError: (message: string) => void;
  onMessage: (message: string) => void;
}

export interface UsePosDeliveryResult {
  customers: PosCustomer[];
  customerId: string;
  deliveryAddress: string;
  setDeliveryAddress: Dispatch<SetStateAction<string>>;
  deliveryPhone: string;
  setDeliveryPhone: Dispatch<SetStateAction<string>>;
  deliveryZones: DeliveryZone[];
  deliveryZoneId: string;
  setDeliveryZoneId: Dispatch<SetStateAction<string>>;
  deliveryFee: number;
  setDeliveryFee: Dispatch<SetStateAction<number>>;
  customerModalOpen: boolean;
  setCustomerModalOpen: Dispatch<SetStateAction<boolean>>;
  addressModalOpen: boolean;
  setAddressModalOpen: Dispatch<SetStateAction<boolean>>;
  phoneModalOpen: boolean;
  setPhoneModalOpen: Dispatch<SetStateAction<boolean>>;
  quickName: string;
  setQuickName: Dispatch<SetStateAction<string>>;
  quickPhone: string;
  setQuickPhone: Dispatch<SetStateAction<string>>;
  quickAddress: string;
  setQuickAddress: Dispatch<SetStateAction<string>>;
  quickAddressLabel: string;
  setQuickAddressLabel: Dispatch<SetStateAction<string>>;
  quickExtraPhone: string;
  setQuickExtraPhone: Dispatch<SetStateAction<string>>;
  quickBusy: boolean;
  selectedCustomer: PosCustomer | null;
  selectedZone: DeliveryZone | null;
  customerAddressOptions: Array<{ label: string; value: string }>;
  customerPhoneOptions: string[];
  selectDeliveryCustomer: (customer: PosCustomer | null, rows?: PosCustomer[]) => void;
  createQuickCustomer: () => Promise<void>;
  addQuickAddress: () => Promise<void>;
  addQuickPhone: () => Promise<void>;
  resetDeliveryDraft: () => void;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function usePosDelivery({
  branchId,
  orderType,
  can,
  onError,
  onMessage,
}: UsePosDeliveryOptions): UsePosDeliveryResult {
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

  function selectDeliveryCustomer(customer: PosCustomer | null, rows = customers): void {
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

  async function loadCustomers(preferredId?: string): Promise<void> {
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
      .catch((error: unknown) => {
        if (!cancelled) onError(errorMessage(error));
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
      .catch((error: unknown) => {
        if (!cancelled) onError(errorMessage(error));
      });
    return () => { cancelled = true; };
  }, [orderType, branchId]);

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

  async function createQuickCustomer(): Promise<void> {
    if (!quickName.trim() || !quickPhone.trim() || quickBusy) return;
    setQuickBusy(true);
    onError("");
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
      onMessage("تمت إضافة العميل واختياره");
    } catch (error: unknown) {
      onError(errorMessage(error));
    } finally {
      setQuickBusy(false);
    }
  }

  async function addQuickAddress(): Promise<void> {
    if (!selectedCustomer || !quickAddress.trim() || quickBusy) return;
    setQuickBusy(true);
    onError("");
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
      onMessage("تم حفظ عنوان التوصيل");
    } catch (error: unknown) {
      onError(errorMessage(error));
    } finally {
      setQuickBusy(false);
    }
  }

  async function addQuickPhone(): Promise<void> {
    if (!selectedCustomer || !quickExtraPhone.trim() || quickBusy) return;
    setQuickBusy(true);
    onError("");
    try {
      const body = selectedCustomer.phone?.trim()
        ? { alt_phone: quickExtraPhone.trim() }
        : { phone: quickExtraPhone.trim() };
      await api("/customers/" + selectedCustomer.id, { method: "PATCH", body });
      await loadCustomers(selectedCustomer.id);
      setDeliveryPhone(quickExtraPhone.trim());
      setQuickExtraPhone("");
      setPhoneModalOpen(false);
      onMessage(selectedCustomer.alt_phone ? "تم تحديث الرقم الإضافي" : "تم حفظ الرقم الإضافي");
    } catch (error: unknown) {
      onError(errorMessage(error));
    } finally {
      setQuickBusy(false);
    }
  }

  function resetDeliveryDraft(): void {
    setCustomerId("");
    setDeliveryAddress("");
    setDeliveryPhone("");
    setDeliveryZoneId("");
    setDeliveryFee(0);
  }

  return {
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
  };
}
