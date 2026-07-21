import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  FormField,
  LoadingState,
  PageHeader,
  Select,
  StatusChip,
  Tabs,
  TextArea,
  TextInput,
  ViewOnlyNotice,
} from "../../components/ui/primitives";
import { ConfirmDialog, Drawer, Modal, toast } from "../../components/ui/overlays";
import { api } from "../../lib/api";
import { useMe } from "../../lib/me";
import {
  fetchAccountingSettings,
  fetchEvent,
  fetchEvents,
  fetchEventsSummary,
  fetchJournal,
  fetchJournals,
  fetchPeriods,
  fetchResiduals,
  fmtTimestamp,
  markEventDead,
  retryEvent,
  reverseJournal,
  type EventFilters,
  type JournalFilters,
} from "./accountingApi";
import {
  FINANCIAL_EVENT_STATUSES,
  STATUS_LABELS,
  STATUS_TONES,
  type AccountingPeriod,
  type AccountingSettings,
  type BranchRef,
  type EventSummaryRow,
  type FinancialEventDetail,
  type FinancialEventRow,
  type JournalEntryDetail,
  type JournalEntryRow,
  type ResidualsResponse,
} from "./accountingTypes";

/**
 * ACC-FULL-01 CP5 — accounting admin foundation.
 * All balances, totals, and rounding come from the server verbatim; this page
 * renders strings and row counts only, and refreshes from the server after
 * every write (no optimistic financial state).
 */

type LoadState = "loading" | "error" | "ready";

export function AccountingPage() {
  const { can } = useMe();
  const canManage = can("accounting.manage");
  const [tab, setTab] = useState("dashboard");
  const [branches, setBranches] = useState<BranchRef[]>([]);
  const [journalToOpen, setJournalToOpen] = useState<string | null>(null);
  const [eventToOpen, setEventToOpen] = useState<string | null>(null);

  useEffect(() => {
    api<{ data: BranchRef[] }>("/branches")
      .then((res) => setBranches(res.data))
      .catch(() => setBranches([]));
  }, []);

  const branchNames = useMemo(() => new Map(branches.map((b) => [b.id, b.name])), [branches]);

  const openJournal = useCallback((id: string) => {
    setJournalToOpen(id);
    setTab("journals");
  }, []);
  const openEvent = useCallback((id: string) => {
    setEventToOpen(id);
    setTab("events");
  }, []);

  return (
    <div dir="rtl">
      <PageHeader title="الحسابات" subtitle="الأحداث المالية والقيود — كل الأرقام من الخادم مباشرة" />
      {!canManage && <ViewOnlyNotice permission="accounting.manage" />}

      <Tabs
        tabs={[
          ["dashboard", "لوحة الحالة"],
          ["events", "الأحداث المالية"],
          ["journals", "القيود"],
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === "dashboard" && <DashboardTab branchNames={branchNames} />}
      {tab === "events" && (
        <EventsTab
          branches={branches}
          branchNames={branchNames}
          canManage={canManage}
          onOpenJournal={openJournal}
          externalOpenId={eventToOpen}
          onExternalOpenHandled={() => setEventToOpen(null)}
        />
      )}
      {tab === "journals" && (
        <JournalsTab
          branches={branches}
          branchNames={branchNames}
          canManage={canManage}
          onOpenEvent={openEvent}
          externalOpenId={journalToOpen}
          onExternalOpenHandled={() => setJournalToOpen(null)}
        />
      )}
    </div>
  );
}

/* ——— لوحة الحالة ——— */

function DashboardTab({ branchNames }: { branchNames: Map<string, string> }) {
  const [state, setState] = useState<LoadState>("loading");
  const [error, setError] = useState("");
  const [summary, setSummary] = useState<EventSummaryRow[]>([]);
  const [residuals, setResiduals] = useState<ResidualsResponse | null>(null);
  const [settings, setSettings] = useState<AccountingSettings | null>(null);
  const [periods, setPeriods] = useState<AccountingPeriod[]>([]);
  const [recentErrors, setRecentErrors] = useState<FinancialEventRow[]>([]);

  const load = useCallback(async () => {
    setState("loading");
    setError("");
    try {
      const [summaryRes, residualsRes, settingsRes, periodsRes, failedRes, deadRes] = await Promise.all([
        fetchEventsSummary(),
        fetchResiduals(),
        fetchAccountingSettings(),
        fetchPeriods(),
        fetchEvents({ status: "failed", limit: "5" }),
        fetchEvents({ status: "dead", limit: "5" }),
      ]);
      setSummary(summaryRes.data);
      setResiduals(residualsRes.data);
      setSettings(settingsRes.data);
      setPeriods(periodsRes.data);
      // دمج عرضي لآخر الأخطاء (ترتيب نصي بطابع ISO — ليس حسابًا ماليًا)
      setRecentErrors(
        [...failedRes.data, ...deadRes.data]
          .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
          .slice(0, 5)
      );
      setState("ready");
    } catch (e: any) {
      setError(e.message ?? "تعذر تحميل لوحة الحالة");
      setState("error");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (state === "loading") return <LoadingState label="جارٍ تحميل لوحة الحالة…" />;
  if (state === "error") return <ErrorState message={error} onRetry={load} />;

  const countsByStatus = new Map(summary.map((row) => [row.status, Number(row.count)]));
  const latestPeriod = periods[0];
  const threshold = settings?.materiality_threshold ?? "0.00";
  // تنبيه عرضي فقط (ADR-004 النوع ب): مقارنة قيمتين من الخادم لإظهار تحذير —
  // لا يُشتق منها أي رقم مالي معروض.
  const thresholdExceeded =
    Number(threshold) > 0 && Math.abs(Number(residuals?.total_open ?? "0")) > Number(threshold);

  return (
    <div className="stack">
      {thresholdExceeded && (
        <StatusChip tone="warning">
          إجمالي فروق التقريب المفتوحة ({residuals!.total_open}) تجاوز حد الأهمية النسبية ({threshold} ج.م)
        </StatusChip>
      )}

      <div className="crm-kpis">
        {FINANCIAL_EVENT_STATUSES.map((status) => (
          <div key={status} className="crm-kpi">
            <b>{countsByStatus.get(status) ?? 0}</b>
            <span>
              <Badge tone={STATUS_TONES[status]}>{STATUS_LABELS[status]}</Badge>
            </span>
          </div>
        ))}
      </div>

      <div className="crm-kpis">
        <div className="crm-kpi">
          <b className="mono acc-num">{residuals?.total_open ?? "0.0000"}</b>
          <span>إجمالي residual المفتوح (4dp)</span>
        </div>
        <div className="crm-kpi">
          <b className="mono acc-num">{threshold}</b>
          <span>حد الأهمية النسبية (تنبيه فقط)</span>
        </div>
        <div className="crm-kpi">
          <b>{latestPeriod ? (latestPeriod.status === "locked" ? "مقفولة" : "مفتوحة") : "—"}</b>
          <span>
            {latestPeriod ? `آخر فترة: ${latestPeriod.starts_on} ← ${latestPeriod.ends_on}` : "لا فترات محاسبية بعد"}
          </span>
        </div>
      </div>

      {residuals && residuals.summary.length > 0 && (
        <div className="panel">
          <table className="crm-table inv-table" dir="rtl">
            <caption className="muted">الفروق المفتوحة حسب الفرع</caption>
            <thead>
              <tr>
                <th scope="col">الفرع</th>
                <th scope="col">عدد البنود</th>
                <th scope="col">الإجمالي (4dp)</th>
              </tr>
            </thead>
            <tbody>
              {residuals.summary.map((row) => (
                <tr key={row.branch_id ?? "none"}>
                  <td>{row.branch_id ? branchNames.get(row.branch_id) ?? row.branch_id : "بلا فرع"}</td>
                  <td className="mono acc-num">{Number(row.open_count)}</td>
                  <td className="mono acc-num">{row.open_total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="panel">
        <table className="crm-table inv-table" dir="rtl">
          <caption className="muted">آخر الأخطاء (فاشل / متوقف)</caption>
          <thead>
            <tr>
              <th scope="col">التاريخ</th>
              <th scope="col">نوع الحدث</th>
              <th scope="col">الحالة</th>
              <th scope="col">الخطأ</th>
            </tr>
          </thead>
          <tbody>
            {recentErrors.map((event) => (
              <tr key={event.id}>
                <td className="mono acc-num">{fmtTimestamp(event.created_at)}</td>
                <td className="mono">{event.event_type}</td>
                <td>
                  <Badge tone={STATUS_TONES[event.status]}>{STATUS_LABELS[event.status]}</Badge>
                </td>
                <td>{event.last_error ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!recentErrors.length && <div className="empty">لا أخطاء حديثة</div>}
      </div>
    </div>
  );
}

/* ——— الأحداث المالية ——— */

function EventsTab({
  branches,
  branchNames,
  canManage,
  onOpenJournal,
  externalOpenId,
  onExternalOpenHandled,
}: {
  branches: BranchRef[];
  branchNames: Map<string, string>;
  canManage: boolean;
  onOpenJournal: (id: string) => void;
  externalOpenId: string | null;
  onExternalOpenHandled: () => void;
}) {
  const [state, setState] = useState<LoadState>("loading");
  const [error, setError] = useState("");
  const [rows, setRows] = useState<FinancialEventRow[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [filters, setFilters] = useState<EventFilters>({});
  const [draft, setDraft] = useState<EventFilters>({});
  const [openId, setOpenId] = useState<string | null>(null);
  const [reloadSignal, setReloadSignal] = useState(0);

  useEffect(() => {
    if (externalOpenId) {
      setOpenId(externalOpenId);
      onExternalOpenHandled();
    }
  }, [externalOpenId, onExternalOpenHandled]);

  const load = useCallback(async () => {
    setState("loading");
    setError("");
    try {
      const res = await fetchEvents(filters);
      setRows(res.data);
      setNextCursor(res.next_cursor);
      setState("ready");
    } catch (e: any) {
      setError(e.message ?? "تعذر تحميل الأحداث المالية");
      setState("error");
    }
  }, [filters]);

  useEffect(() => {
    load();
  }, [load, reloadSignal]);

  const loadMore = useCallback(async () => {
    if (!nextCursor) return;
    setLoadingMore(true);
    try {
      const res = await fetchEvents({ ...filters, cursor: nextCursor });
      setRows((prev) => [...prev, ...res.data]);
      setNextCursor(res.next_cursor);
    } catch (e: any) {
      toast(e.message ?? "تعذر تحميل المزيد", "error");
    } finally {
      setLoadingMore(false);
    }
  }, [filters, nextCursor]);

  return (
    <div className="stack">
      <div className="inv-toolbar">
        <FormField label="الحالة">
          <Select
            value={draft.status ?? ""}
            onChange={(e) => setDraft((d) => ({ ...d, status: e.target.value || undefined }))}
            aria-label="تصفية حسب الحالة"
          >
            <option value="">كل الحالات</option>
            {FINANCIAL_EVENT_STATUSES.map((status) => (
              <option key={status} value={status}>{STATUS_LABELS[status]}</option>
            ))}
          </Select>
        </FormField>
        <FormField label="نوع الحدث" hint="مطابقة تامة، مثل payment.captured">
          <TextInput
            value={draft.event_type ?? ""}
            onChange={(e) => setDraft((d) => ({ ...d, event_type: e.target.value || undefined }))}
            placeholder="كل الأنواع"
            dir="ltr"
          />
        </FormField>
        <FormField label="الفرع">
          <Select
            value={draft.branch_id ?? ""}
            onChange={(e) => setDraft((d) => ({ ...d, branch_id: e.target.value || undefined }))}
            aria-label="تصفية حسب الفرع"
          >
            <option value="">كل الفروع</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </Select>
        </FormField>
        <FormField label="من تاريخ">
          <TextInput type="date" value={draft.date_from ?? ""} onChange={(e) => setDraft((d) => ({ ...d, date_from: e.target.value || undefined }))} />
        </FormField>
        <FormField label="إلى تاريخ">
          <TextInput type="date" value={draft.date_to ?? ""} onChange={(e) => setDraft((d) => ({ ...d, date_to: e.target.value || undefined }))} />
        </FormField>
        <Button variant="primary" onClick={() => setFilters(draft)}>تطبيق الفلاتر</Button>
      </div>

      {state === "loading" && <LoadingState label="جارٍ تحميل الأحداث…" />}
      {state === "error" && <ErrorState message={error} onRetry={load} />}
      {state === "ready" && !rows.length && <EmptyState message="لا أحداث مطابقة" />}
      {state === "ready" && rows.length > 0 && (
        <div className="panel">
          <table className="crm-table inv-table" dir="rtl">
            <thead>
              <tr>
                <th scope="col">التاريخ</th>
                <th scope="col">نوع الحدث</th>
                <th scope="col">المصدر</th>
                <th scope="col">الفرع</th>
                <th scope="col">الحالة</th>
                <th scope="col">آخر خطأ</th>
                <th scope="col">تفاصيل</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((event) => (
                <tr key={event.id}>
                  <td className="mono acc-num">{fmtTimestamp(event.created_at)}</td>
                  <td className="mono">{event.event_type}</td>
                  <td className="mono">{event.source_type}</td>
                  <td>{event.branch_id ? branchNames.get(event.branch_id) ?? event.branch_id : "—"}</td>
                  <td>
                    <Badge tone={STATUS_TONES[event.status]}>{STATUS_LABELS[event.status]}</Badge>
                  </td>
                  <td className="acc-truncate" title={event.last_error ?? undefined}>{event.last_error ?? "—"}</td>
                  <td>
                    <Button onClick={() => setOpenId(event.id)}>عرض</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {state === "ready" && nextCursor && (
        <div className="inv-actions">
          <Button onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? "جارٍ التحميل…" : "تحميل المزيد"}
          </Button>
        </div>
      )}

      <EventDetailDrawer
        id={openId}
        canManage={canManage}
        branchNames={branchNames}
        onClose={() => setOpenId(null)}
        onChanged={() => setReloadSignal((n) => n + 1)}
        onOpenJournal={onOpenJournal}
      />
    </div>
  );
}

function EventDetailDrawer({
  id,
  canManage,
  branchNames,
  onClose,
  onChanged,
  onOpenJournal,
}: {
  id: string | null;
  canManage: boolean;
  branchNames: Map<string, string>;
  onClose: () => void;
  onChanged: () => void;
  onOpenJournal: (id: string) => void;
}) {
  const [state, setState] = useState<LoadState>("loading");
  const [error, setError] = useState("");
  const [detail, setDetail] = useState<FinancialEventDetail | null>(null);
  const [confirmRetry, setConfirmRetry] = useState(false);
  const [markDeadOpen, setMarkDeadOpen] = useState(false);
  const [deadReason, setDeadReason] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setState("loading");
    setError("");
    try {
      const res = await fetchEvent(id);
      setDetail(res.data);
      setState("ready");
    } catch (e: any) {
      setError(e.message ?? "تعذر تحميل تفاصيل الحدث");
      setState("error");
    }
  }, [id]);

  useEffect(() => {
    setDetail(null);
    setConfirmRetry(false);
    setMarkDeadOpen(false);
    setDeadReason("");
    load();
  }, [load]);

  const runRetry = async () => {
    if (!detail) return;
    setBusy(true);
    try {
      await retryEvent(detail.id);
      toast("تمت إعادة جدولة الحدث للمعالجة");
      setConfirmRetry(false);
      await load(); // الحالة الجديدة من الخادم — لا تفاؤل محلي
      onChanged();
    } catch (e: any) {
      toast(e.message ?? "تعذرت إعادة المحاولة", "error");
    } finally {
      setBusy(false);
    }
  };

  const runMarkDead = async () => {
    if (!detail) return;
    setBusy(true);
    try {
      await markEventDead(detail.id, deadReason.trim());
      toast("تم إيقاف الحدث نهائيًا");
      setMarkDeadOpen(false);
      await load();
      onChanged();
    } catch (e: any) {
      toast(e.message ?? "تعذر إيقاف الحدث", "error");
    } finally {
      setBusy(false);
    }
  };

  const canRetry = detail && (detail.status === "failed" || detail.status === "dead");
  const canMarkDead = detail && (detail.status === "pending" || detail.status === "failed");

  return (
    <>
      <Drawer
        open={!!id}
        onClose={onClose}
        title="تفاصيل الحدث المالي"
        wide
        footer={
          canManage && detail && (canRetry || canMarkDead) ? (
            <div className="inv-actions">
              {canRetry && (
                <Button variant="primary" onClick={() => setConfirmRetry(true)} disabled={busy}>
                  إعادة المحاولة
                </Button>
              )}
              {canMarkDead && (
                <Button variant="danger" onClick={() => setMarkDeadOpen(true)} disabled={busy}>
                  إيقاف نهائي
                </Button>
              )}
            </div>
          ) : undefined
        }
      >
        {state === "loading" && <LoadingState label="جارٍ تحميل التفاصيل…" />}
        {state === "error" && <ErrorState message={error} onRetry={load} />}
        {state === "ready" && detail && (
          <div className="stack">
            <dl className="acc-kv">
              <dt>الحالة</dt>
              <dd><Badge tone={STATUS_TONES[detail.status]}>{STATUS_LABELS[detail.status]}</Badge></dd>
              <dt>نوع الحدث</dt>
              <dd className="mono">{detail.event_type}</dd>
              <dt>المصدر</dt>
              <dd className="mono" dir="ltr">{detail.source_type} / {detail.source_id}</dd>
              <dt>الفرع</dt>
              <dd>{detail.branch_id ? branchNames.get(detail.branch_id) ?? detail.branch_id : "—"}</dd>
              <dt>المحاولات</dt>
              <dd className="mono acc-num">{detail.attempts}</dd>
              <dt>أنشئ في</dt>
              <dd className="mono acc-num">{fmtTimestamp(detail.created_at)}</dd>
              <dt>رُحّل في</dt>
              <dd className="mono acc-num">{fmtTimestamp(detail.posted_at)}</dd>
            </dl>

            {detail.last_error && (
              <div className="stack">
                <StatusChip tone="danger">آخر خطأ</StatusChip>
                <p className="mono acc-payload" dir="ltr">{detail.last_error}</p>
              </div>
            )}

            {detail.journal_entry && (
              <div className="stack">
                <StatusChip tone="success">القيد المرتبط</StatusChip>
                <dl className="acc-kv">
                  <dt>تاريخ القيد</dt>
                  <dd className="mono acc-num">{detail.journal_entry.entry_date}</dd>
                  <dt>الوصف</dt>
                  <dd>{detail.journal_entry.description}</dd>
                </dl>
                <div className="inv-actions">
                  <Button onClick={() => { onClose(); onOpenJournal(detail.journal_entry!.id); }}>فتح القيد</Button>
                </div>
              </div>
            )}

            {detail.reconciliation && (
              <div className="stack">
                <StatusChip tone="warning">بند فروق التقريب</StatusChip>
                <dl className="acc-kv">
                  <dt>المعادلة</dt>
                  <dd className="mono acc-num">
                    {detail.reconciliation.source_amount} = {detail.reconciliation.journal_amount} + {detail.reconciliation.residual_amount}
                  </dd>
                  <dt>حالة البند</dt>
                  <dd className="mono">{detail.reconciliation.status}</dd>
                </dl>
              </div>
            )}

            {detail.source && (
              <div className="stack">
                <StatusChip tone="info">مصدر الحدث (lineage)</StatusChip>
                <pre className="mono acc-payload" dir="ltr">{JSON.stringify(detail.source, null, 2)}</pre>
              </div>
            )}

            <details>
              <summary>الحمولة الكاملة (payload)</summary>
              <pre className="mono acc-payload" dir="ltr">{JSON.stringify(detail.payload, null, 2)}</pre>
            </details>
          </div>
        )}
      </Drawer>

      <ConfirmDialog
        open={confirmRetry}
        title="إعادة المحاولة"
        message="سيُعاد الحدث إلى قائمة الانتظار ليُعالج من جديد. متابعة؟"
        confirmLabel="إعادة المحاولة"
        onConfirm={runRetry}
        onCancel={() => setConfirmRetry(false)}
      />

      <Modal
        open={markDeadOpen}
        onClose={() => setMarkDeadOpen(false)}
        title="إيقاف الحدث نهائيًا"
        footer={
          <div className="inv-actions">
            <Button variant="danger" onClick={runMarkDead} disabled={busy || deadReason.trim().length < 3}>
              تأكيد الإيقاف
            </Button>
            <Button onClick={() => setMarkDeadOpen(false)}>إلغاء</Button>
          </div>
        }
      >
        <FormField label="سبب الإيقاف (إلزامي)" hint="٣ أحرف على الأقل — يُسجّل في سجل العمليات">
          <TextArea value={deadReason} onChange={(e) => setDeadReason(e.target.value)} rows={3} />
        </FormField>
      </Modal>
    </>
  );
}

/* ——— القيود ——— */

function JournalsTab({
  branches,
  branchNames,
  canManage,
  onOpenEvent,
  externalOpenId,
  onExternalOpenHandled,
}: {
  branches: BranchRef[];
  branchNames: Map<string, string>;
  canManage: boolean;
  onOpenEvent: (id: string) => void;
  externalOpenId: string | null;
  onExternalOpenHandled: () => void;
}) {
  const [state, setState] = useState<LoadState>("loading");
  const [error, setError] = useState("");
  const [rows, setRows] = useState<JournalEntryRow[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [filters, setFilters] = useState<JournalFilters>({});
  const [draft, setDraft] = useState<JournalFilters>({});
  const [openId, setOpenId] = useState<string | null>(null);
  const [reloadSignal, setReloadSignal] = useState(0);

  useEffect(() => {
    if (externalOpenId) {
      setOpenId(externalOpenId);
      onExternalOpenHandled();
    }
  }, [externalOpenId, onExternalOpenHandled]);

  const load = useCallback(async () => {
    setState("loading");
    setError("");
    try {
      const res = await fetchJournals(filters);
      setRows(res.data);
      setNextCursor(res.next_cursor);
      setState("ready");
    } catch (e: any) {
      setError(e.message ?? "تعذر تحميل القيود");
      setState("error");
    }
  }, [filters]);

  useEffect(() => {
    load();
  }, [load, reloadSignal]);

  const loadMore = useCallback(async () => {
    if (!nextCursor) return;
    setLoadingMore(true);
    try {
      const res = await fetchJournals({ ...filters, cursor: nextCursor });
      setRows((prev) => [...prev, ...res.data]);
      setNextCursor(res.next_cursor);
    } catch (e: any) {
      toast(e.message ?? "تعذر تحميل المزيد", "error");
    } finally {
      setLoadingMore(false);
    }
  }, [filters, nextCursor]);

  return (
    <div className="stack">
      <div className="inv-toolbar">
        <FormField label="نوع الحدث" hint="مثل residual.settlement">
          <TextInput
            value={draft.event_type ?? ""}
            onChange={(e) => setDraft((d) => ({ ...d, event_type: e.target.value || undefined }))}
            placeholder="كل الأنواع"
            dir="ltr"
          />
        </FormField>
        <FormField label="نوع المصدر" hint="مثل stock_movement">
          <TextInput
            value={draft.source_type ?? ""}
            onChange={(e) => setDraft((d) => ({ ...d, source_type: e.target.value || undefined }))}
            placeholder="كل المصادر"
            dir="ltr"
          />
        </FormField>
        <FormField label="الفرع">
          <Select
            value={draft.branch_id ?? ""}
            onChange={(e) => setDraft((d) => ({ ...d, branch_id: e.target.value || undefined }))}
            aria-label="تصفية حسب الفرع"
          >
            <option value="">كل الفروع</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </Select>
        </FormField>
        <FormField label="من تاريخ">
          <TextInput type="date" value={draft.date_from ?? ""} onChange={(e) => setDraft((d) => ({ ...d, date_from: e.target.value || undefined }))} />
        </FormField>
        <FormField label="إلى تاريخ">
          <TextInput type="date" value={draft.date_to ?? ""} onChange={(e) => setDraft((d) => ({ ...d, date_to: e.target.value || undefined }))} />
        </FormField>
        <Button variant="primary" onClick={() => setFilters(draft)}>تطبيق الفلاتر</Button>
      </div>

      {state === "loading" && <LoadingState label="جارٍ تحميل القيود…" />}
      {state === "error" && <ErrorState message={error} onRetry={load} />}
      {state === "ready" && !rows.length && <EmptyState message="لا قيود مطابقة" />}
      {state === "ready" && rows.length > 0 && (
        <div className="panel">
          <table className="crm-table inv-table" dir="rtl">
            <thead>
              <tr>
                <th scope="col">تاريخ القيد</th>
                <th scope="col">الوصف</th>
                <th scope="col">نوع الحدث</th>
                <th scope="col">المصدر</th>
                <th scope="col">الفرع</th>
                <th scope="col">السطور</th>
                <th scope="col">تفاصيل</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((entry) => (
                <tr key={entry.id}>
                  <td className="mono acc-num">{entry.entry_date}</td>
                  <td>
                    {entry.description}
                    {entry.reversal_of_entry_id && <> <Badge tone="warning">قيد عكسي</Badge></>}
                  </td>
                  <td className="mono">{entry.event_type}</td>
                  <td className="mono">{entry.source_type}</td>
                  <td>{entry.branch_id ? branchNames.get(entry.branch_id) ?? entry.branch_id : "—"}</td>
                  <td className="mono acc-num">{entry.lines.length}</td>
                  <td>
                    <Button onClick={() => setOpenId(entry.id)}>عرض</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {state === "ready" && nextCursor && (
        <div className="inv-actions">
          <Button onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? "جارٍ التحميل…" : "تحميل المزيد"}
          </Button>
        </div>
      )}

      <JournalDetailDrawer
        id={openId}
        canManage={canManage}
        branchNames={branchNames}
        onClose={() => setOpenId(null)}
        onChanged={() => setReloadSignal((n) => n + 1)}
        onOpenJournal={(target) => setOpenId(target)}
        onOpenEvent={onOpenEvent}
      />
    </div>
  );
}

function JournalDetailDrawer({
  id,
  canManage,
  branchNames,
  onClose,
  onChanged,
  onOpenJournal,
  onOpenEvent,
}: {
  id: string | null;
  canManage: boolean;
  branchNames: Map<string, string>;
  onClose: () => void;
  onChanged: () => void;
  onOpenJournal: (id: string) => void;
  onOpenEvent: (id: string) => void;
}) {
  const [state, setState] = useState<LoadState>("loading");
  const [error, setError] = useState("");
  const [detail, setDetail] = useState<JournalEntryDetail | null>(null);
  const [reverseOpen, setReverseOpen] = useState(false);
  const [reverseReason, setReverseReason] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setState("loading");
    setError("");
    try {
      const res = await fetchJournal(id);
      setDetail(res.data);
      setState("ready");
    } catch (e: any) {
      setError(e.message ?? "تعذر تحميل القيد");
      setState("error");
    }
  }, [id]);

  useEffect(() => {
    setDetail(null);
    setReverseOpen(false);
    setReverseReason("");
    load();
  }, [load]);

  const runReverse = async () => {
    if (!detail) return;
    setBusy(true);
    try {
      const res = await reverseJournal(detail.id, reverseReason.trim());
      toast("تم إنشاء القيد العكسي");
      setReverseOpen(false);
      await load();
      onChanged();
      onOpenJournal(res.data.id); // فتح القيد العكسي من بيانات الخادم
    } catch (e: any) {
      toast(e.message ?? "تعذر عكس القيد", "error");
    } finally {
      setBusy(false);
    }
  };

  // شروط زر العكس: القيد ليس عكسيًا ولم يُعكس بعد — الخادم يبقى الحكم النهائي.
  const canReverse = canManage && detail && !detail.reversal_of_entry_id && !detail.reversed_by;
  const balanced = detail ? detail.totals.debit === detail.totals.credit : false;

  return (
    <>
      <Drawer
        open={!!id}
        onClose={onClose}
        title="تفاصيل القيد"
        wide
        footer={
          canReverse ? (
            <div className="inv-actions">
              <Button variant="danger" onClick={() => setReverseOpen(true)} disabled={busy}>
                عكس القيد
              </Button>
            </div>
          ) : undefined
        }
      >
        {state === "loading" && <LoadingState label="جارٍ تحميل القيد…" />}
        {state === "error" && <ErrorState message={error} onRetry={load} />}
        {state === "ready" && detail && (
          <div className="stack">
            <dl className="acc-kv">
              <dt>تاريخ القيد</dt>
              <dd className="mono acc-num">{detail.entry_date}</dd>
              <dt>الوصف</dt>
              <dd>{detail.description}</dd>
              <dt>نوع الحدث</dt>
              <dd className="mono">{detail.event_type}</dd>
              <dt>المصدر</dt>
              <dd className="mono" dir="ltr">{detail.source_type} / {detail.source_id}</dd>
              <dt>الفرع</dt>
              <dd>{detail.branch_id ? branchNames.get(detail.branch_id) ?? detail.branch_id : "—"}</dd>
              <dt>التوازن</dt>
              <dd>
                {balanced ? (
                  <StatusChip tone="success">متوازن — {detail.totals.debit} = {detail.totals.credit}</StatusChip>
                ) : (
                  <StatusChip tone="danger">غير متوازن</StatusChip>
                )}
              </dd>
            </dl>

            <div className="panel">
              <table className="crm-table inv-table" dir="rtl">
                <thead>
                  <tr>
                    <th scope="col">الحساب</th>
                    <th scope="col">البند</th>
                    <th scope="col">مدين</th>
                    <th scope="col">دائن</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.lines.map((line) => (
                    <tr key={line.id}>
                      <td>
                        <span className="mono">{line.account_code}</span> — {line.account_name_ar}
                      </td>
                      <td className="mono">{line.component}</td>
                      <td className="mono acc-num">{line.debit}</td>
                      <td className="mono acc-num">{line.credit}</td>
                    </tr>
                  ))}
                  <tr className="acc-totals-row">
                    <td colSpan={2}>الإجمالي (من الخادم)</td>
                    <td className="mono acc-num">{detail.totals.debit}</td>
                    <td className="mono acc-num">{detail.totals.credit}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {detail.reversal_of_entry_id && (
              <div className="inv-actions">
                <Badge tone="warning">هذا قيد عكسي</Badge>
                <Button onClick={() => onOpenJournal(detail.reversal_of_entry_id!)}>فتح القيد الأصلي</Button>
              </div>
            )}
            {detail.reversed_by && (
              <div className="inv-actions">
                <Badge tone="warning">تم عكس هذا القيد</Badge>
                <Button onClick={() => onOpenJournal(detail.reversed_by!.id)}>فتح القيد العكسي</Button>
              </div>
            )}

            {detail.financial_event && (
              <div className="stack">
                <StatusChip tone="info">الحدث المالي المصدر</StatusChip>
                <dl className="acc-kv">
                  <dt>الحالة</dt>
                  <dd>
                    <Badge tone={STATUS_TONES[detail.financial_event.status]}>
                      {STATUS_LABELS[detail.financial_event.status]}
                    </Badge>
                  </dd>
                  <dt>النوع</dt>
                  <dd className="mono">{detail.financial_event.event_type}</dd>
                </dl>
                <div className="inv-actions">
                  <Button onClick={() => { onClose(); onOpenEvent(detail.financial_event!.id); }}>فتح الحدث</Button>
                </div>
              </div>
            )}
          </div>
        )}
      </Drawer>

      <Modal
        open={reverseOpen}
        onClose={() => setReverseOpen(false)}
        title="عكس القيد"
        footer={
          <div className="inv-actions">
            <Button variant="danger" onClick={runReverse} disabled={busy || reverseReason.trim().length < 3}>
              تأكيد العكس
            </Button>
            <Button onClick={() => setReverseOpen(false)}>إلغاء</Button>
          </div>
        }
      >
        <p className="muted">
          سيُنشأ قيد عكسي مرتبط بالقيد الأصلي — القيود المرحّلة لا تُعدّل ولا تُحذف. الخادم يرفض العكس داخل فترة مقفولة.
        </p>
        <FormField label="سبب العكس (إلزامي)" hint="٣ أحرف على الأقل — يُسجّل في سجل العمليات">
          <TextArea value={reverseReason} onChange={(e) => setReverseReason(e.target.value)} rows={3} />
        </FormField>
      </Modal>
    </>
  );
}
