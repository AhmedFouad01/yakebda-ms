# Reporting Foundation API Matrix

| Capability | Endpoint | Permission | Scope | Response |
|---|---|---|---|---|
| Active report catalog | `GET /api/v1/reports/catalog` | `reports.view` | authenticated account | `ReportCatalogResponse` |
| Daily operational summary | `GET /api/v1/reports/summary?branch_id=` | `reports.view` | account + allowed branch | `ReportResponse<ReportSummary>` |
| Sales trend, branch and source | `GET /api/v1/reports/sales?days=&branch_id=` | `reports.view` | account + allowed branch + branch timezone | `ReportResponse<SalesReportData>` |
| Top products | `GET /api/v1/reports/top-products?days=&branch_id=` | `reports.view` | account + allowed branch + branch timezone | `ReportResponse<TopProductReportRow[]>` |
| Payment methods | `GET /api/v1/reports/payment-methods?days=&branch_id=` | `reports.view` | account + allowed branch + branch timezone | `ReportResponse<PaymentMethodReportRow[]>` |

## Run metadata

Each report response includes:

- report definition ID;
- generated timestamp;
- effective timezone;
- currency;
- effective period and branch filters.

The API remains the authority for sales totals, grouping and branch scope. The Admin formats and visualizes returned values only.
