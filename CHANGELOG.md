# Changelog

This file records notable engineering changes to YAKEBDA MS.

## Unreleased

### POS and Operations
- Consolidated order submission into a single operational action.
- Added active-shift order history scoped to the current cashier and branch.
- Improved product image handling across POS, menu management, and order history.
- Refined product-card ordering interactions and responsive layout behavior.

### Menu and Product Management
- Added product image upload support.
- Added spreadsheet export, template download, dry-run validation, and confirmed import.
- Expanded product management filters and editing workflows.

### Orders and Kitchen
- Added calculated kitchen metrics.
- Added complete order-detail views with operational timestamps and staff data.
- Improved order and kitchen status presentation.

### Customers and Access Control
- Expanded customer profiles and analytics.
- Added user activation and role assignment management.
- Added role and permission editing with system-role safeguards.

## Initial Platform Foundation

- Established the React/Vite administration and POS application.
- Established the Node.js/TypeScript API and PostgreSQL migration workflow.
- Added authentication, authorization, audit support, menu, orders, kitchen, customers, reports, shifts, and device integration foundations.
