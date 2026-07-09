<div dir="rtl" align="right">

# مخططات Restaurant MS v1.3 AR/RTL

**الإصدار:** v1.3  
**الاتجاه:** عربي RTL  
**المشروع:** مستقل عن AKYRO  

---

## 1. مخطط سياق النظام System Context

```mermaid
flowchart TB
    Customer["العميل"]
    Website["الموقع / QR / تطبيق لاحقًا"]
    Staff["موظفو المطعم"]
    Owner["المالك / المدير"]
    WinPOS["جهاز كاشير Windows"]
    Hardware["طابعات / شاشات مطبخ / درج كاش / باركود"]
    RMS["Restaurant MS"]
    Bridge["Local Device Bridge"]
    Payment["مزود دفع لاحقًا"]
    Integrations["توصيل / محاسبة / واتساب لاحقًا"]

    Customer --> Website
    Website --> RMS
    Staff --> WinPOS
    Owner --> RMS
    WinPOS --> RMS
    WinPOS --> Bridge
    Bridge --> Hardware
    RMS --> Payment
    RMS --> Integrations
```

---

## 2. مخطط التطبيقات Application Containers

```mermaid
flowchart TB
    Admin["لوحة الإدارة العربية RTL"]
    POS["شاشة الكاشير POS على Windows"]
    Waiter["شاشة الويتر"]
    KDS["شاشة المطبخ KDS"]
    Online["الموقع / QR / تطبيق لاحقًا"]
    PublicAPI["Public API v1"]
    API["Backend API"]
    DB["PostgreSQL"]
    Events["Realtime Events"]
    Queue["Jobs / Queue"]
    Bridge["Windows Local Device Bridge"]
    Hardware["طابعات / درج كاش / شاشة عميل / قارئ باركود"]

    Admin --> API
    POS --> API
    Waiter --> API
    KDS --> Events
    Online --> PublicAPI
    PublicAPI --> API
    API --> DB
    API --> Events
    API --> Queue
    POS --> Bridge
    API --> Bridge
    Bridge --> Hardware
```

---

## 3. نموذج الدومين الأساسي Core Domain Model

```mermaid
erDiagram
    ACCOUNT ||--o{ BRANCH : owns
    BRANCH ||--o{ DEVICE : has
    DEVICE ||--o{ DEVICE_PROFILE : uses
    DEVICE ||--o{ HARDWARE_ENDPOINT : connects
    DEVICE ||--o{ PRINT_JOB : processes
    BRANCH ||--o{ TABLE : has
    USER }o--o{ ROLE : assigned
    ROLE }o--o{ PERMISSION : grants
    BRANCH ||--o{ ORDER : receives
    CUSTOMER ||--o{ ORDER : places
    ORDER ||--o{ ORDER_ITEM : contains
    PRODUCT ||--o{ ORDER_ITEM : sold_as
    PRODUCT ||--o{ RECIPE_ITEM : consumes
    INVENTORY_ITEM ||--o{ RECIPE_ITEM : ingredient
    ORDER ||--o{ PAYMENT : paid_by
    ORDER ||--o{ KITCHEN_TICKET : creates
    KITCHEN_STATION ||--o{ KITCHEN_TICKET : handles
    INVENTORY_ITEM ||--o{ STOCK_MOVEMENT : moves
    API_CLIENT ||--o{ API_TOKEN : owns
    API_CLIENT ||--o{ WEBHOOK_ENDPOINT : owns
    WEBHOOK_ENDPOINT ||--o{ WEBHOOK_DELIVERY : receives
```

---

## 4. دورة حياة الطلب Order Lifecycle

```mermaid
stateDiagram-v2
    [*] --> Draft: مسودة
    Draft --> Active: إضافة أصناف
    Active --> SentToKitchen: إرسال للمطبخ
    SentToKitchen --> Preparing: بدأ التحضير
    Preparing --> Ready: جاهز
    Ready --> Served: تم التسليم
    Served --> Closed: تم الدفع والإغلاق
    Active --> Voided: إلغاء
    SentToKitchen --> Voided: إلغاء بعد الإرسال
    Closed --> Refunded: استرجاع
```

---

## 5. تسلسل طلب صالة Dine-in Sequence

```mermaid
sequenceDiagram
    participant Waiter as الويتر
    participant API as Backend API
    participant POS as الكاشير
    participant KDS as شاشة المطبخ
    participant Kitchen as المطبخ

    Waiter->>API: فتح طلب طاولة
    Waiter->>API: إضافة أصناف وإضافات وملاحظات
    Waiter->>API: إرسال للمطبخ
    API-->>POS: تحديث حالة الطلب
    API-->>KDS: إنشاء تذكرة مطبخ
    Kitchen->>KDS: تحديث حالة التحضير
    KDS->>API: الصنف جاهز
    API-->>POS: تحديث حالة الجاهزية
    POS->>API: تحصيل الدفع وإغلاق الطلب
```

---

## 6. تسلسل طلب أونلاين Online / QR Sequence

```mermaid
sequenceDiagram
    participant Customer as العميل
    participant Online as الموقع/QR
    participant API as Public API v1
    participant POS as الكاشير
    participant KDS as شاشة المطبخ

    Customer->>Online: إنشاء طلب تيك أواي/دليفري
    Online->>API: إرسال الطلب
    API-->>POS: إشعار بطلب جديد
    POS->>API: قبول الطلب
    API-->>KDS: إرسال تذكرة للمطبخ
    KDS->>API: الطلب جاهز
    API-->>Online: تحديث حالة الطلب
```

---

## 7. تدفق الطباعة والهاردوير Windows Hardware Bridge

```mermaid
sequenceDiagram
    participant POS as كاشير Windows
    participant API as Backend API
    participant Bridge as Local Device Bridge
    participant Printer as طابعة العميل/المطبخ
    participant Drawer as درج الكاش
    participant Audit as Audit Log

    POS->>API: طلب طباعة إيصال أو تذكرة مطبخ
    API->>API: إنشاء Print Job
    API-->>Bridge: إرسال مهمة الطباعة
    Bridge->>Printer: تنفيذ الطباعة محليًا
    Printer-->>Bridge: نجاح أو فشل
    Bridge-->>API: تحديث حالة Print Job
    POS->>API: طلب فتح درج الكاش
    API-->>Bridge: أمر فتح درج الكاش
    Bridge->>Drawer: تنفيذ الأمر
    API->>Audit: تسجيل العملية
```

---

## 8. تدفق الصلاحيات RBAC

```mermaid
flowchart TB
    Action["إجراء من المستخدم"]
    Auth["تسجيل/تحقق من الهوية"]
    Permission["فحص الصلاحية"]
    Approval["موافقة مدير عند الحاجة"]
    Execute["تنفيذ الإجراء"]
    Audit["تسجيل في Audit Log"]
    Deny["رفض الإجراء"]

    Action --> Auth
    Auth --> Permission
    Permission --> Execute
    Permission --> Approval
    Permission --> Deny
    Approval --> Execute
    Execute --> Audit
```

---

## 9. تدفق المخزون والوصفة Inventory Deduction

```mermaid
sequenceDiagram
    participant POS as الكاشير
    participant API as Backend API
    participant Recipe as الوصفة
    participant Stock as المخزون
    participant Reports as التقارير

    POS->>API: إغلاق طلب مدفوع
    API->>Recipe: تحميل وصفات الأصناف
    Recipe-->>API: كميات المكونات المطلوبة
    API->>Stock: إنشاء حركات خصم مخزون
    Stock-->>API: تحديث الكميات المتاحة
    API-->>Reports: إرسال بيانات المبيعات والتكلفة
```

---

## 10. تدفق Public API للموقع و QR

```mermaid
sequenceDiagram
    participant Website as الموقع/QR
    participant Gateway as API Gateway
    participant Auth as API Token Check
    participant RMS as Restaurant MS API
    participant Logs as Integration Logs
    participant Webhook as Webhook لاحقًا

    Website->>Gateway: طلب إنشاء/تحديث طلب
    Gateway->>Auth: التحقق من token و scopes
    Auth-->>Gateway: مسموح
    Gateway->>RMS: تنفيذ العملية
    RMS->>Logs: تسجيل التكامل
    RMS-->>Website: رد API
    RMS-->>Webhook: إرسال حدث عند الحاجة
```

---

## 11. قاعدة RTL في واجهة المستخدم

```mermaid
flowchart TB
    Locale["اختيار اللغة"]
    Arabic["العربية"]
    English["English لاحقًا"]
    RTL["dir=rtl"]
    LTR["dir=ltr"]
    UI["تطبيق Layout"]
    Text["تحميل النصوص"]

    Locale --> Arabic
    Locale --> English
    Arabic --> RTL
    English --> LTR
    RTL --> UI
    LTR --> UI
    UI --> Text
```

</div>
