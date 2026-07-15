import { t } from "../../lib/t";
import type { CartLine, CustomerAddress, MenuModifier, MenuProduct, MenuVariant, PaymentMethod, PosCustomer } from "./types";

const CAT_ORDER = ["الكل", "ساندوتشات", "أطباق", "وجبات", "الحواوشي", "البطاطس", "فواتح الشهية", "إضافات", "مشروبات"];
export const paymentLabels: Record<PaymentMethod, string> = {
  cash: t.pos.cash,
  card: t.pos.card,
  wallet: t.pos.wallet,
  unpaid: t.pos.unpaid,
};

export const money = (v: number) => `${v.toFixed(2)} ${t.reports.egp}`;
export const unitPrice = (line: CartLine) =>
  line.product.effective_price +
  Number(line.variant?.price_delta ?? 0) +
  line.modifiers.reduce((sum, mod) => sum + Number(mod.price_delta), 0);
export const cartLineKey = (product: MenuProduct, variant?: MenuVariant | null, modifiers: MenuModifier[] = []) =>
  `${product.id}|${variant?.id ?? ""}|${modifiers.map((modifier) => modifier.id).sort().join(",")}`;
export const catRank = (name: string) => {
  const index = CAT_ORDER.indexOf(name);
  return index === -1 ? 99 : index;
};

export function parseAddresses(customer: PosCustomer | null): CustomerAddress[] {
  if (!customer?.addresses) return [];
  if (Array.isArray(customer.addresses)) return customer.addresses;
  try {
    const parsed = JSON.parse(customer.addresses);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function addressText(address: CustomerAddress): string {
  return [address.area, address.landmark, address.floor, address.notes]
    .map((value) => value?.trim())
    .filter(Boolean)
    .join(" — ");
}
