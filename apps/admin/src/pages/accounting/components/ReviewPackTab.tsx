import { useCallback, useEffect, useState } from "react";
import { Badge, Button, ErrorState, FormField, LoadingState, Select, StatusChip } from "../../../components/ui/primitives";
import {
  fetchAccountingSettings,
  fetchEventsSummary,
  fetchJournals,
  fetchPeriods,
  fetchResiduals,
  fetchTrialBalance,
} from "../accountingApi";
import {
  STATUS_LABELS,
  type AccountingPeriod,
  type AccountingSettings,
  type EventSummaryRow,
  type JournalEntryRow,
  type TrialBalanceResponse,
} from "../accountingTypes";
import { revenueRecognitionLabel } from "../../../lib/labels";

type LoadState = "loading" | "error" | "ready";

const UNRESOLVED_STATUSES = ["failed", "dead", "pending_policy", "deferred_rounding"] as const;

/**
 * شاشة (ط): حزمة مراجعة المحاسب — FR-295.
 * تجميع للقراءة والطباعة فقط: السياسة وقيمها الفعلية، ميزان الفترة، ملخص
 * التسويات وعكوسها، وعدّادات غير المحلول — كل الأرقام من الخادم.
 */
export function ReviewPackTab() {
  const [state, setState] = useState<LoadState>("loading");
  const [error, setError] = useState("");
  const [settings, setSettings] = useState<AccountingSettings | null>(null);
  const [summary, setSummary] = useState<EventSummaryRow[]>([]);
  const [periods, setPeriods] = useState<AccountingPeriod[]>([]);
  const [settlements, setSettlements] = useState<JournalEntryRow[]>([]);
  const [totalOpenResidual, setTotalOpenResidual] = useState("0.0000");
  const [periodId, setPeriodId] = useState("");
  const [trialBalance, setTrialBalance] = useState<TrialBalanceResponse | null>(null);
  const [tbError, setTbError] = useState("");

  const load = useCallback(async () => {
    setState("loading");
    setError("");
    try {
      const [settingsRes, summaryRes, periodsRes, settlementsRes, reversalsRes, residualsRes] = await Promise.all([
        fetchAccountingSettings(),
        fetchEventsSummary(),
        fetchPeriods(),
        fetchJournals({ event_type: "residual.settlement", limit: "50" }),
        fetchJournals({ event_type: "journal.reversal", source_type: "journal_entry", limit: "50" }),
        fetchResiduals({ status: "open" }),
      ]);
      setSettings(settingsRes.data);
      setSummary(summaryRes.data);
      setPeriods(periodsRes.data);
      // Settlements + the reversals that undo a settlement (correlated by the
      // settlement entry ids), newest first — so "settlements and reversals"
      // is faithful, not settlements only.
      const settlementIds = new Set(settlementsRes.data.map((entry) => entry.id));
      const settlementReversals = reversalsRes.data.filter((entry) => settlementIds.has(entry.source_id));
      setSettlements(
        [...settlementsRes.data, ...settlementReversals].sort((a, b) =>
          a.entry_date < b.entry_date ? 1 : a.entry_date > b.entry_date ? -1 : 0
        )
      );
      setTotalOpenResidual(residualsRes.data.total_open);
      setState("ready");
    } catch (e: any) {
      setError(e.message ?? "تعذر تجميع حزمة المراجعة");
      setState("error");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setTrialBalance(null);
    setTbError("");
    if (!periodId) return;
    fetchTrialBalance({ period_id: periodId })
      .then(setTrialBalance)
      .catch((e: any) => setTbError(e.message ?? "تعذر تحميل ميزان الفترة"));
  }, [periodId]);

  if (state === "loading") return <LoadingState label="جارٍ تجميع حزمة المراجعة…" />;
  if (state === "error") return <ErrorState message={error} onRetry={load} />;

  const countsByStatus = new Map(summary.map((row) => [row.status, Number(row.count)]));
  // جمع عدادات (أعداد صفوف، ليست مبالغ) لعرض إجمالي غير المحلول
  const unresolvedTotal = UNRESOLVED_STATUSES.reduce(
    (total, status) => total + (countsByStatus.get(status) ?? 0),
    0
  );

  return (
    <div className="stack">
      <div className="inv-actions">
        <Button variant="primary" onClick={() => window.print()}>طباعة الحزمة</Button>
      </div>

      <div className="panel">
        <h3>١ — السياسة المحاسبية المعتمدة (ADR-004)</h3>
        <dl className="acc-kv">
          <dt>آلية التسوية (ثابت)</dt>
          <dd>قيد تسوية آلي متوازن عند إقفال كل فترة إلى حساب التقريب المُعرّف للمستأجر</dd>
          <dt>تاريخ الاعتراف بالتسوية (ثابت)</dt>
          <dd>تاريخ إقفال الفترة</dd>
          <dt>الدقة (ثابت)</dt>
          <dd className="mono" dir="ltr">4dp source / 2dp journal / half-up</dd>
          <dt>ض.ق.م</dt>
          <dd>
            {settings?.vat_registered ? "مسجّل" : "غير مسجّل"} — النسبة{" "}
            <span className="mono acc-num">{settings?.vat_rate}%</span>
          </dd>
          <dt>الاعتراف بالإيراد</dt>
          <dd>{revenueRecognitionLabel(settings?.revenue_recognition)}</dd>
          <dt>اليوم التشغيلي</dt>
          <dd>
            <span className="mono" dir="ltr">{settings?.timezone}</span> — يقفل الساعة{" "}
            <span className="mono acc-num">{settings?.day_close_hour}:00</span>
          </dd>
          <dt>حد الأهمية النسبية (تنبيه فقط)</dt>
          <dd className="mono acc-num">{settings?.materiality_threshold}</dd>
        </dl>
      </div>

      <div className="panel">
        <h3>٢ — الأحداث غير المحلولة</h3>
        <div className="crm-kpis">
          <div className="crm-kpi">
            <b>{unresolvedTotal}</b>
            <span>إجمالي غير المحلول</span>
          </div>
          {UNRESOLVED_STATUSES.map((status) => (
            <div key={status} className="crm-kpi">
              <b>{countsByStatus.get(status) ?? 0}</b>
              <span>{STATUS_LABELS[status]}</span>
            </div>
          ))}
          <div className="crm-kpi">
            <b className="mono acc-num">{totalOpenResidual}</b>
            <span>residual مفتوح (4dp)</span>
          </div>
        </div>
      </div>

      <div className="panel">
        <h3>٣ — الفترات المحاسبية</h3>
        <table className="crm-table inv-table" dir="rtl">
          <thead>
            <tr>
              <th scope="col">من</th>
              <th scope="col">إلى</th>
              <th scope="col">الحالة</th>
            </tr>
          </thead>
          <tbody>
            {periods.map((period) => (
              <tr key={period.id}>
                <td className="mono acc-num">{period.starts_on}</td>
                <td className="mono acc-num">{period.ends_on}</td>
                <td>
                  {period.status === "locked" ? <Badge tone="danger">مقفولة</Badge> : <Badge tone="success">مفتوحة</Badge>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!periods.length && <div className="empty">لا فترات بعد</div>}
      </div>

      <div className="panel">
        <h3>٤ — ميزان فترة محددة</h3>
        <FormField label="الفترة">
          <Select value={periodId} onChange={(e) => setPeriodId(e.target.value)} aria-label="فترة الميزان">
            <option value="">اختر فترة…</option>
            {periods.map((period) => (
              <option key={period.id} value={period.id}>
                {period.starts_on} ← {period.ends_on}
              </option>
            ))}
          </Select>
        </FormField>
        {tbError && <p className="muted">{tbError}</p>}
        {trialBalance && (
          <div className="inv-actions">
            <StatusChip tone={trialBalance.balanced ? "success" : "danger"}>
              مدين {trialBalance.totals.debit} / دائن {trialBalance.totals.credit}
            </StatusChip>
            <StatusChip tone={trialBalance.residual_balance === "0.0000" ? "success" : "warning"}>
              residual الفترة: {trialBalance.residual_balance}
            </StatusChip>
          </div>
        )}
      </div>

      <div className="panel">
        <h3>٥ — التسويات وعكوسها</h3>
        <table className="crm-table inv-table" dir="rtl">
          <thead>
            <tr>
              <th scope="col">تاريخ القيد</th>
              <th scope="col">الوصف</th>
              <th scope="col">النوع</th>
            </tr>
          </thead>
          <tbody>
            {settlements.map((entry) => (
              <tr key={entry.id}>
                <td className="mono acc-num">{entry.entry_date}</td>
                <td>{entry.description}</td>
                <td>{entry.reversal_of_entry_id ? <Badge tone="warning">عكس تسوية</Badge> : <Badge tone="success">تسوية</Badge>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!settlements.length && <div className="empty">لا تسويات مسجلة</div>}
      </div>
    </div>
  );
}
