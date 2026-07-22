import { useCallback, useEffect, useState } from "react";
import { Badge, Button, ErrorState, LoadingState } from "../../../components/ui/primitives";
import { fetchEvents, fmtTimestamp } from "../accountingApi";
import { STATUS_LABELS, STATUS_TONES, type FinancialEventRow, type FinancialEventStatus } from "../accountingTypes";
import { financialEventTypeLabel } from "../../../lib/labels";

type LoadState = "loading" | "error" | "ready";

interface ExceptionSection {
  status: FinancialEventStatus;
  hint: string;
  actionLabel?: string;
  actionTab?: string;
}

const SECTIONS: ExceptionSection[] = [
  {
    status: "failed",
    hint: "أحداث فشل ترحيلها — راجع الخطأ ثم أعد المحاولة من التفاصيل، أو أضف قاعدة الترحيل الناقصة أولًا.",
    actionLabel: "فتح قواعد الترحيل",
    actionTab: "chart",
  },
  {
    status: "dead",
    hint: "أحداث متوقفة نهائيًا بعد استنفاد المحاولات أو بإيقاف يدوي — يمكن إعادة محاولتها من التفاصيل بعد إصلاح السبب.",
  },
  {
    status: "pending_policy",
    hint: "أحداث بانتظار سياسة (صرف عام/عكس بلا أصل) — تُحل بضبط قاعدة ترحيل مناسبة ثم إعادة المحاولة.",
    actionLabel: "فتح قواعد الترحيل",
    actionTab: "chart",
  },
  {
    status: "deferred_rounding",
    hint: "أحداث تقريب مؤجلة (القيد يقرَّب لصفر) — تُحل ضمن تسوية الفروق أو تلقائيًا عند إقفال الفترة.",
    actionLabel: "فتح تسوية الفروق",
    actionTab: "settlement",
  },
];

/** شاشة (ح): Exceptions Queue — FR-258 الحسابي. مسار حل لكل نوع. */
export function ExceptionsTab({
  onOpenEvent,
  onGoTo,
}: {
  onOpenEvent: (id: string) => void;
  onGoTo: (tab: string) => void;
}) {
  const [state, setState] = useState<LoadState>("loading");
  const [error, setError] = useState("");
  const [lists, setLists] = useState<Map<FinancialEventStatus, { rows: FinancialEventRow[]; hasMore: boolean }>>(new Map());

  const load = useCallback(async () => {
    setState("loading");
    setError("");
    try {
      const results = await Promise.all(
        SECTIONS.map((section) => fetchEvents({ status: section.status, limit: "50" }))
      );
      const next = new Map<FinancialEventStatus, { rows: FinancialEventRow[]; hasMore: boolean }>();
      SECTIONS.forEach((section, index) => {
        next.set(section.status, { rows: results[index].data, hasMore: results[index].has_more });
      });
      setLists(next);
      setState("ready");
    } catch (e: any) {
      setError(e.message ?? "تعذر تحميل قائمة الاستثناءات");
      setState("error");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (state === "loading") return <LoadingState label="جارٍ تحميل الاستثناءات…" />;
  if (state === "error") return <ErrorState message={error} onRetry={load} />;

  return (
    <div className="stack">
      {SECTIONS.map((section) => {
        const list = lists.get(section.status);
        const rows = list?.rows ?? [];
        return (
          <div key={section.status} className="panel">
            <div className="inv-actions">
              <Badge tone={STATUS_TONES[section.status]}>
                {STATUS_LABELS[section.status]} — {rows.length}
                {list?.hasMore ? "+" : ""}
              </Badge>
              {section.actionLabel && section.actionTab && (
                <Button onClick={() => onGoTo(section.actionTab!)}>{section.actionLabel}</Button>
              )}
            </div>
            <p className="muted">{section.hint}</p>
            {rows.length > 0 && (
              <table className="crm-table inv-table" dir="rtl">
                <thead>
                  <tr>
                    <th scope="col">التاريخ</th>
                    <th scope="col">نوع الحدث</th>
                    <th scope="col">آخر خطأ</th>
                    <th scope="col">تفاصيل</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((event) => (
                    <tr key={event.id}>
                      <td className="mono acc-num">{fmtTimestamp(event.created_at)}</td>
                      <td>{financialEventTypeLabel(event.event_type)}</td>
                      <td className="acc-truncate" title={event.last_error ?? undefined}>{event.last_error ?? "—"}</td>
                      <td>
                        <Button onClick={() => onOpenEvent(event.id)}>عرض</Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {!rows.length && <div className="empty">لا أحداث في هذا التصنيف</div>}
          </div>
        );
      })}
    </div>
  );
}
