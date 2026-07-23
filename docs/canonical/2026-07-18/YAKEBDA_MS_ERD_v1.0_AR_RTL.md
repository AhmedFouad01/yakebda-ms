<div dir="rtl" align="right">

# YAKEBDA MS — Entity Relationship Diagrams v1.0

**التاريخ:** 2026-07-18  
**الحالة:** Canonical schema map based on migrations 001–027  
**ملاحظة:** الأعمدة المعروضة مختارة لفهم العلاقات، وليست dump كامل.

## 1. Identity / RBAC / Devices

```mermaid
erDiagram
    ACCOUNTS ||--o{ BRANCHES : owns
    ACCOUNTS ||--o{ USERS : owns
    ACCOUNTS ||--o{ ROLES : defines
    USERS ||--o{ USER_ROLES : assigned
    ROLES ||--o{ USER_ROLES : includes
    ROLES ||--o{ ROLE_PERMISSIONS : grants
    PERMISSIONS ||--o{ ROLE_PERMISSIONS : catalogs
    ACCOUNTS ||--o{ DEVICES : owns
    BRANCHES ||--o{ DEVICES : hosts
    DEVICES ||--o{ DEVICE_PROFILES : configured_by
    BRANCHES ||--o{ HARDWARE_ENDPOINTS : has
    DEVICES o|--o{ HARDWARE_ENDPOINTS : bridges
    HARDWARE_ENDPOINTS ||--o{ PRINT_JOBS : receives
    ACCOUNTS ||--o{ API_CLIENTS : owns
    API_CLIENTS ||--o{ API_TOKENS : authenticates
    ACCOUNTS ||--o{ AUDIT_LOGS : records
```

## 2. Catalog / Sources / Orders

```mermaid
erDiagram
    ACCOUNTS ||--o{ CATEGORIES : owns
    CATEGORIES ||--o{ PRODUCTS : contains
    PRODUCTS ||--o{ PRODUCT_VARIANTS : has
    PRODUCTS ||--o{ PRODUCT_MODIFIER_GROUPS : binds
    MODIFIER_GROUPS ||--o{ PRODUCT_MODIFIER_GROUPS : assigned
    MODIFIER_GROUPS ||--o{ MODIFIERS : contains
    BRANCHES ||--o{ BRANCH_PRODUCT_PRICES : overrides
    PRODUCTS ||--o{ BRANCH_PRODUCT_PRICES : priced
    BRANCHES ||--o{ BRANCH_PRODUCT_AVAILABILITY : controls
    PRODUCTS ||--o{ BRANCH_PRODUCT_AVAILABILITY : available
    ACCOUNTS ||--o{ ORDER_SOURCES : defines
    ORDER_SOURCES ||--o{ SOURCE_PRODUCT_RULES : controls
    PRODUCTS ||--o{ SOURCE_PRODUCT_RULES : targeted
    ACCOUNTS ||--o{ CUSTOMERS : owns
    BRANCHES ||--o{ ORDERS : receives
    CUSTOMERS o|--o{ ORDERS : places
    ORDER_SOURCES o|--o{ ORDERS : originates
    ORDERS ||--|{ ORDER_ITEMS : contains
    PRODUCTS ||--o{ ORDER_ITEMS : snapshot_of
    PRODUCT_VARIANTS o|--o{ ORDER_ITEMS : variant
    ORDER_ITEMS ||--o{ ORDER_ITEM_MODIFIERS : contains
    MODIFIERS ||--o{ ORDER_ITEM_MODIFIERS : snapshot_of
    ORDERS ||--o{ ORDER_STATUS_HISTORY : transitions
    ORDERS ||--o{ PAYMENTS : paid_by
    SHIFTS o|--o{ PAYMENTS : captures
```

## 3. Shifts / Delivery Light / Kitchen

```mermaid
erDiagram
    ACCOUNTS ||--o{ SHIFTS : owns
    BRANCHES ||--o{ SHIFTS : runs
    USERS ||--o{ SHIFTS : cashier
    SHIFTS ||--o{ SHIFT_CASH_MOVEMENTS : contains
    ACCOUNTS ||--o{ DELIVERY_ZONES : defines
    ACCOUNTS ||--o{ DRIVERS : employs
    DRIVERS o|--o{ ORDERS : assigned
    BRANCHES ||--o| KITCHEN_BRANCH_STATES : state
    ORDERS ||--o{ KITCHEN_ORDER_HOLDS : hold_history
    USERS ||--o{ KITCHEN_ORDER_HOLDS : acts
```

## 4. Inventory

```mermaid
erDiagram
    ACCOUNTS ||--o{ INVENTORY_LOCATIONS : owns
    BRANCHES ||--o{ INVENTORY_LOCATIONS : hosts
    ACCOUNTS ||--o{ INVENTORY_UNITS : defines
    INVENTORY_UNITS ||--o{ INVENTORY_UNIT_CONVERSIONS : from_unit
    INVENTORY_UNITS ||--o{ INVENTORY_UNIT_CONVERSIONS : to_unit
    ACCOUNTS ||--o{ INVENTORY_ITEMS : owns
    INVENTORY_UNITS ||--o{ INVENTORY_ITEMS : base_unit
    ACCOUNTS ||--o{ INVENTORY_SUPPLIERS : owns
    INVENTORY_LOCATIONS ||--o{ STOCK_MOVEMENTS : ledger
    INVENTORY_ITEMS ||--o{ STOCK_MOVEMENTS : moves
    INVENTORY_SUPPLIERS o|--o{ STOCK_MOVEMENTS : supplies
    STOCK_MOVEMENTS o|--o{ STOCK_MOVEMENTS : reverses
    PRODUCTS ||--o{ INVENTORY_RECIPES : recipe_for
    PRODUCT_VARIANTS o|--o{ INVENTORY_RECIPES : variant_recipe
    INVENTORY_RECIPES ||--|{ INVENTORY_RECIPE_ITEMS : contains
    INVENTORY_ITEMS ||--o{ INVENTORY_RECIPE_ITEMS : ingredient
    ORDERS ||--o{ INVENTORY_CONSUMPTION_EVENTS : creates
    INVENTORY_CONSUMPTION_EVENTS ||--|{ INVENTORY_CONSUMPTION_EVENT_ITEMS : snapshots
    STOCK_MOVEMENTS o|--o{ INVENTORY_CONSUMPTION_EVENT_ITEMS : materializes
    INVENTORY_LOCATIONS ||--o{ INVENTORY_STOCK_COUNTS : counted_at
    INVENTORY_ITEMS ||--o{ INVENTORY_STOCK_COUNTS : counted
    STOCK_MOVEMENTS o|--o{ INVENTORY_STOCK_COUNTS : adjustment
```

## 5. Accounting

```mermaid
erDiagram
    ACCOUNTS ||--o{ FINANCIAL_EVENTS : owns
    BRANCHES o|--o{ FINANCIAL_EVENTS : scopes
    FINANCIAL_EVENTS o|--o| JOURNAL_ENTRIES : posts
    FINANCIAL_EVENTS ||--o| FINANCIAL_EVENT_RECONCILIATIONS : reconciles
    ACCOUNTS ||--o{ ACCOUNTING_ACCOUNTS : chart
    ACCOUNTS ||--o{ ACCOUNTING_MAPPINGS : maps
    ACCOUNTING_ACCOUNTS ||--o{ ACCOUNTING_MAPPINGS : debit
    ACCOUNTING_ACCOUNTS ||--o{ ACCOUNTING_MAPPINGS : credit
    ACCOUNTS ||--o{ ACCOUNTING_PERIODS : closes
    ACCOUNTS ||--o{ JOURNAL_ENTRIES : owns
    JOURNAL_ENTRIES ||--|{ JOURNAL_LINES : contains
    ACCOUNTING_ACCOUNTS ||--o{ JOURNAL_LINES : posted_to
    JOURNAL_ENTRIES o|--o| JOURNAL_ENTRIES : reverses
    FINANCIAL_EVENT_RECONCILIATIONS o|--o| FINANCIAL_EVENT_RECONCILIATIONS : reverses
```

## 6. Core Entity Dictionary

| Entity | Authority | Mutability |
|---|---|---|
| `orders` | operational order aggregate | status transitions controlled |
| `order_items` | sale snapshot | historical |
| `payments` | tender events | offset by refunds، not rewrite |
| `stock_movements` | stock quantity/value ledger | append-only |
| `inventory_recipes` | versioned recipe | draft/active/retired; old versions retained |
| `inventory_consumption_events` | durable completion/reversal snapshot | retry state; payload immutable logically |
| `financial_events` | accounting outbox | payload immutable; status transitions |
| `journal_entries/lines` | posted accounting evidence | immutable; reversal only |
| `financial_event_reconciliations` | sub-cent evidence | lineage/settlement governed |
| `audit_logs` | security/operational evidence | append-only expectation |

## 7. Current vs Target Schema

### موجود فعليًا

كل الكيانات في المخططات السابقة موجودة ضمن migrations 001–027.

### Target entities غير موجودة بعد

```text
channel_menus
channel_menu_versions
channel_menu_items
external_product_mappings
price_lists
price_list_rules
source_settlement_rules

delivery_jobs
driver_assignments
driver_cash_custody
driver_settlements

expense_categories
expenses
payment_reconciliations
source_settlements
daily_finance_closes

accounting_exports
compliance_submissions
webhook_deliveries
```

لا تُرسم target entities كأنها موجودة في قاعدة الإنتاج.

## 8. Schema Integrity Notes

- بعض العلاقات التاريخية بدأت بـFKs بسيطة؛ migration 026 أضاف composite account/branch integrity في المسارات المالية والمخزنية الحرجة.
- source product rules الحالية ليست full pricelist model.
- delivery `drivers`/`delivery_zones` هي light primitives، ليست delivery job ledger.
- reporting registry الحالي في Draft #44 code-owned وليس table-driven.
- unit conversions لا يوجد لها GET endpoint في Draft #43 رغم وجود الجدول.

## 9. Upgrade Boundary

هذا ERD يصف schema canonical fresh 001–027. لا يثبت توافق partial legacy 019. ذلك baseline ملغى من النطاق الحالي ويحتاج قرار دعم منفصل لو أعيد فتحه.

</div>
