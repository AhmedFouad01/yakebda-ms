<div dir="rtl" align="right">

# YAKEBDA MS — ملف المشروع الرئيسي v1.5

**التاريخ:** 2026-07-18  
**الحالة:** Canonical / Active Development  
**اللغة/الاتجاه:** Arabic-first / RTL-first

## 1. تعريف المنصة

YAKEBDA MS منصة تشغيل مطاعم cloud-first تربط العمليات اليومية والبيانات المالية والتكاملات في نظام واحد:

- الحسابات والفروع والمستخدمين وRBAC.
- POS والطلبات والمدفوعات والشيفتات.
- KDS والمطبخ وحالات التوقف/التعليق.
- المنيو والمنتجات والأحجام والإضافات والإتاحة.
- العملاء وCRM.
- الأجهزة والطباعة والـLocal Device Bridge.
- مصادر الطلب والتسعير حسب المصدر.
- المخزون والوصفات والتقييم.
- التقارير.
- التوصيل والسائقين.
- Finance Control وAccounting Bridge.
- Online/QR/platform connectors وcompliance adapters.

## 2. حدود الهوية

المشروع مستقل عن:

- YAKEBDA BRAND.
- AKYRO.
- Real Memory Core.
- أي Restaurant MS/RMS legacy planning.

التسمية النشطة: `YAKEBDA MS`، repository `yakebda-ms`، packages `@ykms/*`، milestones `YKMS-*`.

## 3. التقنية الحالية

| طبقة | اختيار |
|---|---|
| Admin/POS | React + Vite + TypeScript |
| API | Node.js 22 + Express + TypeScript |
| Database | PostgreSQL + Knex migrations |
| Contracts | Zod/shared package للـwire contracts المختارة |
| Auth | JWT + email/password + branch PIN workflows |
| UI | Arabic/RTL، semantic Light/Dark، AppShell |
| Printing | Queue + generic bridge contracts؛ physical deployment evidence منفصل |

## 4. Source-of-Truth Architecture

- GitHub: الكود وحالة PR/CI/merge.
- Migrations: schema truth.
- API services: pricing، scopes، inventory valuation، accounting posting authority.
- Google Drive Real Memory: user-facing documentation/memory.
- ChatGPT Project Sources: boot context فقط.

## 5. حالة الموديولات

| الموديول | Backend | Admin/UX | الحالة التجارية |
|---|---|---|---|
| Foundation/Auth/RBAC | Merged | Merged | Baseline operational |
| Devices/Printing | Merged | Admin surfaces موجودة | Physical deployment validation ناقصة |
| Menu/POS/Orders | Merged | Merged | Operational baseline |
| Payments/Shifts/Refunds | Merged | Merged | Operational baseline مع سياسات لاحقة |
| KDS/Kitchen controls | Merged | Merged | Operational baseline |
| CRM/Customers | Merged | Merged | Operational baseline |
| Sources/Pricing slice | Merged | Merged ضمن POS/config | Partial مقابل target full pricelist/channel menu |
| Inventory | Merged | Draft #42/#43 جزئي | غير مكتمل تجاريًا |
| Accounting | Merged | Missing | Pilot فقط |
| Reporting Foundation | Draft #44 | Draft #44 | غير merged |
| Delivery | Light primitives | Partial | Full dispatch/COD غير مكتمل |
| Finance Control | Primitives متفرقة | Missing | Future workstream |
| Online/QR/Platforms | Foundations فقط | Missing | Future |
| e-Receipt | غير منفذ | غير منفذ | Future / legal validation |

## 6. Domain Invariants

### Tenant/Branch

- لا استعلام حساس بـID وحده.
- account scope من الهوية الموثقة، لا من payload.
- cross-account returns 404 لتقليل disclosure.
- branch-bound users لا يتجاوزون فروعهم.

### Orders/Pricing

- الطلب سجل تشغيلي واحد.
- source ≠ order type ≠ payment method ≠ delivery provider.
- product catalog واحد.
- backend quote هو السلطة النهائية.
- precedence الحالي المنفذ: source product override → branch override → base price → reject.
- target model الأوسع يحتاج pricelist rules/versioning.
- لا zero-price fallback.
- historical source/price snapshots لا يعاد تفسيرها.

### Inventory

- stock movements append-only.
- balances/value derived؛ لا mutable balance authority.
- block-negative policy الحالية.
- movement idempotency.
- recipes versioned؛ completion snapshot durable.
- refund المالي لا يعيد مخزون تلقائيًا.
- valuation moving weighted average.

### Accounting

- financial event outbox durable.
- journal balanced/immutable.
- corrections عبر reversal.
- period lock.
- source precision 4dp؛ journal 2dp؛ residual tracked.
- policy provisional، لا production/statutory claim.

### UI

- `theme.css` semantic source.
- `global-colors.css` final authority وآخر import.
- screen CSS للـgeometry؛ shared layer للألوان.
- RTL، keyboard، focus-visible، responsive، overflow gates.

## 7. Commercial Completeness Definition

الموديول لا يُعتبر مكتملًا إلا بوجود:

1. route/navigation.
2. permission-aware view/manage UX.
3. contracts متشاركة أو موثقة.
4. operational create/update/reversal/correction flows حسب النطاق.
5. API tests + Admin tests/build.
6. tenant/branch isolation.
7. RTL/Light/Dark/responsive/accessibility QA.
8. documentation/support/upgrade policy.
9. deployment evidence عند ادعاء production.

## 8. Supported Data Evolution

- Fresh migration success شرط ضروري وليس كافيًا.
- أي supported customer baseline يحتاج fixture upgrade test + data reconciliation + second latest no-op.
- partial legacy 019 scope ملغى حاليًا وغير مدعوم تلقائيًا.
- ممنوع manual migration-history repair أو destructive adoption.

## 9. Current Program State

```text
main 58d60152d4b0eba43a0a4c3a521b9a2a44f16f7a
├─ PR #42 Inventory Admin Read-only [Draft]
│  └─ PR #43 Inventory Master Data [Draft]
├─ PR #44 Reporting Foundation [Draft]
└─ PR #46 Integration Review [Draft / NEVER MERGE]
```

## 10. Strategic Sequence

```text
Current Draft QA
→ Inventory Admin operational completion
→ Reporting merge/readiness decision
→ Accounting Admin + policy approval
→ Delivery/Finance Control
→ Channel Menus/full Pricelists
→ Online connectors
→ e-Receipt/compliance
```

الترتيب قابل للتعديل بقرار مستخدم، لكن لا يجوز تخطي dependency gates الخاصة بالمخزون/التقييم/الحسابات.

</div>
