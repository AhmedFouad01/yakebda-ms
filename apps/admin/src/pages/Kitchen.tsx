import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { t } from "../lib/t";

interface KOrder {
  id: string;
  order_no: number;
  order_prefix?: string | null;
  order_type: string;
  status: string;
  created_at: string;
  submitted_at: string | null;
  in_kitchen_at?: string | null;
  ready_at?: string | null;
  updated_at?: string | null;
  notes?: string | null;
  items: Array<{
    id: string;
    name_ar: string;
    variant_name_ar?: string | null;
    qty: number;
    notes?: string | null;
    prep_station_ar?: string | null;
    prep_time_minutes?: number | null;
    modifiers: Array<{ id: string; name_ar: string }>;
  }>;
}

interface KdsSettings {
  kds_enabled: boolean;
  kds_warning_minutes: number;
  kds_late_minutes: number;
  kds_hide_ready_after_minutes: number;
  kds_sound_alert: boolean;
}

/** نغمة تنبيه قصيرة بلا ملفات خارجية. */
function beep() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    osc.start();
    osc.stop(ctx.currentTime + 0.4);
  } catch {
    /* لا صوت متاح */
  }
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

/** YKMS-02F: الزمن المنقضي مشتق من timestamp — MM:SS، وHH:MM:SS بعد ساعة. */
function formatElapsed(iso: string | null, nowMs: number): string {
  if (!iso) return "--:--";
  const totalSec = Math.max(0, Math.floor((nowMs - new Date(iso).getTime()) / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const sec = totalSec % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

/** الطابع الزمني الدقيق بصيغة عربية: "10 يوليو 2026 — 02:31:18 م". */
function formatExact(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const date = d.toLocaleDateString("ar-EG", { day: "numeric", month: "long", year: "numeric" });
  const time = d.toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  return `${date} — ${time}`;
}

export function Kitchen() {
  const [orders, setOrders] = useState<KOrder[]>([]);
  const [settings, setSettings] = useState<KdsSettings | null>(null);
  const [error, setError] = useState("");
  const [now, setNow] = useState(Date.now());
  const knownIds = useMemo(() => new Set<string>(), []);

  async function load(alertOnNew = true) {
    try {
      const res = await api<{ data: KOrder[] }>("/kitchen/orders");
      // YKMS-02E: تنبيه صوتي عند طلب جديد (من الإعدادات)
      const fresh = res.data.filter((o) => !knownIds.has(o.id));
      res.data.forEach((o) => knownIds.add(o.id));
      if (alertOnNew && fresh.length && settingsRef.current?.kds_sound_alert) beep();
      setOrders(res.data);
      setError("");
    } catch (e: any) {
      setError(e.message);
    }
  }

  const settingsRef = { current: settings };
  settingsRef.current = settings;

  useEffect(() => {
    api<{ data: KdsSettings }>("/settings").then((r) => setSettings(r.data)).catch(() => {});
    load(false);
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, []);

  // YKMS-02F: نبضة كل ثانية للمؤقت الجاري — تُنظَّف بشكل صحيح (لا تسريب ذاكرة)
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
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
  const stats = useMemo(() => {
    const totalItems = orders.reduce((s, o) => s + o.items.reduce((x, i) => x + i.qty, 0), 0);
    const waiting = orders.filter((o) => o.status === "submitted").length;
    const cooking = orders.filter((o) => o.status === "in_kitchen").length;
    const ready = orders.filter((o) => o.status === "ready").length;
    const avg = orders.length ? Math.round(orders.reduce((s, o) => s + minutesSince(o.submitted_at), 0) / orders.length) : 0;
    return { totalItems, waiting, cooking, ready, avg };
  }, [orders]);

  return (
    <div dir="rtl" className="kitchen-page">
      <div className="page-head"><h1>{t.kitchen.title}</h1></div>
      {error && <div className="alert">{error}</div>}
      <div className="kds-stats">
        <div><b>{orders.length}</b><span>طلبات مفتوحة</span></div>
        <div><b>{stats.totalItems}</b><span>أصناف</span></div>
        <div><b>{stats.waiting}</b><span>تم الإرسال</span></div>
        <div><b>{stats.cooking}</b><span>في المطبخ</span></div>
        <div><b>{stats.ready}</b><span>جاهز</span></div>
        <div><b>{stats.avg} د</b><span>متوسط الانتظار</span></div>
      </div>
      {!orders.length && <div className="muted">{t.kitchen.empty}</div>}
      <div className="kds">
        {cols.map(([status, label]) => (
          <div key={status} className="kds-col">
            <div className={`kds-col-head st-${status}`}>{label} <span>{orders.filter((o) => o.status === status).length}</span></div>
            {orders.filter((o) => o.status === status).map((o) => {
              // YKMS-02F: الزمن الجاري مشتق من timestamp الخادم — لا تخزين لدقائق منقضية
              const anchor = o.submitted_at ?? o.created_at;
              const mins = minutesSince(anchor);
              const warn = settings?.kds_warning_minutes ?? 7;
              const late = settings?.kds_late_minutes ?? 12;
              const slaClass = o.status === "ready" ? "" : mins >= late ? " kds-late" : mins >= warn ? " kds-warn" : "";
              return (
                <div key={o.id} className={`kds-card st-${o.status}${slaClass}`}>
                  <div className="kds-card-head">
                    <span>{t.kitchen.orderNo} #{o.order_prefix ?? ""}{o.order_no}</span>
                    <span className="kds-timer" title="الزمن المنقضي منذ الإرسال">{formatElapsed(anchor, now)}</span>
                  </div>
                  <div className="kds-received">ورد إلى المطبخ: {formatExact(anchor)}</div>
                  {o.ready_at && o.status === "ready" && <div className="kds-received">جاهز منذ: {formatExact(o.ready_at)}</div>}
                  <div className="kds-meta"><span>{t.orders.types[o.order_type]}</span><span>{o.items.reduce((s, i) => s + i.qty, 0)} أصناف</span></div>
                  <ul>
                    {o.items.map((i) => (
                      <li key={i.id}>
                        <strong>{i.qty} × {i.name_ar}{i.variant_name_ar ? ` (${i.variant_name_ar})` : ""}</strong>
                        {i.modifiers.length > 0 && <div className="kds-mods">{i.modifiers.map((m) => m.name_ar).join("، ")}</div>}
                        {(i.prep_station_ar || (i.prep_time_minutes ?? 0) > 0) && (
                          <div className="kds-station">{i.prep_station_ar ?? ""}{(i.prep_time_minutes ?? 0) > 0 ? ` — ${i.prep_time_minutes} د` : ""}</div>
                        )}
                        {i.notes && <div className="kds-note">{t.kitchen.notes}: {i.notes}</div>}
                      </li>
                    ))}
                  </ul>
                  {o.notes && <div className="kds-note">{t.kitchen.notes}: {o.notes}</div>}
                  {NEXT[o.status] && <button className="primary wide" onClick={() => advance(o)}>{NEXT[o.status].label()}</button>}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
