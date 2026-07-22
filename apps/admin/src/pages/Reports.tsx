import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { t } from "../lib/t";
import { paymentMethodLabel } from "../lib/labels";

interface Summary {
  sales_today: number;
  orders_today: number;
  open_orders: number;
  kitchen_pending: number;
  cancelled_today: number;
  open_shifts: number;
  open_shift_cash_sales: number;
}

const money = (v: number | string) => `${Number(v).toFixed(2)} ${t.reports.egp}`;

export function Reports() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [top, setTop] = useState<Array<{ name_ar: string; qty: string; total: string }>>([]);
  const [methods, setMethods] = useState<Array<{ method: string; total: string; count: string }>>([]);
  const [byBranch, setByBranch] = useState<Array<{ branch: string; total: string }>>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const [s, tp, m, sales] = await Promise.all([
          api<{ data: Summary }>("/reports/summary"),
          api<{ data: typeof top }>("/reports/top-products"),
          api<{ data: typeof methods }>("/reports/payment-methods"),
          api<{ data: { by_branch: typeof byBranch } }>("/reports/sales?days=30"),
        ]);
        setSummary(s.data);
        setTop(tp.data);
        setMethods(m.data);
        setByBranch(sales.data.by_branch);
      } catch (e: any) {
        setError(e.message);
      }
    })();
  }, []);

  return (
    <div dir="rtl" className="reports-page">
      <div className="page-head"><h1>{t.reports.title}</h1></div>
      {error && <div className="alert">{error}</div>}
      {summary && (
        <div className="report-summary-grid">
          <div className="card"><div className="num">{money(summary.sales_today)}</div><div className="lbl">{t.reports.salesToday}</div></div>
          <div className="card"><div className="num">{summary.orders_today}</div><div className="lbl">{t.reports.ordersToday}</div></div>
          <div className="card"><div className="num">{summary.open_orders}</div><div className="lbl">{t.reports.openOrders}</div></div>
          <div className="card"><div className="num">{summary.kitchen_pending}</div><div className="lbl">{t.reports.kitchenPending}</div></div>
          <div className="card"><div className="num">{summary.cancelled_today}</div><div className="lbl">{t.reports.cancelledToday}</div></div>
          <div className="card"><div className="num">{summary.open_shifts}</div><div className="lbl">{t.reports.openShifts}</div></div>
          <div className="card"><div className="num">{money(summary.open_shift_cash_sales)}</div><div className="lbl">{t.reports.openShiftCashSales}</div></div>
        </div>
      )}
      <div className="report-grid">
        <div className="report-panel">
          <table>
            <thead><tr><th>{t.reports.topProducts}</th><th>{t.reports.qty}</th><th>{t.reports.totalSales}</th></tr></thead>
            <tbody>
              {top.map((r) => (
                <tr key={r.name_ar}><td>{r.name_ar}</td><td>{r.qty}</td><td>{money(r.total)}</td></tr>
              ))}
            </tbody>
          </table>
          {!top.length && <div className="empty">{t.common.empty}</div>}
        </div>
        <div className="report-panel">
          <table>
            <thead><tr><th>{t.reports.paymentMethods}</th><th>{t.reports.count}</th><th>{t.reports.totalSales}</th></tr></thead>
            <tbody>
              {methods.map((r) => (
                <tr key={r.method}><td>{paymentMethodLabel(r.method)}</td><td>{r.count}</td><td>{money(r.total)}</td></tr>
              ))}
            </tbody>
          </table>
          {!methods.length && <div className="empty">{t.common.empty}</div>}
        </div>
        <div className="report-panel">
          <table>
            <thead><tr><th>{t.reports.salesByBranch}</th><th>{t.reports.totalSales}</th></tr></thead>
            <tbody>
              {byBranch.map((r) => (
                <tr key={r.branch}><td>{r.branch}</td><td>{money(r.total)}</td></tr>
              ))}
            </tbody>
          </table>
          {!byBranch.length && <div className="empty">{t.common.empty}</div>}
        </div>
      </div>
    </div>
  );
}
