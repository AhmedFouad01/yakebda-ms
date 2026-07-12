import { useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api";
import { toast } from "../../components/ui/overlays";
import { FormField, NumberInput, Select, TextInput, ToggleSwitch } from "../../components/ui/primitives";

/**
 * YKMS-02F — مشترك صفحات الإعدادات.
 * useSettingsDoc: تحميل/تعديل/حفظ وثيقة الإعدادات مع dirty state حقيقي.
 * صفوف موحدة (RowToggle/RowNum/RowText/RowSelect) فوق نظام uif —
 * لا checkboxes خام ولا أعراض native بعد اليوم.
 */

export interface SettingsData {
  [k: string]: unknown;
  restaurant_name: string;
  restaurant_name_en: string;
  system_display_name: string;
  address: string;
  phone: string;
  tax_number: string;
  logo_url: string;
  brand_primary_color: string;
  brand_secondary_color: string;
  default_language: "ar" | "en";
  rtl_enabled: boolean;
  currency: string;
  timezone: string;
  receipt_footer: string;
  vat_enabled: boolean;
  vat_percentage: number;
  prices_include_vat: boolean;
  service_fee_enabled: boolean;
  service_fee_type: "percent" | "fixed";
  service_fee_value: number;
  default_delivery_fee: number;
  min_delivery_order: number;
  rounding_rule: "none" | "nearest_050" | "nearest_1";
  receipt_tax_display: "combined" | "detailed";
  order_type_takeaway_enabled: boolean;
  order_type_delivery_enabled: boolean;
  order_type_dine_in_enabled: boolean;
  online_orders_enabled: boolean;
  require_customer_for_delivery: boolean;
  require_address_for_delivery: boolean;
  require_driver_for_delivery: boolean;
  order_number_prefix: string;
  order_type_letter_prefix: boolean;
  order_daily_reset: boolean;
  order_starting_number: number;
  branch_specific_numbering: boolean;
  approval_delete_item_after_kitchen: boolean;
  approval_cancel_order: boolean;
  approval_discount_above_limit: boolean;
  approval_refund: boolean;
  approval_open_cash_drawer: boolean;
  show_product_images: boolean;
  enabled_payment_methods: string[];
  allow_discounts: boolean;
  max_discount_without_manager: number;
  max_cashier_discount_percent: number;
  discount_reason_required: boolean;
  offers_combo_enabled: boolean;
  offers_buy_x_get_y_enabled: boolean;
  offers_happy_hour_enabled: boolean;
  offers_scheduled_enabled: boolean;
  kds_enabled: boolean;
  kitchen_ticket_enabled: boolean;
  default_prep_time_minutes: number;
  kds_warning_minutes: number;
  kds_late_minutes: number;
  kds_hide_ready_after_minutes: number;
  kds_sound_alert: boolean;
  receipt_printing_enabled: boolean;
  kitchen_printer_enabled: boolean;
  paper_width_mm: 58 | 80;
  receipt_copies: number;
  auto_print_on_kitchen_send: boolean;
  auto_print_on_payment: boolean;
  cash_drawer_enabled: boolean;
  barcode_scanner_enabled: boolean;
  customer_display_enabled: boolean;
  payment_terminal_enabled: boolean;
  kds_screen_enabled: boolean;
  require_open_shift_for_cash: boolean;
  opening_cash_required: boolean;
  force_close_shift_before_day_end: boolean;
  manager_approval_cash_out: boolean;
  shift_report_visibility: "manager" | "all";
  customers_enabled: boolean;
  customer_phone_required: boolean;
  allow_order_cancel: boolean;
}

export interface SettingsDoc {
  data: SettingsData | null;
  dirty: boolean;
  saving: boolean;
  loadError: string;
  set: <K extends keyof SettingsData>(k: K, v: SettingsData[K]) => void;
  save: () => Promise<void>;
  reset: () => void;
  reload: () => Promise<void>;
}

export function useSettingsDoc(): SettingsDoc {
  const [data, setData] = useState<SettingsData | null>(null);
  const [initial, setInitial] = useState("");
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState("");

  async function reload() {
    setLoadError("");
    try {
      const res = await api<{ data: SettingsData }>("/settings");
      setData(res.data);
      setInitial(JSON.stringify(res.data));
    } catch (e: any) {
      setLoadError(e.message);
    }
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dirty = useMemo(() => (data ? JSON.stringify(data) !== initial : false), [data, initial]);

  return {
    data,
    dirty,
    saving,
    loadError,
    set: (k, v) => setData((cur) => (cur ? { ...cur, [k]: v } : cur)),
    reset: () => {
      if (initial) setData(JSON.parse(initial));
    },
    reload,
    save: async () => {
      if (!data || saving) return;
      setSaving(true);
      try {
        const res = await api<{ data: SettingsData }>("/settings", { method: "PATCH", body: data });
        setData(res.data);
        setInitial(JSON.stringify(res.data));
        toast("تم حفظ الإعدادات ✓");
      } catch (e: any) {
        toast(e.message, "error");
      } finally {
        setSaving(false);
      }
    },
  };
}

/* ——— صفوف موحدة ——— */

export interface RowCtx {
  doc: SettingsDoc;
  editable: boolean;
}

export function RowToggle({ ctx, k, label, off }: { ctx: RowCtx; k: keyof SettingsData; label: string; off?: boolean }) {
  const { doc, editable } = ctx;
  return (
    <ToggleSwitch
      checked={!!doc.data?.[k]}
      disabled={!editable || off}
      off={off}
      ariaLabel={label}
      label={off ? `${label} — سيتم توفيره في مرحلة لاحقة` : label}
      onChange={(v) => doc.set(k, v as never)}
    />
  );
}

function StepperIcon({ kind }: { kind: "minus" | "plus" }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
      <path d="M5 12h14" />
      {kind === "plus" && <path d="M12 5v14" />}
    </svg>
  );
}

export function RowNum({
  ctx,
  k,
  label,
  min = 0,
  max,
  step = 1,
  hint,
}: {
  ctx: RowCtx;
  k: keyof SettingsData;
  label: string;
  min?: number;
  max?: number;
  step?: number;
  hint?: string;
}) {
  const { doc, editable } = ctx;
  const value = Number(doc.data?.[k] ?? 0);

  function setValue(next: number) {
    const bounded = Math.min(max ?? Number.POSITIVE_INFINITY, Math.max(min, next));
    doc.set(k, Number(bounded.toFixed(6)) as never);
  }

  return (
    <div className="uif-field inline uif-number-field">
      <span className="uif-label">{label}</span>
      <div className="uif-number-stepper" role="group" aria-label={label}>
        <button
          type="button"
          className="uif-stepper-btn"
          aria-label={`تقليل ${label}`}
          disabled={!editable || value <= min}
          onClick={() => setValue(value - step)}
        >
          <StepperIcon kind="minus" />
        </button>
        <NumberInput
          aria-label={label}
          min={min}
          max={max}
          step={step}
          disabled={!editable}
          value={value}
          onChange={(e) => setValue(Number(e.target.value))}
        />
        <button
          type="button"
          className="uif-stepper-btn"
          aria-label={`زيادة ${label}`}
          disabled={!editable || (max != null && value >= max)}
          onClick={() => setValue(value + step)}
        >
          <StepperIcon kind="plus" />
        </button>
      </div>
      {hint && <span className="uif-hint">{hint}</span>}
    </div>
  );
}

export function RowText({ ctx, k, label, ltr, hint }: { ctx: RowCtx; k: keyof SettingsData; label: string; ltr?: boolean; hint?: string }) {
  const { doc, editable } = ctx;
  return (
    <FormField label={label} hint={hint}>
      <TextInput dir={ltr ? "ltr" : undefined} disabled={!editable} value={String(doc.data?.[k] ?? "")} onChange={(e) => doc.set(k, e.target.value as never)} />
    </FormField>
  );
}

export function RowSelect<T extends string | number>({
  ctx,
  k,
  label,
  options,
  numeric,
}: {
  ctx: RowCtx;
  k: keyof SettingsData;
  label: string;
  options: Array<[T, string]>;
  numeric?: boolean;
}) {
  const { doc, editable } = ctx;
  return (
    <FormField label={label} inline>
      <Select
        disabled={!editable}
        value={String(doc.data?.[k] ?? "")}
        onChange={(e) => doc.set(k, (numeric ? Number(e.target.value) : e.target.value) as never)}
        style={{ maxWidth: 200 }}
      >
        {options.map(([value, text]) => (
          <option key={String(value)} value={String(value)}>{text}</option>
        ))}
      </Select>
    </FormField>
  );
}

export function SubHead({ children }: { children: string }) {
  return <div className="set-sub">{children}</div>;
}
