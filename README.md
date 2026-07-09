<div dir="rtl" align="right">

# YAKEBDA MS — نظام إدارة المطاعم

![CI](https://github.com/AhmedFouad01/yakebda-ms/actions/workflows/ci.yml/badge.svg)

**YAKEBDA MS** هو نظام إدارة مطاعم عربي أولًا وRTL أولًا لمطعم **يا كبدة**.  
المشروع مستقل تمامًا عن AKYRO، ويستخدم مراحل باسم `YKMS-XX` فقط.

> الوضع الحالي: كود foundation + YKMS-02 MVP موجود، واتجاه المنتج اتعدل إلى Operational POS/RMS حقيقي. النسخة الحالية للتشغيل والاختبار المحلي، وليست production-ready بعد.

---

## الهدف التشغيلي

النظام المقبول لازم يخدم flow مطعم حقيقي:

```text
Open Shift → POS Order → Kitchen/KDS → Payment → Receipt/Print Job → Reports → Close Shift
```

أي شاشة أو زرار لا يخدم flow حقيقي يعتبر prototype وليس feature مكتملة.

---

## Stack

| Layer | Tech |
|---|---|
| Backend | Node.js, TypeScript, Express |
| Database | PostgreSQL, Knex migrations |
| Frontend | React, Vite, TypeScript |
| Testing | Vitest, Supertest |
| Hardware foundation | Local Device Bridge contract + Print Jobs |
| Language | Arabic-first / RTL-first |

---

## الهيكل

```text
yakebda-ms/
├── apps/
│   ├── api/                # Backend API
│   └── admin/              # Admin / POS UI
├── packages/
│   └── bridge-contract/    # Local Device Bridge contract
├── docs/                   # SRS, ADRs, QA, operations, memory
├── scripts/                # local setup scripts
└── .github/                # CI, templates, PR checklist
```

---

## التشغيل المحلي السريع

### 1. PostgreSQL عبر Docker

```powershell
docker run -d --name ykms-postgres -e POSTGRES_USER=ykms -e POSTGRES_PASSWORD=ykms -e POSTGRES_DB=ykms -p 5432:5432 postgres:16
docker exec -it ykms-postgres psql -U ykms -d postgres -c "CREATE DATABASE ykms_test OWNER ykms;"
```

### 2. تثبيت وتشغيل

```bash
npm ci
cp apps/api/.env.example apps/api/.env
npm run api:migrate
npm run api:seed
npm run api:test
npm run admin:build
```

Terminal 1:

```bash
npm run api:dev
```

Terminal 2:

```bash
npm run admin:dev
```

افتح:

```text
http://localhost:5173
```

---

## بيانات الدخول التجريبية

```text
owner@ykms.local   / Owner@12345
manager@ykms.local / Manager@12345
kitchen@ykms.local / Kitchen@12345
Cashier PIN: 1234
```

كلها local/dev فقط.

---

## الموديولات الحالية

- Auth + RBAC
- Accounts / Branches / Users
- Devices + Hardware endpoints
- Print Jobs + Bridge contract
- Menu Core
- POS page
- Kitchen/KDS
- Orders
- Tables
- Customers
- Reports
- Receipt preview
- Shift/Cash operational attempt

---

## حالة المنتج

| Area | Status |
|---|---|
| Foundation | Done |
| Windows/Hardware foundation | Done |
| Cleanup/rebrand | Done / needs small polish |
| YKMS-02 MVP | Exists, accepted as artifact only |
| Operational POS quality | In progress |
| Local QA | Required |
| Production readiness | No |

---

## أوامر مهمة

```bash
npm run api:test
npm run admin:build
npm run api:migrate
npm run api:seed
```

---

## QA

اتبع:

```text
docs/QA/YKMS-02_MVP_TEST_SCRIPT_AR.md
```

ثم سجّل أي gaps كـ GitHub Issues باستخدام قالب **Operational gap**.

---

## قواعد ثابتة

- Active name: `YAKEBDA MS`
- Active key: `YAKEBDA_MS`
- Milestones: `YKMS-XX`
- No active `RMS-XX`
- Arabic-first / RTL-first
- Foodics = functional benchmark only, no copying
- No secrets or `.env` commits

---

## المرحلة القادمة

`YKMS-03 — Shifts & Cash`:

- فتح/إغلاق شيفت
- Cash in/out
- تقرير نهاية شيفت
- خصومات بموافقة مدير
- إعادة طباعة بإذن وتسجيل audit
- فتح درج الكاش من شاشة الدفع

</div>
