import { useCallback, useEffect, useState } from "react";
import type {
  PaymentMethodReportRow,
  ReportDefinition,
  ReportResponse,
  ReportSummary,
  SalesReportData,
  TopProductReportRow,
} from "@ykms/contracts";
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  FormField,
  LoadingState,
  PageHeader,
  SectionCard,
  Select,
} from "../components/ui/primitives";
import { t } from "../lib/t";
import { paymentMethodLabel } from "../lib/labels";
import { ReportChart } from "./reports/components/ReportChart";
import {
  fetchPaymentMethodsReport,
  fetchReportBranches,
  fetchReportCatalog,
  fetchReportSummary,
  fetchSalesReport,
  fetchTopProductsReport,
  type ReportBranch,
} from "./reports/reportApi";
import {
  formatReportDay,
  formatReportMoney,
  formatReportNumber,
  formatReportTimestamp,
} from "./reports/reportFormat";

interface ReportBundle {
  summary: ReportResponse<ReportSummary>;
  sales: ReportResponse<SalesReportData>;
  topProducts: ReportResponse<TopProductReportRow[]>;
  paymentMethods: ReportResponse<PaymentMethodReportRow[]>;
}

const CATEGORY_AR: Record<ReportDefinition["category"], string> = {
  sales_orders: t.reports.categories.salesOrders,
  products_menu: t.reports.categories.productsMenu,
  shifts_cash: t.reports.categories.shiftsCash,
  customers: t.reports.categories.customers,
  inventory: t.reports.categories.inventory,
  kitchen: t.reports.categories.kitchen,
  finance: t.reports.categories.finance,
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : t.reports.loadError;
}

export function Reports() {
  const [catalog, setCatalog] = useState<ReportDefinition[]>([]);
  const [branches, setBranches] = useState<ReportBranch[]>([]);
  const [draftDays, setDraftDays] = useState(30);
  const [draftBranchId, setDraftBranchId] = useState("");
  const [days, setDays] = useState(30);
  const [branchId, setBranchId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [bundle, setBundle] = useState<ReportBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchReportCatalog(), fetchReportBranches()])
      .then(([catalogResponse, branchResponse]) => {
        if (cancelled) return;
        setCatalog(catalogResponse.data);
        setBranches(branchResponse.data);
      })
      .catch((reason) => {
        if (!cancelled) setError(errorMessage(reason));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const loadReports = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [summary, sales, topProducts, paymentMethods] = await Promise.all([
        fetchReportSummary(branchId),
        fetchSalesReport(days, branchId),
        fetchTopProductsReport(days, branchId),
        fetchPaymentMethodsReport(days, branchId),
      ]);
      setBundle({ summary, sales, topProducts, paymentMethods });
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setLoading(false);
    }
  }, [branchId, days, refreshKey]);

  useEffect(() => {
    void loadReports();
  }, [loadReports]);

  function applyFilters() {
    setDays(draftDays);
    setBranchId(draftBranchId || null);
  }

  const summary = bundle?.summary.data;
  const sales = bundle?.sales.data;
  const topProducts = bundle?.topProducts.data ?? [];
  const paymentMethods = bundle?.paymentMethods.data ?? [];
  const meta = bundle?.sales.meta ?? bundle?.summary.meta;

  return (
    <div dir="rtl" className="rpt-page">
      <PageHeader
        title={t.reports.title}
        subtitle={t.reports.subtitle}
        actions={(
          <Button variant="ghost" onClick={() => setRefreshKey((value) => value + 1)} disabled={loading}>
            {t.reports.refresh}
          </Button>
        )}
      />

      <SectionCard title={t.reports.filters} hint={t.reports.filtersHint}>
        <div className="rpt-filterbar">
          <FormField label={t.reports.period}>
            <Select value={draftDays} onChange={(event) => setDraftDays(Number(event.target.value))}>
              <option value={7}>{t.reports.days7}</option>
              <option value={30}>{t.reports.days30}</option>
              <option value={90}>{t.reports.days90}</option>
            </Select>
          </FormField>
          <FormField label={t.reports.branch}>
            <Select value={draftBranchId} onChange={(event) => setDraftBranchId(event.target.value)}>
              <option value="">{t.reports.allBranches}</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>{branch.name}</option>
              ))}
            </Select>
          </FormField>
          <Button variant="primary" onClick={applyFilters} disabled={loading}>
            {t.reports.apply}
          </Button>
        </div>
      </SectionCard>

      {error && <ErrorState message={error} onRetry={loadReports} />}
      {loading && !bundle && <LoadingState label={t.reports.loading} />}

      {catalog.length > 0 && (
        <section className="rpt-catalog" aria-labelledby="rpt-catalog-title">
          <div className="rpt-section-head">
            <div>
              <h2 id="rpt-catalog-title">{t.reports.catalogTitle}</h2>
              <p>{t.reports.catalogHint}</p>
            </div>
            <Badge tone="brand">{formatReportNumber(catalog.length)} {t.reports.activeReports}</Badge>
          </div>
          <div className="rpt-catalog-grid">
            {catalog.map((definition) => (
              <article key={definition.id} className="rpt-catalog-card">
                <Badge tone="neutral">{CATEGORY_AR[definition.category]}</Badge>
                <h3>{definition.title_ar}</h3>
                <p>{definition.description_ar}</p>
              </article>
            ))}
          </div>
        </section>
      )}

      {summary && (
        <section className="rpt-summary-grid" aria-label={t.reports.operationalSummary}>
          <div className="card"><div className="num">{formatReportMoney(summary.sales_today)}</div><div className="lbl">{t.reports.salesToday}</div></div>
          <div className="card"><div className="num">{formatReportNumber(summary.orders_today)}</div><div className="lbl">{t.reports.ordersToday}</div></div>
          <div className="card"><div className="num">{formatReportNumber(summary.open_orders)}</div><div className="lbl">{t.reports.openOrders}</div></div>
          <div className="card"><div className="num">{formatReportNumber(summary.kitchen_pending)}</div><div className="lbl">{t.reports.kitchenPending}</div></div>
          <div className="card"><div className="num">{formatReportNumber(summary.cancelled_today)}</div><div className="lbl">{t.reports.cancelledToday}</div></div>
          <div className="card"><div className="num">{formatReportNumber(summary.open_shifts)}</div><div className="lbl">{t.reports.openShifts}</div></div>
          <div className="card"><div className="num">{formatReportMoney(summary.open_shift_cash_sales)}</div><div className="lbl">{t.reports.openShiftCashSales}</div></div>
        </section>
      )}

      {bundle && (
        <div className="rpt-grid">
          <SectionCard title={t.reports.salesTrend} hint={t.reports.salesTrendHint}>
            {sales?.by_day.length ? (
              <ReportChart
                title={t.reports.salesTrend}
                kind="line"
                rows={sales.by_day.map((row) => ({ label: formatReportDay(row.day), value: row.total }))}
              />
            ) : <EmptyState message={t.reports.noData} />}
          </SectionCard>

          <SectionCard title={t.reports.salesByBranch}>
            {sales?.by_branch.length ? (
              <ReportChart
                title={t.reports.salesByBranch}
                kind="bar"
                rows={sales.by_branch.map((row) => ({ label: row.branch, value: row.total }))}
              />
            ) : <EmptyState message={t.reports.noData} />}
          </SectionCard>

          <SectionCard title={t.reports.salesBySource}>
            {sales?.by_source.length ? (
              <ReportChart
                title={t.reports.salesBySource}
                kind="bar"
                rows={sales.by_source.map((row) => ({ label: row.source, value: row.total }))}
              />
            ) : <EmptyState message={t.reports.noData} />}
          </SectionCard>

          <SectionCard title={t.reports.paymentMethods}>
            {paymentMethods.length ? (
              <div className="rpt-table-wrap">
                <table>
                  <thead><tr><th>{t.reports.paymentMethod}</th><th>{t.reports.count}</th><th>{t.reports.totalSales}</th></tr></thead>
                  <tbody>
                    {paymentMethods.map((row) => (
                      <tr key={row.method}>
                        <td>{paymentMethodLabel(row.method)}</td>
                        <td>{formatReportNumber(row.count)}</td>
                        <td>{formatReportMoney(row.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <EmptyState message={t.reports.noData} />}
          </SectionCard>

          <SectionCard title={t.reports.topProducts}>
            {topProducts.length ? (
              <div className="rpt-table-wrap">
                <table>
                  <thead><tr><th>{t.reports.product}</th><th>{t.reports.qty}</th><th>{t.reports.totalSales}</th></tr></thead>
                  <tbody>
                    {topProducts.map((row) => (
                      <tr key={row.name_ar}>
                        <td>{row.name_ar}</td>
                        <td>{formatReportNumber(row.qty)}</td>
                        <td>{formatReportMoney(row.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <EmptyState message={t.reports.noData} />}
          </SectionCard>
        </div>
      )}

      {meta && (
        <footer className="rpt-meta">
          <span>{t.reports.lastGenerated}: {formatReportTimestamp(meta.generated_at)}</span>
          <span>{t.reports.timezone}: <bdi dir="ltr">{meta.timezone}</bdi></span>
        </footer>
      )}
    </div>
  );
}
