import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../lib/api";
import { t } from "../lib/t";
import { Badge, Button, StatusChip } from "../components/ui/primitives";

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

function formatClock(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" });
}

function formatDay(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("ar-EG", { day: "numeric", month: "short" });
}

type WorkflowStatus = "submitted" | "in_kitchen" | "ready";
type SlaState = "normal" | "warning" | "late";

const SLA_LABEL: Record<SlaState, string> = {
  normal: "ضمن الوقت",
  warning: "اقترب من التأخير",
  late: "متأخر",
};

const SLA_ICON: Record<SlaState, string> = {
  normal: "✓",
  warning: "!",
  late: "!",
};

const COLUMN_META: Record<WorkflowStatus, { description: string }> = {
  submitted: { description: "طلبات وصلت وتنتظر بدء التحضير" },
  in_kitchen: { description: "طلبات يعمل عليها المطبخ الآن" },
  ready: { description: "طلبات جاهزة للتسليم أو الإغلاق" },
};

function slaStateFor(status: string, minutes: number, settings: KdsSettings): SlaState {
  if (status === "ready") return "normal";
  if (minutes >= settings.kds_late_minutes) return "late";
  if (minutes >= settings.kds_warning_minutes) return "warning";
  return "normal";
}

function workflowTone(status: WorkflowStatus): "info" | "warning" | "success" {
  if (status === "ready") return "success";
  if (status === "in_kitchen") return "warning";
  return "info";
}

const BREAD_TERMS = ["فينو", "سياحي"] as const;

type KitchenItem = KOrder["items"][number];

function kitchenItemChoices(item: KitchenItem) {
  const bread = new Set<string>();
  const detectBread = (name: string) => {
    for (const term of BREAD_TERMS) if (name.includes(term)) bread.add(term);
  };

  const variantName = item.variant_name_ar?.trim() ?? "";
  detectBread(variantName);
  item.modifiers.forEach((modifier) => detectBread(modifier.name_ar));

  let size = variantName;
  for (const term of BREAD_TERMS) size = size.split(term).join(" ");
  size = size.replace(/[\-–—/|]+/g, " ").replace(/\s+/g, " ").trim();

  const extras = item.modifiers
    .map((modifier) => modifier.name_ar.trim())
    .filter((name) => name && !BREAD_TERMS.some((term) => name.includes(term)));

  return {
    size: size || null,
    bread: [...bread].join("، ") || null,
    extras,
  };
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

  const cols: Array<{ status: WorkflowStatus; label: string }> = [
    { status: "submitted", label: t.orders.statuses.submitted },
    { status: "in_kitchen", label: t.orders.statuses.in_kitchen },
    { status: "ready", label: t.orders.statuses.ready },
  ];

  const stats = useMemo(() => {
    const totalItems = orders.reduce((sum, order) => sum + order.items.reduce((count, item) => count + item.qty, 0), 0);
    return { totalItems };
  }, [orders]);

  return (
    <div dir="rtl" className="kitchen-page">
      <header className="kds-page-head">
        <div>
          <span className="kds-page-eyebrow">تشغيل مباشر</span>
          <h1>{t.kitchen.title}</h1>
          <p>ثلاث مراحل واضحة لمتابعة الطلبات من الوصول حتى الجاهزية.</p>
        </div>
        <div className="kds-live" role="status">
          <span className="kds-live-dot" aria-hidden />
          تحديث تلقائي كل 5 ثوانٍ
        </div>
      </header>

      {error && (
        <div className="kds-state danger" role="alert">
          <StatusChip tone="danger">خطأ في شاشة المطبخ</StatusChip>
          <span>{error}</span>
        </div>
      )}
      {!settings && !error && (
        <div className="kds-state info" role="status">
          <StatusChip tone="info">جاري التحميل</StatusChip>
          <span>جاري تحميل إعدادات شاشة المطبخ…</span>
        </div>
      )}
      {settings && !settings.kds_enabled ? (
        <div className="kds-state info" role="status">
          <StatusChip tone="info">KDS متوقفة</StatusChip>
          <span>شاشة المطبخ متوقفة من الإعدادات. فعّل KDS لبدء استقبال الطلبات.</span>
        </div>
      ) : settings ? (
        <>
          <section className="kds-overview" aria-label="ملخص أداء المطبخ">
            <div className="kds-stats">
              <div className="kds-stat is-open"><b>{orders.length}</b><span>طلبات مفتوحة</span></div>
              <div className="kds-stat is-info"><b>{stats.totalItems}</b><span>إجمالي الأصناف</span></div>
              <div className="kds-stat is-warning"><b>{metrics?.avg_prep_minutes != null ? `${metrics.avg_prep_minutes} د` : "—"}</b><span>متوسط التحضير</span></div>
              <div className="kds-stat is-info"><b>{metrics?.within_sla ?? 0}</b><span>ضمن الوقت اليوم</span></div>
              <div className="kds-stat is-ready"><b>{metrics?.completed_today ?? 0}</b><span>اكتمل اليوم</span></div>
              <div className={`kds-stat${(metrics?.late_completed ?? 0) > 0 ? " is-late" : ""}`}><b>{metrics?.late_completed ?? 0}</b><span>متأخر اليوم</span></div>
            </div>
          </section>

          {!orders.length && (
            <div className="kds-state empty" role="status">
              <Badge>لا توجد طلبات</Badge>
              <span>{t.kitchen.empty}</span>
            </div>
          )}

          <div className="kds">
            {cols.map(({ status, label }) => {
              const columnOrders = orders.filter((order) => order.status === status);
              return (
                <section key={status} className={`kds-col workflow-${status}`} aria-labelledby={`kds-col-${status}`}>
                  <header className="kds-col-head">
                    <div className="kds-col-head-copy">
                      <span className="kds-col-title" id={`kds-col-${status}`}>
                        <span className="kds-workflow-dot" aria-hidden />
                        {label}
                      </span>
                      <small>{COLUMN_META[status].description}</small>
                    </div>
                    <span className="kds-col-count" aria-label={`${columnOrders.length} طلب`}>{columnOrders.length}</span>
                  </header>

                  {!columnOrders.length && <div className="kds-col-empty">لا توجد طلبات في هذه المرحلة</div>}

                  <div className="kds-col-list">
                    {columnOrders.map((order) => {
                      const anchor = order.submitted_at ?? order.created_at;
                      const mins = minutesSince(anchor);
                      const slaState = slaStateFor(order.status, mins, settings);
                      const slaLabel = order.status === "ready" ? "تم التجهيز" : SLA_LABEL[slaState];
                      const elapsed = formatElapsed(anchor, now);
                      const itemCount = order.items.reduce((sum, item) => sum + item.qty, 0);
                      const orderType = t.orders.types[order.order_type] ?? order.order_type;

                      return (
                        <article key={order.id} className={`kds-card workflow-${order.status} sla-${slaState}`}>
                          <div className="kds-card-head">
                            <div className="kds-order-identity">
                              <strong>{t.kitchen.orderNo} #{order.order_prefix ?? ""}{order.order_no}</strong>
                              <div className="kds-order-tags">
                                {/* W4d: العمود يعبر عن الحالة — لا بادج حالة مكررة داخل الكارت */}
                                <span className="kds-order-type">{orderType}</span>
                              </div>
                            </div>
                            <div className={`kds-sla sla-${slaState}`} title={`${slaLabel}: ${elapsed}`}>
                              <span className="kds-sla-label"><span aria-hidden>{SLA_ICON[slaState]}</span>{slaLabel}</span>
                              <span className="kds-timer" dir="ltr" aria-label={`الزمن المنقضي ${elapsed}، حالة SLA: ${slaLabel}`}>{elapsed}</span>
                            </div>
                          </div>

                          <div className="kds-meta">
                            {/* W4 phase1: توقيت واضح (label ثم الوقت أساسيًا ثم التاريخ ثانويًا) */}
                            <span className="kds-received" title={formatExact(anchor)}>
                              <b>التوقيت</b>
                              <time dateTime={anchor ?? undefined}>{formatClock(anchor)}</time>
                              <small>{formatDay(anchor)}</small>
                            </span>
                            <span className="kds-count">
                              <b>الأصناف</b>
                              <strong>{itemCount}</strong>
                            </span>
                            {order.ready_at && order.status === "ready" && (
                              <span className="kds-received" title={formatExact(order.ready_at)}>
                                <b>جاهز منذ</b>
                                <time dateTime={order.ready_at}>{formatClock(order.ready_at)}</time>
                                <small>{formatDay(order.ready_at)}</small>
                              </span>
                            )}
                          </div>

                          <ul className="kds-items">
                            {order.items.map((item) => {
                              const choices = kitchenItemChoices(item);
                              return (
                                <li key={item.id}>
                                  <div className="kds-item-top">
                                    <div className="kds-item-main">
                                      <strong><span className="kds-item-qty">{item.qty}×</span>{item.name_ar}</strong>
                                    </div>
                                    {(choices.size || choices.bread) && (
                                      <div className="kds-item-choices" aria-label="اختيارات الصنف">
                                        {choices.size && <span className="kds-choice size"><b>الحجم</b>{choices.size}</span>}
                                        {choices.bread && <span className="kds-choice bread"><b>العيش</b>{choices.bread}</span>}
                                      </div>
                                    )}
                                  </div>

                                  {choices.extras.length > 0 && (
                                    <div className="kds-mods">
                                      <b>الإضافات</b>
                                      <div className="kds-extra-list">
                                        {choices.extras.map((extra, index) => <span key={`${item.id}-extra-${index}`}>{extra}</span>)}
                                      </div>
                                    </div>
                                  )}

                                  {(item.prep_station_ar || (item.prep_time_minutes ?? 0) > 0) && (
                                    <div className="kds-station">
                                      {item.prep_station_ar && <span><b>المحطة:</b> {item.prep_station_ar}</span>}
                                      {(item.prep_time_minutes ?? 0) > 0 && <span><b>التحضير:</b> {item.prep_time_minutes} د</span>}
                                    </div>
                                  )}
                                  {item.notes && <div className="kds-note"><strong>{t.kitchen.notes}:</strong> {item.notes}</div>}
                                </li>
                              );
                            })}
                          </ul>

                          {order.notes && <div className="kds-note order-note"><strong>{t.kitchen.notes}:</strong> {order.notes}</div>}
                          {NEXT[order.status] && (
                            <div className="kds-card-actions">
                              <Button variant="primary" className="kds-action" aria-label={`${NEXT[order.status].label()} للطلب ${order.order_prefix ?? ""}${order.order_no}`} onClick={() => advance(order)}>
                                {NEXT[order.status].label()}
                              </Button>
                            </div>
                          )}
                        </article>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        </>
      ) : null}
    </div>
  );
}
