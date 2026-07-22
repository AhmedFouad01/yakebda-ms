import { useCallback, useEffect, useState } from "react";
import {
  Button,
  EmptyState,
  ErrorState,
  FormField,
  LoadingState,
  Select,
  StatusChip,
  TextInput,
} from "../../../components/ui/primitives";
import { downloadCsv, fetchPeriods, fetchTrialBalance, type TrialBalanceFilters } from "../accountingApi";
import { ACCOUNT_TYPE_LABELS, type AccountingPeriod, type BranchRef, type TrialBalanceResponse } from "../accountingTypes";

type LoadState = "loading" | "error" | "ready";

/**
 * شاشة (ز): ميزان المراجعة — FR-282 جزئيًا.
 * الأرصدة والإجماليات والتوازن كلها من الخادم؛ الـCSV يُبنى من نفس السلاسل
 * حرفيًا بلا إعادة حساب.
 */
export function TrialBalanceTab({ branches }: { branches: BranchRef[] }) {
  const [periods, setPeriods] = useState<AccountingPeriod[]>([]);
  const [state, setState] = useState<LoadState>("ready");
  const [error, setError] = useState("");
  const [report, setReport] = useState<TrialBalanceResponse | null>(null);
  const [draft, setDraft] = useState<TrialBalanceFilters>({});

  useEffect(() => {
    fetchPeriods()
      .then((res) => setPeriods(res.data))
      .catch(() => setPeriods([]));
  }, []);

  const load = useCallback(async (filters: TrialBalanceFilters) => {
    setState("loading");
    setError("");
    try {
      setReport(await fetchTrialBalance(filters));
      setState("ready");
    } catch (e: any) {
      setError(e.message ?? "تعذر تحميل ميزان المراجعة");
      setState("error");
    }
  }, []);

  useEffect(() => {
    load({});
  }, [load]);

  const exportCsv = () => {
    if (!report) return;
    downloadCsv(
      "trial-balance.csv",
      ["code", "name", "type", "debit", "credit"],
      [
        ...report.data.map((row) => [row.code, row.name_ar, row.account_type, row.debit, row.credit]),
        ["", "الإجمالي", "", report.totals.debit, report.totals.credit],
        ["", "residual المفتوح (4dp)", "", report.residual_balance, ""],
      ]
    );
  };

  return (
    <div className="stack">
      <div className="inv-toolbar">
        <FormField label="الفترة" hint="اختيار فترة يتجاهل نطاق التواريخ">
          <Select
            value={draft.period_id ?? ""}
            onChange={(e) => setDraft((d) => ({ ...d, period_id: e.target.value || undefined }))}
            aria-label="اختيار الفترة"
          >
            <option value="">بدون فترة محددة</option>
            {periods.map((period) => (
              <option key={period.id} value={period.id}>
                {period.starts_on} ← {period.ends_on} ({period.status === "locked" ? "مقفولة" : "مفتوحة"})
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="الفرع">
          <Select
            value={draft.branch_id ?? ""}
            onChange={(e) => setDraft((d) => ({ ...d, branch_id: e.target.value || undefined }))}
            aria-label="اختيار الفرع"
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
        <FormField label="حتى تاريخ">
          <TextInput type="date" value={draft.through ?? ""} onChange={(e) => setDraft((d) => ({ ...d, through: e.target.value || undefined }))} />
        </FormField>
        <Button variant="primary" onClick={() => load(draft)}>عرض الميزان</Button>
        <Button onClick={exportCsv} disabled={!report || state !== "ready"}>تصدير CSV</Button>
      </div>

      {state === "loading" && <LoadingState label="جارٍ تحميل الميزان…" />}
      {state === "error" && <ErrorState message={error} onRetry={() => load(draft)} />}
      {state === "ready" && report && (
        <>
          <div className="inv-actions">
            {report.balanced ? (
              <StatusChip tone="success">
                متوازن — مدين {report.totals.debit} = دائن {report.totals.credit}
              </StatusChip>
            ) : (
              <StatusChip tone="danger">غير متوازن — راجع الخادم فورًا</StatusChip>
            )}
            <StatusChip tone={report.residual_balance === "0.0000" ? "success" : "warning"}>
              residual مفتوح: {report.residual_balance}
            </StatusChip>
          </div>

          {!report.data.length ? (
            <EmptyState message="لا حسابات" />
          ) : (
            <div className="panel">
              <table className="crm-table inv-table" dir="rtl">
                <thead>
                  <tr>
                    <th scope="col">الكود</th>
                    <th scope="col">الحساب</th>
                    <th scope="col">النوع</th>
                    <th scope="col">مدين</th>
                    <th scope="col">دائن</th>
                  </tr>
                </thead>
                <tbody>
                  {report.data.map((row) => (
                    <tr key={row.id}>
                      <td className="mono">{row.code}</td>
                      <td>{row.name_ar}</td>
                      <td>{ACCOUNT_TYPE_LABELS[row.account_type]}</td>
                      <td className="mono acc-num">{row.debit}</td>
                      <td className="mono acc-num">{row.credit}</td>
                    </tr>
                  ))}
                  <tr className="acc-totals-row">
                    <td colSpan={3}>الإجمالي (من الخادم)</td>
                    <td className="mono acc-num">{report.totals.debit}</td>
                    <td className="mono acc-num">{report.totals.credit}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
