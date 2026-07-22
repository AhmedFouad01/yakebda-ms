# Reporting Foundation API Matrix

| Capability | Endpoint | Required permissions | Scope | Response |
|---|---|---|---|---|
| Active report catalog | `GET /api/v1/reports/catalog` | Catalog is filtered to definitions allowed by the authenticated user | account | `ReportCatalogResponse` |
| Daily operational summary | `GET /api/v1/reports/summary?branch_id=` | `reports.view` | account + allowed branch(s) | `ReportResponse<ReportSummary>` |
| Sales trend | `GET /api/v1/reports/sales/trend?days=&branch_id=` | `reports.view` | account + allowed branch(s) + effective timezone policy | `ReportResponse<SalesTrendReportData>` |
| Sales by branch | `GET /api/v1/reports/sales/by-branch?days=&branch_id=` | `reports.view` | account + allowed branch(s) + effective timezone policy | `ReportResponse<SalesByBranchReportData>` |
| Sales by source snapshot | `GET /api/v1/reports/sales/by-source?days=&branch_id=` | `reports.view` | account + allowed branch(s) + effective timezone policy | `ReportResponse<SalesBySourceReportData>` |
| Gross top products | `GET /api/v1/reports/top-products?days=&branch_id=` | `reports.view` | account + allowed branch(s) + effective timezone policy | `ReportResponse<TopProductReportRow[]>` |
| Collected payment methods | `GET /api/v1/reports/payment-methods?days=&branch_id=` | `reports.view` | account + allowed branch(s) + effective timezone policy | `ReportResponse<PaymentMethodReportRow[]>` |

## Supported periods

The first reporting UI supports `7`, `30` and `90` days only. Other values return validation error `422`.

## Response metadata

Each response includes `ReportResponseMeta`:

- request correlation ID;
- report definition ID;
- query-contract version;
- generated timestamp;
- generating user ID;
- effective timezone;
- timezone policy (`branch` or `account_default`);
- currency;
- effective account and branch IDs;
- effective filters.

This metadata describes one response. It is not a durable/snapshotted Report Run.

## Numeric semantics

- Payment-based reports exclude `unpaid` zero markers.
- Immutable negative refund payment rows reduce collected totals.
- Top-product `gross_item_sales` is the sum of order-item `line_total` for non-cancelled orders and does not claim refund allocation or net collected revenue.
- Null aggregate results become zero; malformed non-numeric aggregate values fail instead of being silently converted to zero.

The API remains authoritative for totals, grouping, permissions and branch scope. React formats and visualizes returned values only.
