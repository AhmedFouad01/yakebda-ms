import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { t } from "../lib/t";

interface KOrder {
  id: string;
  order_no: number;
  order_type: string;
  status: string;
  submitted_at: string | null;
  notes?: string | null;
  items: Array<{
    id: string;
    name_ar: string;
    variant_name_ar?: string | null;
    qty: number;
    notes?: string | null;
    modifiers: Array<{ id: string; name_ar: string }>;
  }>;
}

const NEXT: Record<string, { to: string; label: () => string }> = {
  submitted: { to: "in_kitchen", label: () => t.kitchen.startPrep },
  in_kitchen: { to: "ready", label: () => t.kitchen.ready },
  ready: { to: "completed", label: () => t.kitchen.complete },
};

function minutesSince(iso: string | null) {
  if (!iso) return 0;
  return Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
}

export function Kitchen() {
  const [orders, setOrders] = useState<KOrder[]>([]);
  const [error, setError] = useState("");

  async function load() {
    try {
      const res = await api<{ data: KOrder[] }>("/kitchen/orders");
      setOrders(res.data);
      setError("");
    } catch (e: any) {
      setError(e.message);
    }
  }

  useEffect(() => {
    load();
    const id = setInterval(load, 5000); // polling يكفي في MVP
    return () => clearInterval(id);
  }, []);

  async function advance(o: KOrder) {
    const next = NEXT[o.status];
    if (!next) return;
    try {
      await api(`/kitchen/orders/${o.id}/status`, { method: "PATCH", body: { status: next.to } });
      load();
    } catch (e: any) {
      setError(e.message);
    }
  }

  const cols: Array<[string, string]> = [
    ["submitted", t.orders.statuses.submitted],
    ["in_kitchen", t.orders.statuses.in_kitchen],
    ["ready", t.orders.statuses.ready],
  ];

  return (
    <div dir="rtl">
      <h2>{t.kitchen.title}</h2>
      {error && <div className="alert">{error}</div>}
      {!orders.length && <div className="muted">{t.kitchen.empty}</div>}
      <div className="kds">
        {cols.map(([status, label]) => (
          <div key={status} className="kds-col">
            <div className={`kds-col-head st-${status}`}>{label}</div>
            {orders
              .filter((o) => o.status === status)
              .map((o) => (
                <div key={o.id} className={`kds-card st-${o.status}`}>
                  <div className="kds-card-head">
                    <span>
                      {t.kitchen.orderNo} #{o.order_no} — {t.orders.types[o.order_type]}
                    </span>
                    <span className="kds-timer">{minutesSince(o.submitted_at)} د</span>
                  </div>
                  <ul>
                    {o.items.map((i) => (
                      <li key={i.id}>
                        <strong>
                          {i.qty} × {i.name_ar}
                          {i.variant_name_ar ? ` (${i.variant_name_ar})` : ""}
                        </strong>
                        {i.modifiers.length > 0 && (
                          <div className="kds-mods">{i.modifiers.map((m) => m.name_ar).join("، ")}</div>
                        )}
                        {i.notes && <div className="kds-note">{t.kitchen.notes}: {i.notes}</div>}
                      </li>
                    ))}
                  </ul>
                  {o.notes && <div className="kds-note">{t.kitchen.notes}: {o.notes}</div>}
                  {NEXT[o.status] && (
                    <button className="primary wide" onClick={() => advance(o)}>
                      {NEXT[o.status].label()}
                    </button>
                  )}
                </div>
              ))}
          </div>
        ))}
      </div>
    </div>
  );
}
