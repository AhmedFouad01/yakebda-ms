import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { t } from "../lib/t";
import { useMe } from "../lib/me";

interface Settings {
  restaurant_name: string;
  brand_name_ar: string;
  currency: string;
  rtl_enabled: boolean;
  show_product_images: boolean;
  require_open_shift_for_cash: boolean;
  enabled_payment_methods: string[];
  receipt_printing_enabled: boolean;
  kitchen_ticket_enabled: boolean;
  allow_discounts: boolean;
  max_discount_without_manager: number;
  allow_order_cancel: boolean;
  hide_completed_kitchen_after_minutes: number;
}

const METHODS: Array<[string, () => string]> = [
  ["cash", () => t.pos.cash],
  ["card", () => t.pos.card],
  ["wallet", () => t.pos.wallet],
  ["unpaid", () => t.pos.unpaid],
];

export function SettingsPage() {
  const { can, ready } = useMe();
  const [s, setS] = useState<Settings | null>(null);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const editable = can("settings.manage");

  useEffect(() => {
    api<{ data: Settings }>("/settings")
      .then((r) => setS(r.data))
      .catch((e) => setError(e.message));
  }, []);

  if (!ready || !s) return <div className="muted">{error || "…"}</div>;

  function set<K extends keyof Settings>(k: K, v: Settings[K]) {
    setS((cur) => (cur ? { ...cur, [k]: v } : cur));
  }
  function toggleMethod(m: string) {
    const next = s!.enabled_payment_methods.includes(m)
      ? s!.enabled_payment_methods.filter((x) => x !== m)
      : [...s!.enabled_payment_methods, m];
    if (next.length) set("enabled_payment_methods", next);
  }

  async function save() {
    if (!s || busy) return;
    setBusy(true);
    setMsg("");
    setError("");
    try {
      const res = await api<{ data: Settings }>("/settings", { method: "PATCH", body: s });
      setS(res.data);
      setMsg(t.common.save + " ✓");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const Toggle = ({ k, label }: { k: keyof Settings; label: string }) => (
    <label className="set-row">
      <input type="checkbox" disabled={!editable} checked={!!s[k]} onChange={(e) => set(k, e.target.checked as never)} />
      <span>{label}</span>
    </label>
  );

  return (
    <div dir="rtl">
      <div className="page-head"><h1>{t.settings.title}</h1></div>
      {error && <div className="alert">{error}</div>}
      {msg && <div className="ok">{msg}</div>}
      {!editable && <div className="muted">{t.settings.readOnly}</div>}

      <div className="set-grid">
        <section className="panel set-card">
          <h3>{t.settings.general}</h3>
          <label className="set-row">
            <span>{t.settings.restaurantName}</span>
            <input disabled={!editable} value={s.restaurant_name} onChange={(e) => set("restaurant_name", e.target.value)} />
          </label>
          <label className="set-row">
            <span>{t.settings.brandNameAr}</span>
            <input disabled={!editable} value={s.brand_name_ar} onChange={(e) => set("brand_name_ar", e.target.value)} />
          </label>
          <label className="set-row">
            <span>{t.settings.currency}</span>
            <input disabled={!editable} dir="ltr" value={s.currency} onChange={(e) => set("currency", e.target.value)} />
          </label>
          <Toggle k="rtl_enabled" label={t.settings.rtlEnabled} />
        </section>

        <section className="panel set-card">
          <h3>{t.settings.posSection}</h3>
          <Toggle k="show_product_images" label={t.settings.showProductImages} />
          <Toggle k="allow_discounts" label={t.settings.allowDiscounts} />
          <label className="set-row">
            <span>{t.settings.maxDiscount}</span>
            <input
              type="number" min={0} disabled={!editable}
              value={s.max_discount_without_manager}
              onChange={(e) => set("max_discount_without_manager", Number(e.target.value))}
            />
          </label>
          <Toggle k="allow_order_cancel" label={t.settings.allowOrderCancel} />
        </section>

        <section className="panel set-card">
          <h3>{t.settings.paymentSection}</h3>
          <Toggle k="require_open_shift_for_cash" label={t.settings.requireShiftForCash} />
          <div className="set-row"><span>{t.settings.enabledMethods}</span></div>
          <div className="seg wrap">
            {METHODS.map(([m, label]) => (
              <button
                key={m}
                disabled={!editable}
                className={s.enabled_payment_methods.includes(m) ? "active" : ""}
                onClick={() => toggleMethod(m)}
              >
                {label()}
              </button>
            ))}
          </div>
        </section>

        <section className="panel set-card">
          <h3>{t.settings.printingSection}</h3>
          <Toggle k="receipt_printing_enabled" label={t.settings.receiptPrinting} />
        </section>

        <section className="panel set-card">
          <h3>{t.settings.kitchenSection}</h3>
          <Toggle k="kitchen_ticket_enabled" label={t.settings.kitchenTicket} />
          <label className="set-row">
            <span>{t.settings.hideCompletedAfter}</span>
            <input
              type="number" min={1} disabled={!editable}
              value={s.hide_completed_kitchen_after_minutes}
              onChange={(e) => set("hide_completed_kitchen_after_minutes", Number(e.target.value))}
            />
          </label>
        </section>

        <section className="panel set-card">
          <h3>{t.settings.menuSection}</h3>
          <div className="muted">{t.settings.menuHint}</div>
        </section>
      </div>

      {editable && (
        <div className="pos-actions" style={{ maxWidth: 300 }}>
          <button className="primary" disabled={busy} onClick={save}>{t.common.save}</button>
        </div>
      )}
    </div>
  );
}
