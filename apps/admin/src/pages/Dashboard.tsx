import { useEffect, useState } from "react";
import { t, fmtTime } from "../lib/t";
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
    <>
      <div className="page-head">
        <h1>
          <img src={brand.logoPath} alt={brand.nameAr} className="brand-logo" /> {brand.nameAr} — {t.nav.dashboard}
        </h1>
      </div>
      <div className="cards">
        {summary && (
          <>
            <div className="card"><div className="num">{summary.sales_today.toFixed(2)} {t.reports.egp}</div><div className="lbl">{t.reports.salesToday}</div></div>
            <div className="card"><div className="num">{summary.orders_today}</div><div className="lbl">{t.reports.ordersToday}</div></div>
            <div className="card"><div className="num">{summary.open_orders}</div><div className="lbl">{t.reports.openOrders}</div></div>
          </>
        )}
        <div className="card"><div className="num">{branches.data.length}</div><div className="lbl">{t.nav.branches}</div></div>
        <div className="card"><div className="num">{devices.data.length}</div><div className="lbl">{t.nav.devices}</div></div>
        <div className="card"><div className="num">{jobs.data.filter((j: any) => j.status === "pending").length}</div><div className="lbl">مهام طباعة بالانتظار</div></div>
        <div className="card"><div className="num">{audit.data.length}</div><div className="lbl">آخر عمليات مسجلة</div></div>
      </div>
      <div className="panel">
        <table>
          <thead>
            <tr><th>{t.audit.action}</th><th>{t.audit.user}</th><th>{t.audit.branch}</th><th>{t.audit.time}</th></tr>
          </thead>
          <tbody>
            {audit.data.slice(0, 8).map((a: any) => (
              <tr key={a.id}>
                <td>{a.action}</td>
                <td>{a.user_name ?? "—"}</td>
                <td>{a.branch_name ?? "—"}</td>
                <td>{fmtTime(a.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {audit.data.length === 0 && <div className="empty">{t.common.empty}</div>}
      </div>
    </>
  );
}
