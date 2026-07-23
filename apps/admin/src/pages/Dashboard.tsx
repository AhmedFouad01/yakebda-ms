import { useEffect, useState } from "react";
import { t, fmtTime } from "../lib/t";
import { auditActionLabel } from "../lib/labels";
import { useList } from "./hooks";
import { api } from "../lib/api";
import { brand } from "../config/brand";
import { useMe } from "../lib/me";

export function Dashboard() {
  const { ready, can } = useMe();
  const [summary, setSummary] = useState<{ sales_today: number; orders_today: number; open_orders: number } | null>(null);
  useEffect(() => {
    // YKMS-02C: لا نطلب التقارير إلا بصلاحيتها — لا ضجيج 403
    if (ready && can("reports.view")) {
      api<{ data: typeof summary }>("/reports/summary").then((r) => setSummary(r.data)).catch(() => {});
    }
  }, [ready]);
  const branches = useList("/branches"); // متاح لأي مستخدم مسجل
  const devices = useList(ready && can("devices.manage") ? "/devices" : null);
  const jobs = useList(ready && (can("print_jobs.manage") || can("print_jobs.create")) ? "/print-jobs" : null);
  const audit = useList(ready && can("audit.view") ? "/audit-logs" : null);

  return (
    <div className="dash-page" dir="rtl">
      <header className="dash-page-head">
        <h1>
          <img src={brand.logoPath} alt="" className="brand-logo" />
          <span>{brand.nameAr} — {t.nav.dashboard}</span>
        </h1>
        <p>{t.dashboard.subtitle}</p>
      </header>

      <dl className="dash-metrics" aria-label={t.dashboard.summary}>
        {summary && (
          <>
            <div className="dash-metric"><dt>{t.reports.salesToday}</dt><dd>{summary.sales_today.toFixed(2)} {t.reports.egp}</dd></div>
            <div className="dash-metric"><dt>{t.reports.ordersToday}</dt><dd>{summary.orders_today}</dd></div>
            <div className="dash-metric"><dt>{t.reports.openOrders}</dt><dd>{summary.open_orders}</dd></div>
          </>
        )}
        <div className="dash-metric"><dt>{t.nav.branches}</dt><dd>{branches.data.length}</dd></div>
        <div className="dash-metric"><dt>{t.nav.devices}</dt><dd>{devices.data.length}</dd></div>
        <div className="dash-metric"><dt>{t.dashboard.pendingPrintJobs}</dt><dd>{jobs.data.filter((j: any) => j.status === "pending").length}</dd></div>
        <div className="dash-metric"><dt>{t.dashboard.recentAudit}</dt><dd>{audit.data.length}</dd></div>
      </dl>

      <section className="dash-audit" aria-labelledby="dash-audit-title">
        <div className="dash-section-head">
          <div>
            <h2 id="dash-audit-title">{t.dashboard.recentAudit}</h2>
            <p>{t.dashboard.recentAuditHint}</p>
          </div>
        </div>
        <div className="dash-table-surface">
          <div className="dash-table-wrap">
            <table>
              <thead>
                <tr><th>{t.audit.action}</th><th>{t.audit.user}</th><th>{t.audit.branch}</th><th>{t.audit.time}</th></tr>
              </thead>
              <tbody>
                {audit.data.slice(0, 8).map((a: any) => (
                  <tr key={a.id}>
                    <td>{auditActionLabel(a.action)}</td>
                    <td>{a.user_name ?? "—"}</td>
                    <td>{a.branch_name ?? "—"}</td>
                    <td>{fmtTime(a.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {audit.data.length === 0 && <div className="dash-empty">{t.common.empty}</div>}
        </div>
      </section>
    </div>
  );
}
