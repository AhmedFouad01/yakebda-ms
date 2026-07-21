import { useCallback, useEffect, useState } from "react";
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  FormField,
  LoadingState,
  Select,
  TextInput,
} from "../../../components/ui/primitives";
import { Modal, toast } from "../../../components/ui/overlays";
import { fetchJournals, fetchResiduals, settleResiduals, type ResidualFilters } from "../accountingApi";
import type { BranchRef, JournalEntryRow, ResidualsResponse, SettlementResult } from "../accountingTypes";

type LoadState = "loading" | "error" | "ready";

/**
 * شاشة (و): تسوية الفروق — FR-294.
 * المعاينة قبل التنفيذ هي بيانات الخادم نفسها (الفروق المفتوحة المجمّعة)؛
 * التنفيذ عبر POST /reconciliation/settle بمفتاح idempotency، والنتيجة تُعرض
 * من استجابة الخادم ثم يُعاد التحميل — لا حساب مالي في الواجهة.
 */
export function SettlementTab({
  branches,
  branchNames,
  canManage,
  onOpenJournal,
}: {
  branches: BranchRef[];
  branchNames: Map<string, string>;
  canManage: boolean;
  onOpenJournal: (id: string) => void;
}) {
  const [state, setState] = useState<LoadState>("loading");
  const [error, setError] = useState("");
  const [residuals, setResiduals] = useState<ResidualsResponse | null>(null);
  const [history, setHistory] = useState<JournalEntryRow[]>([]);
  const [filters, setFilters] = useState<ResidualFilters>({ status: "open" });
  const [draft, setDraft] = useState<ResidualFilters>({ status: "open" });
  const [executing, setExecuting] = useState(false);
  const [entryDate, setEntryDate] = useState("");
  const [idempotencyKey, setIdempotencyKey] = useState("");
  const [result, setResult] = useState<SettlementResult | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setState("loading");
    setError("");
    try {
      const [residualsRes, historyRes] = await Promise.all([
        fetchResiduals(filters),
        fetchJournals({ event_type: "residual.settlement", limit: "20" }),
      ]);
      setResiduals(residualsRes.data);
      setHistory(historyRes.data);
      setState("ready");
    } catch (e: any) {
      setError(e.message ?? "تعذر تحميل الفروق");
      setState("error");
    }
  }, [filters]);

  useEffect(() => {
    load();
  }, [load]);

  const openExecute = () => {
    setEntryDate(new Date().toISOString().slice(0, 10));
    setIdempotencyKey(crypto.randomUUID());
    setResult(null);
    setExecuting(true);
  };

  const runSettle = async () => {
    setBusy(true);
    try {
      const res = await settleResiduals({
        entry_date: entryDate,
        date_from: filters.date_from,
        date_to: filters.date_to,
        branch_id: filters.branch_id,
        idempotency_key: idempotencyKey,
      });
      setResult(res.data);
      toast(res.data.settled_count ? `سُوّي ${res.data.settled_count} بندًا` : "لا فروق مفتوحة للتسوية");
      await load();
    } catch (e: any) {
      toast(e.message ?? "رفض الخادم تنفيذ التسوية", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack">
      <div className="inv-toolbar">
        <FormField label="الحالة">
          <Select
            value={draft.status ?? "open"}
            onChange={(e) => setDraft((d) => ({ ...d, status: e.target.value }))}
            aria-label="تصفية حسب حالة البند"
          >
            <option value="open">مفتوح</option>
            <option value="settled">مُسوّى</option>
            <option value="reversed">معكوس</option>
          </Select>
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
        {canManage && (
          <Button variant="danger" onClick={openExecute}>تنفيذ التسوية…</Button>
        )}
      </div>

      {state === "loading" && <LoadingState label="جارٍ تحميل الفروق…" />}
      {state === "error" && <ErrorState message={error} onRetry={load} />}
      {state === "ready" && residuals && (
        <>
          <div className="crm-kpis">
            <div className="crm-kpi">
              <b className="mono acc-num">{residuals.total_open}</b>
              <span>إجمالي المفتوح ضمن الفلاتر (4dp)</span>
            </div>
            {residuals.summary.map((row) => (
              <div key={row.branch_id ?? "none"} className="crm-kpi">
                <b className="mono acc-num">{row.open_total}</b>
                <span>
                  {row.branch_id ? branchNames.get(row.branch_id) ?? row.branch_id : "بلا فرع"} — {Number(row.open_count)} بند
                </span>
              </div>
            ))}
          </div>

          {!residuals.items.length ? (
            <EmptyState message="لا بنود مطابقة" />
          ) : (
            <div className="panel">
              <table className="crm-table inv-table" dir="rtl">
                <caption className="muted">المعادلة لكل بند: source(4dp) = journal(2dp) + residual</caption>
                <thead>
                  <tr>
                    <th scope="col">التاريخ</th>
                    <th scope="col">الفرع</th>
                    <th scope="col">نوع الحدث</th>
                    <th scope="col">المصدر (4dp)</th>
                    <th scope="col">القيد (2dp)</th>
                    <th scope="col">الفرق (4dp)</th>
                    <th scope="col">الحالة</th>
                  </tr>
                </thead>
                <tbody>
                  {residuals.items.map((item) => (
                    <tr key={item.id}>
                      <td className="mono acc-num">{item.entry_date}</td>
                      <td>{item.branch_id ? branchNames.get(item.branch_id) ?? item.branch_id : "—"}</td>
                      <td className="mono">{item.event_type}</td>
                      <td className="mono acc-num">{item.source_amount}</td>
                      <td className="mono acc-num">{item.journal_amount}</td>
                      <td className="mono acc-num">{item.residual_amount}</td>
                      <td>
                        {item.status === "open" && <Badge tone="warning">مفتوح</Badge>}
                        {item.status === "settled" && <Badge tone="success">مُسوّى</Badge>}
                        {item.status === "reversed" && <Badge tone="neutral">معكوس</Badge>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="panel">
            <table className="crm-table inv-table" dir="rtl">
              <caption className="muted">سجل قيود التسوية السابقة وعكوسها</caption>
              <thead>
                <tr>
                  <th scope="col">تاريخ القيد</th>
                  <th scope="col">الفرع</th>
                  <th scope="col">الوصف</th>
                  <th scope="col">عرض</th>
                </tr>
              </thead>
              <tbody>
                {history.map((entry) => (
                  <tr key={entry.id}>
                    <td className="mono acc-num">{entry.entry_date}</td>
                    <td>{entry.branch_id ? branchNames.get(entry.branch_id) ?? entry.branch_id : "—"}</td>
                    <td>
                      {entry.description}
                      {entry.reversal_of_entry_id && <> <Badge tone="warning">قيد عكسي</Badge></>}
                    </td>
                    <td>
                      <Button onClick={() => onOpenJournal(entry.id)}>عرض</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!history.length && <div className="empty">لا تسويات سابقة</div>}
          </div>
        </>
      )}

      <Modal
        open={executing}
        onClose={() => setExecuting(false)}
        title="تنفيذ تسوية فروق التقريب"
        footer={
          <div className="inv-actions">
            <Button variant="danger" onClick={runSettle} disabled={busy || !entryDate}>تأكيد التنفيذ</Button>
            <Button onClick={() => setExecuting(false)}>إغلاق</Button>
          </div>
        }
      >
        <div className="stack">
          <p className="muted">
            المعاينة: ستُسوّى البنود المفتوحة ضمن الفلاتر الحالية (الإجماليات أعلاه من الخادم)، بقيد متوازن
            لكل فرع إلى حساب التقريب — الاتجاه حسب إشارة المجموع. المجموعات الأقل من نصف قرش تُمتص بلا قيد.
          </p>
          <FormField label="تاريخ قيد التسوية">
            <TextInput type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} />
          </FormField>
          <FormField label="مفتاح Idempotency" hint="يمنع التكرار عند إعادة الإرسال">
            <TextInput value={idempotencyKey} onChange={(e) => setIdempotencyKey(e.target.value)} dir="ltr" />
          </FormField>
          {result && (
            <div className="panel">
              <p>
                النتيجة: سُوّي <b>{result.settled_count}</b> بندًا بإجمالي{" "}
                <span className="mono acc-num">{result.total_residual}</span>
              </p>
              {result.journal_entries.map((entry) => (
                <p key={entry.id}>
                  قيد <span className="mono acc-num">{entry.amount}</span>{" "}
                  {entry.branch_id ? `(${branchNames.get(entry.branch_id) ?? entry.branch_id})` : ""}{" "}
                  <Button onClick={() => { setExecuting(false); onOpenJournal(entry.id); }}>عرض القيد</Button>
                </p>
              ))}
              {result.absorbed_branches.length > 0 && (
                <p className="muted">مجموعات امتُصّت بلا قيد (أقل من نصف قرش): {result.absorbed_branches.length}</p>
              )}
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
