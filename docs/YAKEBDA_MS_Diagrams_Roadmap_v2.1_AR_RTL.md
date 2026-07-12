<div dir="rtl" align="right">

# YAKEBDA MS — Diagrams Roadmap v2.1

**الحالة:** Canonical  
**Baseline:** PR #14 مدموجة في `main`

## Program Sequence

```mermaid
flowchart LR
    BASE["Main baseline"] --> S11["YKMS-11 Sources and Pricing"]
    S11 --> S12["YKMS-12 Channel Menus"]
    S12 --> S13["YKMS-13 Inventory and Recipes"]
    S13 --> S14["YKMS-14 Delivery and Drivers"]
    S14 --> S15["YKMS-15 Finance Control"]
    S15 --> S16["YKMS-16 Accounting and COGS"]
    S16 --> S17["YKMS-17 Online Connectors"]
    S17 --> S18["YKMS-18 e-Receipt"]
```

## Target Architecture

```mermaid
flowchart LR
    UI["POS / Website / Platforms"] --> API["Order API"]
    API --> CTX["Source and Pricing Context"]
    CTX --> SRC["Order Source"]
    CTX --> MENU["Channel Menu"]
    CTX --> PRICE["Pricelist"]
    SRC --> QUOTE["Backend Quote"]
    MENU --> QUOTE
    PRICE --> QUOTE
    CATALOG["Master Catalog"] --> QUOTE
    QUOTE --> ORDERS["Orders and Snapshots"]
    ORDERS --> KDS["KDS"]
    ORDERS --> STOCK["Inventory"]
    ORDERS --> DELIVERY["Delivery"]
    ORDERS --> FINANCE["Finance Control"]
    STOCK --> FINANCE
    DELIVERY --> FINANCE
    FINANCE --> LEDGER["Accounting Bridge"]
```

## Quote Sequence

```mermaid
sequenceDiagram
    participant UI
    participant API
    participant Context
    participant Menu
    participant Pricing

    UI->>API: quote(branch, source, items)
    API->>Context: resolve source/menu/pricelist
    Context->>Menu: validate availability
    Menu-->>Context: eligible items
    Context->>Pricing: resolve deterministic prices
    Pricing-->>API: lines, rules, totals
    API-->>UI: quote and warnings
```

## Source Repricing

```mermaid
stateDiagram-v2
    [*] --> CurrentCart
    CurrentCart --> Requote: change source
    Requote --> Blocked: unavailable or missing price
    Requote --> Review: valid price differences
    Review --> CurrentCart: cancel
    Review --> UpdatedCart: confirm
    UpdatedCart --> OrderSnapshot: submit
```

## Inventory Deduction

```mermaid
sequenceDiagram
    participant Order
    participant Event
    participant Recipe
    participant Stock
    participant Finance

    Order->>Event: authoritative operation
    Event->>Recipe: load recipe snapshot
    Recipe-->>Event: ingredient quantities
    Event->>Stock: idempotent movements
    Stock-->>Finance: valuation-ready event
```

## Delivery Settlement

```mermaid
stateDiagram-v2
    [*] --> Queued
    Queued --> Assigned
    Assigned --> PickedUp
    PickedUp --> Delivered
    PickedUp --> Failed
    Delivered --> AwaitingSettlement
    AwaitingSettlement --> Closed: matched
    AwaitingSettlement --> DifferenceReview: mismatch
    DifferenceReview --> Closed: approved
```

## Finance Flow

```mermaid
sequenceDiagram
    participant Operations
    participant Events
    participant Mapper
    participant Ledger
    participant Reconciliation

    Operations->>Events: append idempotent event
    Events->>Mapper: resolve journal and dimensions
    Mapper->>Ledger: balanced entry
    Ledger->>Reconciliation: expected amount
    Reconciliation->>Ledger: match actual amount
```

## Required Diagrams

| المرحلة | المخططات |
|---|---|
| YKMS-11 | ERD، Quote Sequence، Repricing State |
| YKMS-12 | Publishing، Mapping، Sync |
| YKMS-13 | Inventory ERD، Movement، Deduction |
| YKMS-14 | Dispatch، Driver State، Settlement |
| YKMS-15 | Expense State، Reconciliation |
| YKMS-16 | Posting، Reversal، Backfill |
| YKMS-17 | Adapter، Webhook Retry |
| YKMS-18 | Submission، Retry، Status |

</div>
