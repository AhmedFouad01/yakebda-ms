import { useCallback, useEffect, useState } from "react";
import type {
  PaymentMethodReportRow,
  ReportDefinition,
  ReportResponse,
  ReportSummary,
  SalesByBranchReportData,
  SalesBySourceReportData,
  SalesTrendReportData,
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
import { reportTranslations as t } from "./reports/reportTranslations";
import { ReportChart } from "./reports/components/ReportChart";
import {
  fetchPaymentMethodsReport,
  fetchReportBranches,
  fetchReportCatalog,
  fetchReportSummary,
  fetchSalesByBranchReport,
  fetchSalesBySourceReport,
  fetchSalesTrendReport,
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
  trend: ReportResponse<SalesTrendReportData>;
  byBranch: ReportResponse<SalesByBranchReportData>;
  bySource: ReportResponse<SalesBySourceReportData>;
  topProducts: ReportResponse<TopProductReportRow[]>;
  paymentMethods: ReportResponse<PaymentMethodReportRow[]>;
}

type ReportKey = keyof ReportBundle;
type PartialReportBundle = Partial<ReportBundle>;
type ReportErrors = Partial<Record<ReportKey, string>>;

const PAYMENT_AR: Record<string, string> = {
  cash: t.pos.cash,
  card: t.pos.card,
  wallet: t.pos.wallet,
};

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
  const [bootstrapLoading, setBootstrapLoading] = useState(true);
  const [bootstrapError, setBootstrapError] = useState("");
  const [draftDays, setDraftDays] = useState(30);
  const [draftBranchId, setDraftBranchId] = useState("");
  const [days, setDays] = useState(30);
  const [branchId, setBranchId] = useState<string | null>(null);
  const [runNonce, setRunNonce] = useState(0);
  const [bundle, setBundle] = useState<PartialReportBundle>({});
  const [reportErrors, setReportErrors] = useState<ReportErrors>({});
  const [reportsLoading, setReportsLoading] = useState(true);

  const loadBootstrap = useCallback(async () => {
    setBootstrapLoading(true);
    setBootstrapError("");
    try {
      const [catalogResponse, branchResponse] = await Promise.all([
        fetchReportCatalog(),
        fetchReportBranches(),
      ]);
      setCatalog(catalogResponse.data);
      setBranches(branchResponse.data);
    } catch (reason) {
      setCatalog([]);
      setBranches([]);
      setBootstrapError(errorMessage(reason));
    } finally {
      setBootstrapLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadBootstrap();
  }, [loadBootstrap]);

  const loadReports = useCallback(async () => {
    setReportsLoading(true);
    setBundle({});
    setReportErrors({});

    const requests: Array<[ReportKey, Promise<ReportBundle[ReportKey]>]> = [
      ["summary", fetchReportSummary(branchId)],
      ["trend", fetchSalesTrendReport(days, branchId)],
      ["byBranch", fetchSalesByBranchReport(days, branchId)],
      ["bySource", fetchSalesBySourceReport(days, branchId)],
      ["topProducts", fetchTopProductsReport(days, branchId)],
      ["paymentMethods", fetchPaymentMethodsReport(days, branchId)],
    ];

    const settled = await Promise.allSettled(requests.map(([, promise]) => promise));
    const nextBundle: PartialReportBundle = {};
    const nextErrors: ReportErrors = {};

    settled.forEach((result, index) => {
      const [key] = requests[index];
      if (result.status === "fulfilled") {
        nextBundle[key] = result.value as never;
      } else {
        nextErrors[key] = errorMessage(result.reason);
      }
    });

    setBundle(nextBundle);
    setReportErrors(nextErrors);
    setReportsLoading(false);
  }, [branchId, days, runNonce]);

  useEffect(() => {
    void loadReports();
  }, [loadReports]);

  function applyFilters() {
    setDays(draftDays);
    setBranchId(draftBranchId || null);
    setRunNonce((value) => value + 1);
  }

  const summary = bundle.summary?.data;
  const trend = bundle.trend?.data.rows ?? [];
  const byBranch = bundle.byBranch?.data.rows ?? [];
  const bySource = bundle.bySource?.data.rows ?? [];
  const topProducts = bundle.topProducts?.data ?? [];
  const paymentMethods = bundle.paymentMethods?.data ?? [];
  const meta = bundle.trend?.meta
    ?? bundle.summary?.meta
    ?? bundle.byBranch?.meta
    ?? bundle.bySource?.meta
    ?? bundle.topProducts?.meta
    ?? bundle.paymentMethods?.meta;

  return (
    <div dir="rtl" className="rpt-page">
      <PageHeader
        title={t.reports.title}
        subtitle={t.reports.subtitle}
        actions={(
          <Button
            variant="ghost"
            onClick={() => setRunNonce((value) => value + 1)}
            disabled={reportsLoading}
          >
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
            <Select
              value={draftBranchId}
              onChange={(event) => setDraftBranchId(event.target.value)}
              disabled={bootstrapLoading || Boolean(bootstrapError)}
            >
              <option value="">{t.reports.allBranches}</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>{branch.name}</option>
              ))}
            </Select>
          </FormField>
          <Button variant="primary" onClick={applyFilters} disabled={reportsLoading || bootstrapLoading}>
            {t.reports.apply}
          </Button>
        </div>
      </SectionCard>

      {bootstrapError && <ErrorState message={bootstrapError} onRetry={loadBootstrap} />}
      {bootstrapLoading && <LoadingState label={t.reports.loadingCatalog} />}
      {reportsLoading && <LoadingState label={t.reports.loading} />}

      {!bootstrapLoading && !bootstrapError && catalog.length > 0 && (
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

      {reportErrors.summary && (
        <ErrorState message={`${t.reports.operationalSummary}: ${reportErrors.summary}`} onRetry={loadReports} />
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

      <div className="rpt-grid">
        <SectionCard title={t.reports.salesTrend} hint={t.reports.salesTrendHint}>
          {reportErrors.trend ? (
            <ErrorState message={reportErrors.trend} onRetry={loadReports} />
          ) : trend.length ? (
            <ReportChart
              title={t.reports.salesTrend}
              kind="line"
              rows={trend.map((row) => ({ label: formatReportDay(row.day), value: row.total }))}
            />
          ) : !reportsLoading ? <EmptyState message={t.reports.noData} /> : null}
        </SectionCard>

        <SectionCard title={t.reports.salesByBranch}>
          {reportErrors.byBranch ? (
            <ErrorState message={reportErrors.byBranch} onRetry={loadReports} />
          ) : byBranch.length ? (
            <ReportChart
              title={t.reports.salesByBranch}
              kind="bar"
              rows={byBranch.map((row) => ({ label: row.branch, value: row.total }))}
            />
          ) : !reportsLoading ? <EmptyState message={t.reports.noData} /> : null}
        </SectionCard>

        <SectionCard title={t.reports.salesBySource}>
          {reportErrors.bySource ? (
            <ErrorState message={reportErrors.bySource} onRetry={loadReports} />
          ) : bySource.length ? (
            <ReportChart
              title={t.reports.salesBySource}
              kind="bar"
              rows={bySource.map((row) => ({ label: row.source, value: row.total }))}
            />
          ) : !reportsLoading ? <EmptyState message={t.reports.noData} /> : null}
        </SectionCard>

        <SectionCard title={t.reports.paymentMethods}>
          {reportErrors.paymentMethods ? (
            <ErrorState message={reportErrors.paymentMethods} onRetry={loadReports} />
          ) : paymentMethods.length ? (
            <div className="rpt-table-wrap">
              <table>
                <thead><tr><th>{t.reports.paymentMethod}</th><th>{t.reports.count}</th><th>{t.reports.totalSales}</th></tr></thead>
                <tbody>
                  {paymentMethods.map((row) => (
                    <tr key={row.method}>
                      <td>{PAYMENT_AR[row.method] ?? row.method}</td>
                      <td>{formatReportNumber(row.count)}</td>
                      <td>{formatReportMoney(row.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : !reportsLoading ? <EmptyState message={t.reports.noData} /> : null}
        </SectionCard>

        <SectionCard title={t.reports.topProducts} hint={t.reports.topProductsGrossHint}>
          {reportErrors.topProducts ? (
            <ErrorState message={reportErrors.topProducts} onRetry={loadReports} />
          ) : topProducts.length ? (
            <div className="rpt-table-wrap">
              <table>
                <thead><tr><th>{t.reports.product}</th><th>{t.reports.qty}</th><th>{t.reports.grossItemSales}</th></tr></thead>
                <tbody>
                  {topProducts.map((row) => (
                    <tr key={row.product_id}>
                      <td>{row.name_ar}</td>
                      <td>{formatReportNumber(row.qty)}</td>
                      <td>{formatReportMoney(row.gross_item_sales)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : !reportsLoading ? <EmptyState message={t.reports.noData} /> : null}
        </SectionCard>
      </div>

      {meta && (
        <footer className="rpt-meta">
          <span>{t.reports.lastGenerated}: {formatReportTimestamp(meta.generated_at, meta.timezone)}</span>
          <span>{t.reports.timezone}: <bdi dir="ltr">{meta.timezone}</bdi></span>
          <span>{t.reports.timezonePolicy}: {meta.timezone_policy === "branch" ? t.reports.branchTimezone : t.reports.accountDefaultTimezone}</span>
          <span>{t.reports.requestId}: <bdi dir="ltr">{meta.request_id}</bdi></span>
        </footer>
      )}
    </div>
  );
}
