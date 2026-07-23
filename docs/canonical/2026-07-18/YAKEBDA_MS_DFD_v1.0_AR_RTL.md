<div dir="rtl" align="right">

# YAKEBDA MS — Data Flow Diagrams v1.0

**التاريخ:** 2026-07-18  
**الحالة:** Canonical DFD  
**الترميز:** Mermaid؛ الخطوط المتقطعة = planned/partial

## 1. Context Diagram

```mermaid
flowchart LR
    Owner[المالك/الإدارة] -->|إدارة وتشغيل| YKMS[YAKEBDA MS]
    Cashier[الكاشير] -->|POS/Shift/Payment| YKMS
    Kitchen[المطبخ] -->|KDS/Status/Hold| YKMS
    Inventory[مسؤول المخزون] -->|Master Data/Stock Ops| YKMS
    Accountant[المحاسب] -->|Review/Mapping/Close| YKMS
    Customer[العميل] -.->|Online/QR مستقبلي| YKMS
    Platforms[منصات خارجية] -.->|Orders/Menu/Webhooks| YKMS
    Hardware[Printers/Drawer/Display] <--> |Local Bridge| YKMS
    Tax[ETA/e-Receipt] -.->|Compliance Adapter| YKMS
```

## 2. Level 0 — Major Processes

```mermaid
flowchart TB
    U[Users & External Actors]
    P1((P1 Identity/RBAC))
    P2((P2 Catalog/Pricing))
    P3((P3 Orders/POS))
    P4((P4 Kitchen))
    P5((P5 Payments/Shifts))
    P6((P6 Inventory))
    P7((P7 Financial Events/Accounting))
    P8((P8 Reporting))
    P9((P9 Devices/Printing))
    P10((P10 Delivery/Connectors))

    D1[(Identity & Config DB)]
    D2[(Catalog & Source DB)]
    D3[(Orders & Payments DB)]
    D4[(Inventory Ledger)]
    D5[(Financial Outbox & Journals)]
    D6[(Audit/Integration Logs)]
    D7[(Print Queue)]

    U --> P1 --> D1
    P1 --> P2
    P2 <--> D2
    P2 --> P3
    P3 <--> D3
    P3 --> P4
    P3 --> P5
    P4 <--> D3
    P5 <--> D3
    P3 -->|completed event| P6
    P6 <--> D4
    P5 --> P7
    P6 --> P7
    P7 <--> D5
    D2 --> P8
    D3 --> P8
    D4 --> P8
    D5 --> P8
    P3 --> P9 --> D7
    P4 --> P9
    P1 --> D6
    P2 --> D6
    P3 --> D6
    P4 --> D6
    P5 --> D6
    P6 --> D6
    P7 --> D6
    P10 -.-> P3
```

## 3. Authentication and Scope Flow

```mermaid
sequenceDiagram
    actor User
    participant Admin as Admin/POS UI
    participant API
    participant Auth
    participant DB
    participant Audit

    User->>Admin: Credentials / PIN
    Admin->>API: Login request
    API->>Auth: Validate identity + active state
    Auth->>DB: Load user, roles, permissions, branch
    DB-->>Auth: Scoped identity
    Auth-->>API: JWT + effective permissions
    API->>Audit: login event
    API-->>Admin: Session
    Admin->>API: Operational request
    API->>Auth: Verify token + permission
    API->>DB: Query by account + allowed branch
    DB-->>API: Scoped result
    API-->>Admin: Response
```

## 4. POS Quote and Order Flow

```mermaid
sequenceDiagram
    actor Cashier
    participant POS
    participant Quote as Quote Service
    participant Source as Source Rules
    participant Order as Order Service
    participant Kitchen
    participant DB

    Cashier->>POS: Select branch/source/items
    POS->>Quote: quote(branch, source, cart)
    Quote->>Source: Validate source & availability
    Source-->>Quote: source override / eligibility
    Quote->>DB: branch/base prices + settings
    DB-->>Quote: price context
    Quote-->>POS: authoritative totals
    Cashier->>POS: Submit
    POS->>Order: idempotent create
    Order->>Kitchen: check branch pause
    alt paused
      Kitchen-->>Order: 409 KITCHEN_PAUSED
      Order-->>POS: no side effects
    else active
      Order->>DB: order + snapshots + status
      Order-->>POS: confirmed order
    end
```

## 5. Kitchen Flow

```mermaid
flowchart LR
    O[Submitted Order] --> IK[In Kitchen]
    IK --> H{Held?}
    H -->|Yes| HOLD[Hold Overlay + Reason]
    HOLD --> RESUME[Resume]
    RESUME --> IK
    H -->|No| READY[Ready]
    READY --> COMPLETE[Completed]
    COMPLETE --> INV[Inventory Consumption Event]
    PAUSE[Branch Pause] -->|blocks new submit only| O
```

## 6. Inventory DFD

```mermaid
flowchart TB
    Ops[Inventory Operator]
    Sales[Order Completion]
    Returns[Approved Physical Return]
    P61((Master Data))
    P62((Stock Operations))
    P63((Recipe Snapshot))
    P64((Valuation & Balance))
    P65((Retry/Reversal))
    D61[(Units/Items/Locations/Suppliers)]
    D62[(Recipes/Versions)]
    D63[(Consumption Events)]
    D64[(Append-only Movements)]

    Ops --> P61 <--> D61
    Ops --> P62
    Sales --> P63
    D62 --> P63
    P63 --> D63
    D63 --> P65
    P62 --> D64
    P65 --> D64
    Returns --> P65
    D64 --> P64
    P64 -->|quantity_on_hand/stock_value| Ops
```

### قواعد التدفق

- كل write يحمل idempotency key.
- conversion إلى base unit قبل الحركة.
- issue لا يمر إذا الناتج negative.
- movement لا يُعدل أو يُحذف.
- refund مالي وحده لا يدخل هذا التدفق.

## 7. Financial Event and Accounting DFD

```mermaid
flowchart LR
    Pay[Payments/Refunds]
    Cash[Shift Cash]
    Stock[Inventory Value Events]
    Outbox((Financial Event Capture))
    FE[(financial_events)]
    Map((Mapping/Posting))
    ACC[(accounting_accounts/mappings)]
    JE[(journal_entries/lines)]
    REC[(reconciliations)]
    Close((Period Lock))

    Pay --> Outbox
    Cash --> Outbox
    Stock --> Outbox
    Outbox --> FE
    FE --> Map
    ACC --> Map
    Map -->|2-decimal journal| JE
    Map -->|4dp-2dp residual| REC
    JE --> Close
    REC --> Close
```

## 8. Reporting DFD — Draft #44

```mermaid
flowchart TB
    User[Authorized User] --> Catalog((Report Catalog))
    Registry[(Typed Report Registry)] --> Catalog
    Catalog --> Run((Scoped Report Request))
    Filters[branch/days/timezone] --> Run
    Orders[(Orders/Snapshots)] --> Run
    Payments[(Payments)] --> Run
    Sources[(Sources)] --> Run
    Run --> SectionA[Trend]
    Run --> SectionB[Branch]
    Run --> SectionC[Source]
    Run --> SectionD[Products/Payments]
    SectionA --> UI[Charts + Table fallback]
    SectionB --> UI
    SectionC --> UI
    SectionD --> UI
```

Draft boundary: لا persisted report run ولا export parity claim حتى تنفيذها.

## 9. Printing/Bridge Flow

```mermaid
sequenceDiagram
    participant API
    participant Queue as Print Jobs
    participant Bridge
    participant Hardware

    API->>Queue: create job(template/lines)
    Bridge->>Queue: claim pending
    Queue-->>Bridge: job payload
    Bridge->>Hardware: print/open/display
    Hardware-->>Bridge: result
    Bridge->>Queue: printed/failed
    Queue->>Queue: retry/dead/requeue policy
```

## 10. Planned Delivery/Connector Flow

```mermaid
flowchart LR
    External[Website/QR/Platform] -.-> Adapter[Source Adapter]
    Adapter -.-> Validate[Auth + Mapping + Dedup]
    Validate -.-> Quote[Server Quote]
    Quote -.-> Order[Canonical Order]
    Order -.-> Dispatch[Delivery Job]
    Dispatch -.-> Driver[Driver State/COD]
    Driver -.-> Settlement[Settlement]
```

## 11. Trust Boundaries

| Boundary | Control |
|---|---|
| Browser→API | JWT، permission، schema validation |
| API→DB | account/branch predicates + constraints |
| API client/platform→API | scoped hashed token + idempotency |
| API→Bridge | scoped job claim + typed payload |
| Operational→Accounting | immutable outbox + mapping + evidence |
| Reporting→UI | typed metadata + no coercion of invalid values إلى fake zero |

## 12. Current Gaps Reflected in DFD

- Inventory UI writes لا تزال Draft/مفقودة حسب العملية.
- Accounting UI غير موجودة.
- Reporting flow Draft.
- Delivery/connectors dotted لأنها future.
- Physical bridge deployment evidence غير مثبت.

</div>
