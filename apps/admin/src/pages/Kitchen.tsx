import { useEffect, useMemo, useRef, useState } from "react";
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

interface KdsMetrics {
  completed_today: number;
  avg_prep_minutes: number | null;
  median_prep_minutes: number | null;
  within_sla: number;
  late_completed: number;
  currently_preparing: number;
  ready_waiting: number;
  submitted_waiting: number;
}

let kdsAudioContext: AudioContext | null = null;

function audioContext(): AudioContext | null {
  try {
    const Context = window.AudioContext || (window as any).webkitAudioContext;
    if (!Context) return null;
    kdsAudioContext ??= new Context();
    return kdsAudioContext;
  } catch {
    return null;
  }
}

async function unlockKdsAudio() {
  const ctx = audioContext();
  if (ctx?.state === "suspended") await ctx.resume().catch(() => undefined);
}

/** نغمة تنبيه قصيرة بلا ملفات خارجية، بعد فتح الصوت بأول تفاعل من المستخدم. */
function beep() {
  try {
    const ctx = audioContext();
    if (!ctx || ctx.state !== "running") return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    osc.start();
    osc.stop(ctx.currentTime + 0.4);
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
    };
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

function shouldHideReady(order: KOrder, settings: KdsSettings): boolean {
  if (order.status !== "ready" || !order.ready_at || settings.kds_hide_ready_after_minutes <= 0) return false;
  return Date.now() - new Date(order.ready_at).getTime() >= settings.kds_hide_ready_after_minutes * 60_000;
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
  const [metrics, setMetrics] = useState<KdsMetrics | null>(null);
  const [error, setError] = useState("");
  const [now, setNow] = useState(Date.now());
  const settingsRef = useRef<KdsSettings | null>(null);
  const knownIds = useRef(new Set<string>());

  async function loadOrders(alertOnNew = true) {
    const activeSettings = settingsRef.current;
    if (!activeSettings?.kds_enabled) {
      setOrders([]);
      setMetrics(null);
      return;
    }

    try {
      const res = await api<{ data: KOrder[] }>("/kitchen/orders");
      const visible = res.data.filter((order) => !shouldHideReady(order, activeSettings));
      const fresh = visible.filter((order) => !knownIds.current.has(order.id));
      visible.forEach((order) => knownIds.current.add(order.id));
      if (alertOnNew && fresh.length && activeSettings.kds_sound_alert) beep();
      setOrders(visible);
      setError("");
      api<{ data: KdsMetrics }>("/kitchen/metrics")
        .then((response) => setMetrics(response.data))
        .catch(() => undefined);
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function refreshSettings(): Promise<KdsSettings | null> {
    try {
      const response = await api<{ data: KdsSettings }>("/settings");
      settingsRef.current = response.data;
      setSettings(response.data);
      if (!response.data.kds_enabled) {
        setOrders([]);
        setMetrics(null);
      }
      return response.data;
    } catch (e: any) {
      setError(e.message);
      return null;
    }
  }

  useEffect(() => {
    const unlock = () => void unlockKdsAudio();
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  useEffect(() => {
    let stopped = false;
    void (async () => {
      const active = await refreshSettings();
      if (!stopped && active?.kds_enabled) await loadOrders(false);
    })();

    const ordersTimer = window.setInterval(() => void loadOrders(true), 5000);
    const settingsTimer = window.setInterval(() => {
      const wasEnabled = settingsRef.current?.kds_enabled === true;
      void refreshSettings().then((active) => {
        if (!stopped && active?.kds_enabled && !wasEnabled) void loadOrders(false);
      });
    }, 30_000);

    return () => {
      stopped = true;
      window.clearInterval(ordersTimer);
      window.clearInterval(settingsTimer);
    };
  }, []);

  // YKMS-02F: نبضة كل ثانية للمؤقت الجاري — تُنظَّف بشكل صحيح (لا تسريب ذاكرة)
  useEffect(() => {
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(tick);
  }, []);

  async function advance(order: KOrder) {
    const next = NEXT[order.status];
    if (!next) return;
    try {
      await api(`/kitchen/orders/${order.id}/status`, { method: "PATCH", body: { status: next.to } });
      await loadOrders(false);
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
    const totalItems = orders.reduce((sum, order) => sum + order.items.reduce((count, item) => count + item.qty, 0), 0);
    const waiting = orders.filter((order) => order.status === "submitted").length;
    const cooking = orders.filter((order) => order.status === "in_kitchen").length;
    const ready = orders.filter((order) => order.status === "ready").length;
    return { totalItems, waiting, cooking, ready };
  }, [orders]);

  return (
    <div dir="rtl" className="kitchen-page">
      <div className="page-head"><h1>{t.kitchen.title}</h1></div>
      {error && <div className="alert">{error}</div>}
      {!settings && !error && <div className="muted">جاري تحميل إعدادات شاشة المطبخ…</div>}
      {settings && !settings.kds_enabled ? (
        <div className="alert">شاشة المطبخ متوقفة من الإعدادات. فعّل KDS لبدء استقبال الطلبات.</div>
      ) : settings ? (
        <>
          <div className="kds-stats">
            <div><b>{orders.length}</b><span>طلبات مفتوحة</span></div>
            <div><b>{stats.totalItems}</b><span>أصناف</span></div>
            <div><b>{stats.waiting}</b><span>تم الإرسال</span></div>
            <div><b>{stats.cooking}</b><span>في المطبخ</span></div>
            <div><b>{stats.ready}</b><span>جاهز</span></div>
            <div title="متوسط زمن التحضير لطلبات اليوم المكتملة"><b>{metrics?.avg_prep_minutes != null ? `${metrics.avg_prep_minutes} د` : "—"}</b><span>متوسط التحضير</span></div>
            <div title="الوسيط"><b>{metrics?.median_prep_minutes != null ? `${metrics.median_prep_minutes} د` : "—"}</b><span>وسيط التحضير</span></div>
            <div><b>{metrics?.completed_today ?? 0}</b><span>اكتمل اليوم</span></div>
            {metrics != null && metrics.late_completed > 0 && <div className="kds-stat-late"><b>{metrics.late_completed}</b><span>متأخر اليوم</span></div>}
          </div>
          {!orders.length && <div className="muted">{t.kitchen.empty}</div>}
          <div className="kds">
            {cols.map(([status, label]) => (
              <div key={status} className="kds-col">
                <div className={`kds-col-head st-${status}`}>{label} <span>{orders.filter((order) => order.status === status).length}</span></div>
                {orders.filter((order) => order.status === status).map((order) => {
                  const anchor = order.submitted_at ?? order.created_at;
                  const mins = minutesSince(anchor);
                  const warn = settings.kds_warning_minutes;
                  const late = settings.kds_late_minutes;
                  const slaClass = order.status === "ready" ? "" : mins >= late ? " kds-late" : mins >= warn ? " kds-warn" : "";
                  return (
                    <div key={order.id} className={`kds-card st-${order.status}${slaClass}`}>
                      <div className="kds-card-head">
                        <span>{t.kitchen.orderNo} #{order.order_prefix ?? ""}{order.order_no}</span>
                        <span className="kds-timer" title="الزمن المنقضي منذ الإرسال">{formatElapsed(anchor, now)}</span>
                      </div>
                      <div className="kds-received">ورد إلى المطبخ: {formatExact(anchor)}</div>
                      {order.ready_at && order.status === "ready" && <div className="kds-received">جاهز منذ: {formatExact(order.ready_at)}</div>}
                      <div className="kds-meta"><span>{t.orders.types[order.order_type]}</span><span>{order.items.reduce((sum, item) => sum + item.qty, 0)} أصناف</span></div>
                      <ul>
                        {order.items.map((item) => (
                          <li key={item.id}>
                            <strong>{item.qty} × {item.name_ar}{item.variant_name_ar ? ` (${item.variant_name_ar})` : ""}</strong>
                            {item.modifiers.length > 0 && <div className="kds-mods">{item.modifiers.map((modifier) => modifier.name_ar).join("، ")}</div>}
                            {(item.prep_station_ar || (item.prep_time_minutes ?? 0) > 0) && (
                              <div className="kds-station">{item.prep_station_ar ?? ""}{(item.prep_time_minutes ?? 0) > 0 ? ` — ${item.prep_time_minutes} د` : ""}</div>
                            )}
                            {item.notes && <div className="kds-note">{t.kitchen.notes}: {item.notes}</div>}
                          </li>
                        ))}
                      </ul>
                      {order.notes && <div className="kds-note">{t.kitchen.notes}: {order.notes}</div>}
                      {NEXT[order.status] && <button className="primary wide" onClick={() => advance(order)}>{NEXT[order.status].label()}</button>}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
