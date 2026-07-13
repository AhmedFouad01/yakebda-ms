export interface MenuModifier {
  id: string;
  name_ar: string;
  price_delta: string | number;
}
export interface MenuGroup {
  id: string;
  name_ar: string;
  min_select: number;
  max_select: number;
  is_required: boolean;
  modifiers: MenuModifier[];
}
export interface MenuVariant {
  id: string;
  name_ar: string;
  price_delta: string | number;
}
export interface MenuProduct {
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
export interface MenuCategory {
  id: string;
  name_ar: string;
  products: MenuProduct[];
}
export interface Branch {
  id: string;
  name: string;
}
export interface OrderSource {
  id: string;
  code: string;
  name_ar: string;
  supports_takeaway: boolean;
  supports_delivery: boolean;
}
export interface DeliveryZone {
  id: string;
  name_ar: string;
  fee: string | number;
  min_order: string | number;
  is_active: boolean;
}
export interface CustomerAddress {
  label?: string | null;
  area?: string | null;
  landmark?: string | null;
  floor?: string | null;
  notes?: string | null;
  is_default?: boolean;
}
export interface PosCustomer {
  id: string;
  name: string;
  phone?: string | null;
  alt_phone?: string | null;
  address?: string | null;
  addresses?: CustomerAddress[] | string | null;
}
export interface Shift {
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
export interface ShiftOrderPreviewItem {
  id: string;
  name_ar: string;
  variant_name_ar?: string | null;
  qty: number;
  image_url?: string | null;
}
export interface ShiftOrderSummary {
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

export interface Settings {
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
export interface OrderQuoteSummary {
  subtotal: number;
  discount: number;
  delivery_fee: number;
  service_fee: number;
  vat_amount: number;
  rounding_adjustment: number;
  total: number;
}
export interface CartLine {
  key: string;
  product: MenuProduct;
  variant?: MenuVariant | null;
  modifiers: MenuModifier[];
  qty: number;
  notes: string;
}
export type OrderType = "takeaway" | "delivery";
export type AdminPanel = "shift" | null;
export type PaymentMethod = "cash" | "card" | "wallet" | "unpaid";
