<div dir="rtl" align="right">

# YAKEBDA MS — Diagrams Roadmap v2 AR/RTL

**التاريخ:** 2026-07-12  
**الحالة:** Canonical Architecture Diagrams  
**المصدر:** Mermaid داخل GitHub

---

## 1. Target Architecture

```mermaid
flowchart LR
    POS["POS / Phone Order"] --> OrderAPI["Order API"]
    Website["Website / QR"] --> PublicAPI["Public API"]
    Platforms["Delivery Platforms"] --> Adapters["Channel Adapters"]
    PublicAPI --> OrderAPI
    Adapters --> OrderAPI

    OrderAPI --> Context["Order Context Resolver"]
    Context --> Source["Order Source"]
    Context --> ChannelMenu["Channel Menu"]
    Context --> Pricelist["Pricelist"]
    Source --> Quote["Quote Service"]
    ChannelMenu --> Quote
    Pricelist --> Quote
    Catalog["Master Catalog"] --> Quote

    Quote --> Orders[("Orders + Price Snapshots")]
    Orders --> KDS["KDS"]
    Orders --> Inventory["Inventory / Recipes"]
    Orders --> Delivery["Dispatch / Drivers"]
    Orders --> Finance["Finance Control"]

    Inventory --> Finance
    Delivery --> Finance
    Finance --> Ledger["Accounting Bridge / Ledger"]
    Ledger --> ExternalAccounting["External Accounting Adapter"]
    OrderAPI --> Audit["Audit Log"]
```

---

## 2. Program Roadmap

```mermaid
flowchart LR
    G0["Gate 0: Merge PR #14"] --> M11["YKMS-11 Sources & Pricing"]
    M11 --> M12["YKMS-12 Channel Menus"]
    M12 --> M13["YKMS-13 Inventory & Recipes"]
    M13 --> M14["YKMS-14 Delivery & Drivers"]
    M14 --> M15["YKMS-15 Finance Control"]
    M15 --> M16["YKMS-16 Accounting Bridge & COGS"]
    M16 --> M17["YKMS-17 Online Connectors"]
    M17 --> M18["YKMS-18 e-Receipt"]
```

---

## 3. Core ERD

```mermaid
erDiagram
    ACCOUNT ||--o{ BRANCH : owns
    ACCOUNT ||--o{ ORDER_SOURCE : defines
    ORDER_SOURCE ||--o{ SOURCE_BRANCH_CONFIG : configures
    BRANCH ||--o{ SOURCE_BRANCH_CONFIG : enables

    ORDER_SOURCE ||--o{ CHANNEL_MENU : publishes
    CHANNEL_MENU ||--o{ CHANNEL_MENU_ITEM : contains
    PRODUCT ||--o{ CHANNEL_MENU_ITEM : maps
    PRODUCT ||--o{ PRODUCT_VARIANT : has

    PRICE_LIST ||--o{ PRICE_LIST_RULE : contains
    ORDER_SOURCE ||--o{ PRICE_LIST : uses
    BRANCH ||--o{ PRICE_LIST : scopes
    PRODUCT ||--o{ PRICE_LIST_RULE : targets
    PRODUCT_VARIANT ||--o{ PRICE_LIST_RULE : targets

    ORDER_SOURCE ||--o{ ORDER : originates
    CHANNEL_MENU ||--o{ ORDER : snapshots
    PRICE_LIST ||--o{ ORDER : snapshots
    ORDER ||--o{ ORDER_ITEM : contains

    PRODUCT ||--o{ RECIPE : produces
    RECIPE ||--o{ RECIPE_ITEM : contains
    INVENTORY_ITEM ||--o{ RECIPE_ITEM : consumes
    INVENTORY_ITEM ||--o{ STOCK_MOVEMENT : moves
    ORDER ||--o{ STOCK_MOVEMENT : triggers

    ORDER ||--o| DELIVERY_JOB : requires
    DRIVER ||--o{ DRIVER_ASSIGNMENT : receives
    DELIVERY_JOB ||--o{ DRIVER_ASSIGNMENT : tracks
    DRIVER ||--o{ DRIVER_SETTLEMENT : settles

    ORDER ||--o{ FINANCIAL_EVENT : emits
    PAYMENT ||--o{ FINANCIAL_EVENT : emits
    EXPENSE ||--o{ FINANCIAL_EVENT : emits
    FINANCIAL_EVENT ||--o{ JOURNAL_ENTRY : posts
    JOURNAL_ENTRY ||--o{ JOURNAL_LINE : balances
```

---

## 4. Quote Sequence

```mermaid
sequenceDiagram
    participant UI as POS / Website
    participant API as Order API
    participant Context as Context Resolver
    participant Menu as Channel Menu
    participant Pricing as Pricelist Resolver
    participant Catalog as Master Catalog

    UI->>API: POST /orders/quote (branch, source, items)
    API->>Context: Resolve source/menu/pricelist/time
    Context->>Menu: Validate availability
    Menu-->>Context: Eligible products/options
    Context->>Pricing: Resolve prices by precedence
    Pricing->>Catalog: Read base product/variant/modifier data
    Catalog-->>Pricing: Base data
    Pricing-->>API: Resolved lines + rule IDs
    API-->>UI: Quote totals + warnings + unavailable items
```

---

## 5. Change Source Repricing

```mermaid
stateDiagram-v2
    [*] --> CartWithSourceA
    CartWithSourceA --> Requote: Select Source B
    Requote --> Blocked: Product unavailable or no valid price
    Requote --> ReviewDifference: Valid quote
    ReviewDifference --> CartWithSourceA: Cancel
    ReviewDifference --> CartWithSourceB: Confirm
    CartWithSourceB --> OrderSnapshot: Submit
    OrderSnapshot --> [*]
```

---

## 6. Channel Menu Publishing

```mermaid
flowchart TB
    Draft["Draft Channel Menu"] --> Validate["Validate mappings, prices, availability"]
    Validate --> Errors["Validation Errors"]
    Errors --> Draft
    Validate --> Publish["Publish Version"]
    Publish --> Snapshot["Immutable Published Snapshot"]
    Snapshot --> Website["Website / QR"]
    Snapshot --> PlatformSync["Platform Adapter Sync"]
    PlatformSync --> SyncLog["Sync Log / Exceptions"]
```

---

## 7. Inventory Deduction

```mermaid
sequenceDiagram
    participant Order as Order Service
    participant Outbox as Operational Event
    participant Recipe as Recipe Service
    participant Stock as Stock Ledger
    participant Finance as Finance Events

    Order->>Outbox: order.completed / configured deduction event
    Outbox->>Recipe: Load recipe snapshot
    Recipe-->>Outbox: Required ingredients
    Outbox->>Stock: Create idempotent movements
    Stock-->>Outbox: Movement IDs and valuation
    Outbox->>Finance: Emit COGS-ready event
```

---

## 8. Driver and COD Flow

```mermaid
stateDiagram-v2
    [*] --> Queued
    Queued --> Assigned
    Assigned --> PickedUp
    PickedUp --> Delivered
    PickedUp --> Failed
    Delivered --> AwaitingSettlement: COD internal
    Delivered --> Closed: prepaid/platform collected
    AwaitingSettlement --> Closed: received = expected
    AwaitingSettlement --> DifferenceReview: mismatch
    DifferenceReview --> Closed: approved adjustment
```

---

## 9. Finance Event Flow

```mermaid
sequenceDiagram
    participant Ops as Orders/Payments/Expenses/Stock
    participant Events as Financial Event Outbox
    participant Mapper as Accounting Mapper
    participant Ledger as Journal Service
    participant Recon as Reconciliation
    participant Export as External Adapter

    Ops->>Events: Append idempotent event
    Events->>Mapper: Resolve journal/accounts/dimensions
    Mapper->>Ledger: Draft balanced entry
    Ledger->>Ledger: Validate debit = credit
    Ledger->>Recon: Mark expected amount
    Recon->>Ledger: Match actual settlement
    Ledger->>Export: Export/post when enabled
```

---

## 10. Required Diagrams per Stage

| المرحلة | المخططات الإلزامية |
|---|---|
| YKMS-11 | ERD + Quote Sequence + Repricing State |
| YKMS-12 | Publishing Flow + Mapping ERD + Sync Sequence |
| YKMS-13 | Inventory ERD + Movement State + Deduction Sequence |
| YKMS-14 | Dispatch State + COD Settlement Sequence |
| YKMS-15 | Expense State + Reconciliation Flow |
| YKMS-16 | Financial Event + Journal Posting + Reversal Flow |
| YKMS-17 | Adapter Sequence + Webhook Retry |
| YKMS-18 | e-Receipt Submission/Retry/Status |

</div>
