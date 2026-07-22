import { useCallback, useEffect, useState } from "react";
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  FormField,
  LoadingState,
  TextInput,
} from "../../../components/ui/primitives";
import { ConfirmDialog, Modal, toast } from "../../../components/ui/overlays";
import { fetchPeriods, fetchResiduals, lockPeriod, openPeriod } from "../accountingApi";
import type { AccountingPeriod, SettlementResult } from "../accountingTypes";

type LoadState = "loading" | "error" | "ready";

/**
 * شاشة (هـ): الفترات — FR-281/293.
 * قبل القفل تُعرض الفروق المفتوحة في النطاق (معاينة من الخادم)؛ القفل نفسه
 * ينفّذ التسوية الآلية ثم يقفل في transaction واحدة — رسالة الخادم هي الحكم.
 */
export function PeriodsTab({ canManage }: { canManage: boolean }) {
  const [state, setState] = useState<LoadState>("loading");
  const [error, setError] = useState("");
  const [periods, setPeriods] = useState<AccountingPeriod[]>([]);
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");
  const [lockPreview, setLockPreview] = useState<{ totalOpen: string; count: number } | null>(null);
  const [lastSettlement, setLastSettlement] = useState<SettlementResult | null>(null);
  const [openTarget, setOpenTarget] = useState<AccountingPeriod | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setState("loading");
    setError("");
    try {
      const res = await fetchPeriods();
      setPeriods(res.data);
      setState("ready");
    } catch (e: any) {
      setError(e.message ?? "تعذر تحميل الفترات");
      setState("error");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const previewLock = async () => {
    if (!startsOn || !endsOn) return;
    setBusy(true);
    try {
      const res = await fetchResiduals({ status: "open", date_from: startsOn, date_to: endsOn });
      setLockPreview({ totalOpen: res.data.total_open, count: res.data.items.length });
    } catch (e: any) {
      toast(e.message ?? "تعذرت معاينة الفروق", "error");
    } finally {
      setBusy(false);
    }
  };

  const runLock = async () => {
    setBusy(true);
    try {
      const res = await lockPeriod({ starts_on: startsOn, ends_on: endsOn });
      setLastSettlement(res.settlement);
      toast("تم قفل الفترة بعد التسوية الآلية");
      setLockPreview(null);
      setStartsOn("");
      setEndsOn("");
      await load();
    } catch (e: any) {
      toast(e.message ?? "رفض الخادم قفل الفترة", "error");
    } finally {
      setBusy(false);
    }
  };

  const runOpen = async () => {
    if (!openTarget) return;
    setBusy(true);
    try {
      await openPeriod(openTarget.id);
      toast("تم فتح الفترة");
      setOpenTarget(null);
      await load();
    } catch (e: any) {
      toast(e.message ?? "تعذر فتح الفترة", "error");
    } finally {
      setBusy(false);
    }
  };

  if (state === "loading") return <LoadingState label="جارٍ تحميل الفترات…" />;
  if (state === "error") return <ErrorState message={error} onRetry={load} />;

  return (
    <div className="stack">
      {canManage && (
        <div className="inv-toolbar">
          <FormField label="بداية الفترة">
            <TextInput type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} />
          </FormField>
          <FormField label="نهاية الفترة">
            <TextInput type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} />
          </FormField>
          <Button variant="primary" onClick={previewLock} disabled={busy || !startsOn || !endsOn}>
            قفل فترة…
          </Button>
        </div>
      )}

      {lastSettlement && (
        <div className="panel">
          <p>
            نتيجة التسوية عند الإقفال: سُوّي <b>{lastSettlement.settled_count}</b> بندًا بإجمالي{" "}
            <span className="mono acc-num">{lastSettlement.total_residual}</span>
            {lastSettlement.journal_entries.length > 0 && (
              <> — قيود التسوية: {lastSettlement.journal_entries.map((entry) => (
                <span key={entry.id} className="mono acc-num"> {entry.amount} </span>
              ))}</>
            )}
          </p>
        </div>
      )}

      {!periods.length ? (
        <EmptyState message="لا فترات محاسبية بعد" />
      ) : (
        <div className="panel">
          <table className="crm-table inv-table" dir="rtl">
            <thead>
              <tr>
                <th scope="col">من</th>
                <th scope="col">إلى</th>
                <th scope="col">الحالة</th>
                <th scope="col">قُفلت في</th>
                {canManage && <th scope="col">إجراء</th>}
              </tr>
            </thead>
            <tbody>
              {periods.map((period) => (
                <tr key={period.id}>
                  <td className="mono acc-num">{period.starts_on}</td>
                  <td className="mono acc-num">{period.ends_on}</td>
                  <td>
                    {period.status === "locked" ? (
                      <Badge tone="danger">مقفولة</Badge>
                    ) : (
                      <Badge tone="success">مفتوحة</Badge>
                    )}
                  </td>
                  <td className="mono acc-num">{period.locked_at ? String(period.locked_at).slice(0, 19).replace("T", " ") : "—"}</td>
                  {canManage && (
                    <td>
                      {period.status === "locked" && (
                        <Button onClick={() => setOpenTarget(period)}>فتح الفترة</Button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={!!lockPreview}
        onClose={() => setLockPreview(null)}
        title={`قفل الفترة ${startsOn} ← ${endsOn}`}
        footer={
          <div className="inv-actions">
            <Button variant="danger" onClick={runLock} disabled={busy}>تأكيد القفل مع التسوية</Button>
            <Button onClick={() => setLockPreview(null)}>إلغاء</Button>
          </div>
        }
      >
        {lockPreview && (
          <div className="stack">
            <p>
              الفروق المفتوحة في النطاق: <b>{lockPreview.count}</b> بندًا بإجمالي{" "}
              <span className="mono acc-num">{lockPreview.totalOpen}</span>
            </p>
            <p className="muted">
              سيُنفَّذ قيد تسوية آلي إلى حساب التقريب بتاريخ الإقفال، ثم يُتحقق أن مجموع الفروق المفتوحة صفر،
              ثم تُقفل الفترة — في transaction واحدة. إذا تعذرت التسوية يرفض الخادم القفل بالكامل.
            </p>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!openTarget}
        title="فتح الفترة"
        message={openTarget ? `سيُعاد فتح الفترة ${openTarget.starts_on} ← ${openTarget.ends_on} للترحيل والعكس. متابعة؟` : ""}
        confirmLabel="فتح الفترة"
        danger
        onConfirm={runOpen}
        onCancel={() => setOpenTarget(null)}
      />
    </div>
  );
}
