<div dir="rtl" align="right">

# YAKEBDA MS — SRS v2 AR/RTL

**التاريخ:** 2026-07-12  
**الحالة:** Canonical Product Requirements  
**اللغة:** العربية  
**الاتجاه:** RTL  
**النطاق:** Restaurant Operations + Sources + Inventory + Delivery + Finance

---

## 1. الهدف

تحديد المتطلبات الوظيفية وغير الوظيفية للمرحلة التالية من YAKEBDA MS، مع الحفاظ على المتطلبات المنفذة في POS/KDS/Menu/CRM/Shifts/Reports.

---

## 2. مبادئ الدومين

1. الطلب هو سجل تشغيلي واحد مهما اختلف مصدره.
2. مصدر الطلب، نوع الطلب، طريقة الدفع، ومقدم التوصيل أبعاد مستقلة.
3. المنتج الرئيسي لا يتكرر لكل قناة.
4. Channel Menu يتحكم في العرض والإتاحة.
5. Pricelist تتحكم في السعر.
6. Quote النهائي من الخادم.
7. المخزون يتبع الوصفة لا سعر البيع.
8. Finance Control يتبع الأحداث التشغيلية.
9. COGS والربحية يعتمدان على المخزون.
10. كل إجراء حساس خاضع للصلاحيات والـAudit.

---

## 3. الأدوار الإضافية

| الدور | المسؤولية |
|---|---|
| مسؤول القنوات | إدارة المصادر والمنيو والأسعار الخارجية |
| مسؤول المخزون | المواد والوصفات والجرد والاستلام والهالك |
| Dispatcher | توزيع طلبات التوصيل ومتابعتها |
| السائق | استلام المهمة وتحديث الحالة وتسليم COD |
| مسؤول المصروفات | إنشاء وتصنيف المصروف |
| معتمد المصروفات | قبول/رفض المصروفات |
| المحاسب | التسويات والتقارير والترحيل والتصدير |

---

## 4. Order Sources

| ID | المتطلب | الأولوية | معيار القبول |
|---|---|---|---|
| FR-170 | إدارة مصادر الطلب | Must | إنشاء/تعديل/تعطيل source وربطه بالحساب والفروع |
| FR-171 | استقلال المصدر عن نوع الطلب | Must | يمكن أن يكون المصدر Website والنوع Delivery |
| FR-172 | اختيار المصدر في POS | Must | يختار المستخدم المصدر قبل تثبيت الطلب |
| FR-173 | مصدر افتراضي لكل جهاز/فرع | Must | POS يستخدم default source قابلًا للتغيير |
| FR-174 | Source snapshot | Must | الطلب القديم يحتفظ باسم ومعرف المصدر |
| FR-175 | تقارير حسب المصدر | Must | المبيعات والطلبات والخصومات حسب source |
| FR-176 | قواعد عمولة وتسوية | Should | يمكن تعريف commission/settlement config |
| FR-177 | External source identity | Should | حفظ platform/store IDs |
| FR-178 | مصدر API إجباري | Must | كل طلب خارجي يحدد source موثوقًا |
| FR-179 | Audit تغيير المصدر | Must | تسجيل التغيير وإعادة التسعير |

---

## 5. Pricelists & Quote

| ID | المتطلب | الأولوية | معيار القبول |
|---|---|---|---|
| FR-180 | قوائم أسعار متعددة | Must | قائمة لكل source/branch عند الحاجة |
| FR-181 | قواعد سعر ثابت | Must | override لمنتج أو variant |
| FR-182 | زيادة/خصم مبلغ أو نسبة | Must | القاعدة تطبق حسب الأولوية |
| FR-183 | قواعد زمنية | Should | تاريخ/وقت بداية ونهاية |
| FR-184 | ترتيب أولوية حتمي | Must | نفس المدخلات تعطي نفس النتيجة |
| FR-185 | Server-side quote | Must | الواجهة تعرض نتيجة الخادم |
| FR-186 | إعادة تسعير عند تغيير المصدر | Must | كل السلة تعاد وتظهر الفروقات |
| FR-187 | رفض السعر غير الصالح | Must | لا fallback إلى صفر |
| FR-188 | Price snapshot | Must | حفظ base/resolved/rule IDs |
| FR-189 | Modifier pricing | Must | سعر الإضافة يخضع للسياق نفسه |

### أولوية السعر

```text
Source + Branch + Variant override
→ Source pricelist rule
→ Branch price
→ Base price
→ Reject
```

---

## 6. Channel Menus

| ID | المتطلب | الأولوية | معيار القبول |
|---|---|---|---|
| FR-190 | إنشاء Channel Menu | Must | ربط menu بمصدر وفروع |
| FR-191 | إتاحة الأصناف | Must | إخفاء/إظهار منتج للقناة |
| FR-192 | ترتيب الأقسام والأصناف | Must | ترتيب مستقل للقناة |
| FR-193 | أسماء وأوصاف خارجية | Should | override دون تغيير master product |
| FR-194 | Variant/modifier availability | Must | القناة تحدد الاختيارات المسموحة |
| FR-195 | Availability schedule | Should | ساعات وأيام الإتاحة |
| FR-196 | External mappings | Must | ربط internal IDs بـplatform IDs |
| FR-197 | Validation قبل النشر | Must | كشف missing price/mapping |
| FR-198 | Versioned publish | Should | مسودة ثم نشر |
| FR-199 | Sync status/log | Should | متابعة نجاح وفشل المزامنة |

---

## 7. Inventory & Recipes

| ID | المتطلب | الأولوية | معيار القبول |
|---|---|---|---|
| FR-200 | مواد خام ووحدات قياس | Must | تعريف unit وconversion |
| FR-201 | مخازن ومواقع | Must | رصيد حسب branch/location |
| FR-202 | وصفات المنتجات | Must | مكونات وكميات لكل product/variant |
| FR-203 | استلام مشتريات | Must | receipt يزيد المخزون بحركة |
| FR-204 | تحويلات | Must | source/destination movements |
| FR-205 | هالك | Must | سبب وصلاحية واعتماد |
| FR-206 | جرد وتسوية | Must | count ثم adjustment موثق |
| FR-207 | خصم تلقائي | Must | حدث البيع/الإكمال يخلق movements |
| FR-208 | عكس الإلغاء/الاسترداد | Must | reversal حسب حالة التشغيل |
| FR-209 | حد إعادة الطلب | Should | low stock alerts |
| FR-210 | سياسة تكلفة | Must | تحديد average/FIFO قبل COGS |
| FR-211 | Supplier and purchase order | Should | دورة شراء أساسية |
| FR-212 | Traceability | Must | كل movement له مرجع ومستخدم |
| FR-213 | Recipe version snapshot | Should | حفظ النسخة المستخدمة |
| FR-214 | Negative stock policy | Must | منع أو سماح مضبوط |
| FR-215 | Inventory reports | Must | on-hand/movements/waste |
| FR-216 | Branch isolation | Must | لا حركة عابرة دون transfer |
| FR-217 | Unit rounding | Must | منع أخطاء الكسور |
| FR-218 | Count locking | Should | قفل الموقع أثناء الجرد |
| FR-219 | Import/export | Should | CSV/Excel مضبوط |

---

## 8. Delivery & Drivers

| ID | المتطلب | الأولوية | معيار القبول |
|---|---|---|---|
| FR-220 | مقدم التوصيل | Must | internal/platform/customer pickup |
| FR-221 | تعيين السائق | Must | assign/unassign بصلاحية |
| FR-222 | دورة حالة المهمة | Must | queued/assigned/picked_up/delivered/failed |
| FR-223 | timestamps | Must | كل انتقال مسجل |
| FR-224 | COD custody | Must | المبلغ عهدة على السائق |
| FR-225 | Driver settlement | Must | expected vs received |
| FR-226 | فرق التسوية | Must | reason + approval |
| FR-227 | مناطق ورسوم | Must | fee/minimum by zone |
| FR-228 | سائق المنصة | Must | لا ينشئ عهدة داخلية إذا التحصيل خارجي |
| FR-229 | إثبات التسليم | Should | PIN/صورة/توقيع |
| FR-230 | فشل التوصيل | Must | سبب وإجراء مالي/مخزني |
| FR-231 | أداء السائق | Should | counts/times/failures |
| FR-232 | Availability | Should | shift/status |
| FR-233 | Dispatcher view | Must | قائمة المهام والحالات |
| FR-234 | Notifications | Should | تنبيه السائق/المطعم |
| FR-235 | Audit | Must | كل assignment/status/settlement |
| FR-236 | Permissions | Must | driver/dispatcher/manager |
| FR-237 | Branch scope | Must | السائق مرتبط بفروع مسموحة |
| FR-238 | External delivery reference | Should | platform delivery ID |
| FR-239 | Route optimization | Could | خارج النسخة الأولى |

---

## 9. Finance Control

| ID | المتطلب | الأولوية | معيار القبول |
|---|---|---|---|
| FR-240 | لوحة مالية يومية | Must | sales/net/tax/payments/expenses/cash |
| FR-241 | مصروفات | Must | draft→submitted→approved/rejected→posted/paid |
| FR-242 | تصنيفات مصروف | Must | حساب/مركز تكلفة افتراضي |
| FR-243 | مرفقات | Should | فاتورة أو إيصال |
| FR-244 | Cash in/out | Must | سبب ومرجع وصلاحية |
| FR-245 | Shift reconciliation | Must | expected/actual/difference |
| FR-246 | Payment reconciliation | Must | cards/wallets/bank |
| FR-247 | Source settlement | Must | gross/commission/fees/net |
| FR-248 | Driver settlement | Must | COD expected/received |
| FR-249 | Refund/reversal | Must | لا حذف للحدث الأصلي |
| FR-250 | Period lock | Must | منع الترحيل قبل lock date |
| FR-251 | Financial event idempotency | Must | لا قيد مكرر |
| FR-252 | Dimensions | Must | branch/source/order type/payment/cost center |
| FR-253 | Export | Must | CSV/Excel/accounting adapter |
| FR-254 | Approval limits | Should | حسب المبلغ والدور |
| FR-255 | Tax summaries | Must | outputs/fees/refunds |
| FR-256 | Audit trail | Must | source record لكل حركة |
| FR-257 | Daily closing | Must | freeze operational day summary |
| FR-258 | Exceptions queue | Must | أحداث فاشلة أو غير متوازنة |
| FR-259 | Multi-branch | Must | تقارير منفصلة ومجمعة |

---

## 10. Accounting Bridge & Profitability

| ID | المتطلب | الأولوية | معيار القبول |
|---|---|---|---|
| FR-270 | Chart of accounts mapping | Must | mapping configurable |
| FR-271 | Journals | Must | sales/cash/bank/platform/expense/inventory/general |
| FR-272 | Balanced journal entries | Must | debit = credit |
| FR-273 | Immutable posting | Must | التصحيح بقيد عكسي |
| FR-274 | Source reference | Must | order/payment/expense/settlement |
| FR-275 | Financial event outbox | Must | retryable processing |
| FR-276 | COGS | Must | من inventory valuation |
| FR-277 | Gross profit | Must | sales - COGS |
| FR-278 | Profitability dimensions | Must | product/source/branch |
| FR-279 | External accounting adapter | Should | API/export |
| FR-280 | Reconciliation status | Must | pending/matched/exception |
| FR-281 | Closing controls | Must | period/year locks |
| FR-282 | Trial balance/P&L | Should | بعد تفعيل ledger |
| FR-283 | Multi-currency | Could | خارج أول إصدار |
| FR-284 | Vendor payables | Should | بعد purchases |
| FR-285 | Payroll/assets | Could | خارج النطاق |
| FR-286 | Data inalterability | Must | audit/hash/sequence strategy |
| FR-287 | Backfill | Must | migration from existing orders/payments |
| FR-288 | Dry run | Must | compare before posting |
| FR-289 | Legal validation | Must | accountant approval before production |

---

## 11. المتطلبات غير الوظيفية

| ID | المتطلب |
|---|---|
| NFR-001 | Quote p95 مناسب للعمل التشغيلي ولا يوقف POS |
| NFR-002 | كل العمليات idempotent وقابلة لإعادة المحاولة |
| NFR-003 | Tenant/branch isolation |
| NFR-004 | API permission enforcement |
| NFR-005 | Auditability and immutable snapshots |
| NFR-006 | Arabic-first / RTL-first |
| NFR-007 | No silent pricing fallback |
| NFR-008 | Reconciliation totals exact to currency precision |
| NFR-009 | Migrations reversible where practical |
| NFR-010 | Integrations isolated through adapters/outbox |
| NFR-011 | Tax/compliance logic versioned |
| NFR-012 | UI works on cashier desktop and narrow mobile admin views |

---

## 12. الكيانات الجديدة

```text
order_sources
source_branch_configs
price_lists
price_list_rules
channel_menus
channel_menu_categories
channel_menu_items
channel_menu_modifier_groups
external_product_mappings
source_fee_rules
source_settlement_rules

inventory_items
units_of_measure
unit_conversions
inventory_locations
recipes
recipe_items
stock_movements
stock_counts
purchase_orders
purchase_receipts
waste_records

delivery_jobs
driver_assignments
driver_cash_custody
driver_settlements

expense_categories
expenses
cash_transactions
payment_reconciliations
source_settlements
financial_events

finance_accounts
finance_journals
journal_entries
journal_lines
accounting_exports
```

لا يستخدم `accounts` للدفتر المالي لأن الاسم مستخدم لهوية حساب المطعم.

---

## 13. بوابة القبول

- Migrations + rollback.
- API tests.
- Deterministic pricing tests.
- Cross-account/branch security tests.
- Quote snapshot tests.
- Inventory movement balance tests.
- Driver COD settlement tests.
- Finance idempotency and reconciliation tests.
- Admin build.
- RTL/mobile manual QA.

</div>
