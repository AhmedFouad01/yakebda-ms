<div dir="rtl" align="right">

# YAKEBDA MS — SRS v3 AR/RTL

**التاريخ:** 2026-07-18  
**الإصدار:** v3  
**الحالة:** Canonical Product + Engineering Requirements  
**النطاق:** Core Operations + Sources/Pricing + Inventory + Reporting + Delivery + Finance/Accounting + Integrations

## 1. الغرض

تحديد متطلبات YAKEBDA MS مع فصل واضح بين requirement وimplementation status. وجود requirement هنا لا يعني أنه منفذ.

## 2. حالات التتبع

- `Merged`: موجود على main ومتحقق هندسيًا في نطاقه.
- `Draft`: موجود في PR مفتوحة فقط.
- `Partial`: جزء من المتطلب موجود.
- `Planned`: غير منفذ.
- `Policy Required`: يحتاج قرار محاسب/تشغيل/قانون.
- `Unsupported`: خارج baseline المدعوم الحالي.

## 3. مبادئ النظام

1. API هو authority للصلاحيات، scopes، pricing، totals، inventory valuation، accounting posting.
2. Frontend لا يعيد بناء business authority.
3. العمليات المؤثرة ماليًا أو مخزنيًا idempotent وقابلة للتدقيق.
4. البيانات التاريخية تحفظ snapshots/lineage.
5. كل موديول Arabic-first/RTL-first.
6. Commercial completeness مختلفة عن backend completeness.

## 4. الأدوار

| الدور | نطاق رئيسي |
|---|---|
| Owner/Admin | إدارة كاملة وفق permissions |
| Manager | تشغيل/تقارير وإدارة محددة |
| Cashier | POS/شيفت/دفع وفق الفرع |
| Kitchen | KDS transitions |
| Inventory Clerk | inventory.view/manage |
| Accountant | accounting.view/manage وفق السياسة |
| Dispatcher | delivery assignment |
| Driver | delivery task/status/COD حسب الإصدار المستقبلي |
| Channel Manager | sources/channel menus/pricelists |

## 5. Core Foundation

| ID | المتطلب | الأولوية | القبول | الحالة |
|---|---|---|---|---|
| FR-001 | حسابات وفروع مع timezone | Must | scope لكل query/entity | Merged |
| FR-002 | مستخدمون وأدوار وصلاحيات | Must | API permission enforcement | Merged |
| FR-003 | دخول admin وPIN تشغيلي | Must | JWT وrevocation/active checks | Merged |
| FR-004 | Audit للإجراءات الحساسة | Must | actor/action/entity/scope/time | Partial/Merged حسب route |
| FR-005 | Devices/hardware profiles | Should | branch/account scoped | Merged |
| FR-006 | Print job state machine | Must | claim/retry/dead/requeue | Merged |
| FR-007 | API clients/tokens | Should | hashed token + scopes | Merged |
| FR-008 | Structured observability | Must | request id + redaction + health | Merged |
| FR-009 | Bounded pagination | Must للقوائم الكبيرة | deterministic cursor | Partial |
| FR-010 | Shared wire contracts | Must للواجهات عالية drift | build + schema tests | Partial/ongoing |

## 6. Menu/POS/Orders

| ID | المتطلب | الأولوية | القبول | الحالة |
|---|---|---|---|---|
| FR-100 | Catalog موحد | Must | product/variant/modifier identity واحدة | Merged |
| FR-101 | Branch availability/price | Must | scoped overrides | Merged |
| FR-102 | Server quote | Must | totals authoritative ولا zero fallback | Merged |
| FR-103 | POS operational flow | Must | shift→cart→submit→kitchen→payment | Merged |
| FR-104 | Order snapshots | Must | names/prices/source/totals historical | Merged/Partial |
| FR-105 | Discounts/fees/tax/rounding | Must | server snapshot + permissions | Merged |
| FR-106 | Refund lineage | Must | linked offsetting payments | Merged |
| FR-107 | Duplicate submit prevention | Must | idempotency/transaction guards | Merged |
| FR-108 | Order status history | Must | timestamp + actor | Merged |
| FR-109 | Receipt rendering | Must | Arabic RTL + stored totals | Merged |

## 7. Kitchen

| ID | المتطلب | الأولوية | القبول | الحالة |
|---|---|---|---|---|
| FR-130 | KDS board | Must | scoped orders + authoritative timestamps | Merged |
| FR-131 | Branch pause | Must | backend 409 before side effects | Merged |
| FR-132 | Order hold overlay | Must | hold blocks ready، SLA excludes hold | Merged |
| FR-133 | Idempotent pause/hold | Must | replay vs deterministic conflict | Merged |
| FR-134 | Kitchen permissions | Must | view/update/manage separated | Merged |
| FR-135 | KDS metrics | Should | server-derived، anomaly rules | Merged/Partial |

## 8. Sources, Pricelists, Channel Menus

| ID | المتطلب | الأولوية | القبول | الحالة |
|---|---|---|---|---|
| FR-170 | إدارة Order Sources | Must | create/edit/disable + account/branch | Partial |
| FR-171 | استقلال source عن order type | Must | dimensions منفصلة | Merged |
| FR-172 | POS source selection | Must | before quote/submit | Merged |
| FR-173 | Default source per branch/device | Should | configurable | Partial |
| FR-174 | Source snapshot | Must | ID/name retained | Merged |
| FR-175 | Source reporting | Must | snapshot semantics | Draft #44/Partial |
| FR-176 | Commission/settlement config | Should | versioned rules | Planned |
| FR-177 | External source identity | Should | platform/store IDs | Planned |
| FR-178 | API source required | Must | trusted client context | Partial |
| FR-179 | Source change requote/audit | Must | full cart requote | Merged/Partial |
| FR-180 | Multiple pricelists | Must | source/branch/time context | Planned beyond override slice |
| FR-181 | Product/variant/modifier rules | Must | deterministic precedence | Partial |
| FR-182 | Amount/percentage adjustments | Must | typed rules | Planned |
| FR-183 | Time-bound rules | Should | effective windows | Planned |
| FR-184 | Deterministic quote | Must | same inputs = same result | Merged for current slice |
| FR-185 | Quote authority | Must | frontend displays result | Merged |
| FR-186 | Reprice on source change | Must | show differences | Partial |
| FR-187 | Reject invalid price | Must | no zero fallback | Merged |
| FR-188 | Price rule snapshots | Must | resolved/base/rule IDs | Partial |
| FR-189 | Modifier contextual pricing | Must | same pricing context | Planned/Partial |
| FR-190 | Channel Menu | Must | bind source+branches | Planned |
| FR-191 | Channel availability | Must | product/variant/modifier | Partial via source product rules |
| FR-192 | Independent ordering/presentation | Must | channel-specific sort/content | Planned |
| FR-193 | External names/descriptions | Should | no master mutation | Planned |
| FR-194 | Modifier availability | Must | validation | Planned |
| FR-195 | Availability schedules | Should | day/time | Planned |
| FR-196 | External mappings | Must | stable internal↔external IDs | Planned |
| FR-197 | Pre-publish validation | Must | missing price/mapping errors | Planned |
| FR-198 | Draft/published versions | Should | versioned publication | Planned |
| FR-199 | Sync status/log | Should | retry/dedup/evidence | Planned |

## 9. Inventory & Recipes

| ID | المتطلب | الأولوية | القبول | الحالة |
|---|---|---|---|---|
| FR-200 | مواد خام ووحدات | Must | base unit + positive conversions | Backend Merged / UI Draft |
| FR-201 | Locations | Must | branch-scoped + default location | Backend Merged / UI Draft read |
| FR-202 | Recipes/versioning | Must | product/variant recipe snapshots | Backend Merged / UI Missing |
| FR-203 | Purchase receipt | Must | supplier/cost/idempotency/movement | Backend Merged / UI Missing |
| FR-204 | Transfers | Must | atomic out/in + same cost | Backend Merged / UI Missing |
| FR-205 | Waste | Must | reason + valuation | Backend Merged / UI Missing |
| FR-206 | Stock count | Must | evidence + difference movement | Backend Merged / UI Missing |
| FR-207 | Automatic consumption | Must | completion event + retry | Backend Merged |
| FR-208 | Reversal | Must | linked append-only reversal | Backend Merged / UI Missing |
| FR-209 | Reorder threshold/alerts | Should | server threshold + alert workflow | Threshold Merged / alerts Planned |
| FR-210 | Valuation policy | Must | moving weighted average initial | Merged |
| FR-211 | Suppliers/PO | Should | supplier merged، PO lifecycle | Partial |
| FR-212 | Traceability | Must | movement source/actor/lineage | Merged/Partial audit |
| FR-213 | Recipe snapshot | Must | immutable event context | Merged |
| FR-214 | Negative stock | Must | current block policy | Merged |
| FR-215 | Inventory reports | Must | levels/movements/waste/valuation | Draft/Partial |
| FR-216 | Branch isolation | Must | no cross-branch except transfer | Merged |
| FR-217 | Decimal precision | Must | quantity 6dp، cost/value 4dp | Merged |
| FR-218 | Count lock/approval | Should | governed count workflow | Planned |
| FR-219 | Import/export | Should | validated preview/apply | Planned |
| FR-220I | Inventory route/navigation | Must | permission-aware | Draft #42 |
| FR-221I | View/manage separation | Must | zero write affordances for view-only | Draft #42/#43 |
| FR-222I | Server valuation display | Must | no client authority | Draft #42 |
| FR-223I | Master data corrections | Must before commercial complete | edit/disable/archive contracts | Planned |
| FR-224I | Inventory audit writes | Must | create/operation audit | Partial/Planned |
| FR-225I | Pagination/filters | Must for scale | server-side | Planned |

## 10. Reporting

| ID | المتطلب | الأولوية | القبول | الحالة |
|---|---|---|---|---|
| FR-300 | Typed report registry | Must | definitions in code/contracts | Draft #44 |
| FR-301 | Report catalog | Must | permissions + supported filters/outputs | Draft #44 |
| FR-302 | Sales trend | Must | timezone/scope explicit | Draft #44 |
| FR-303 | Sales by branch | Must | scoped aggregation | Draft #44 |
| FR-304 | Sales by source | Must | historical source snapshot | Draft #44 |
| FR-305 | Top products | Must | stable identity + metric label | Draft #44 |
| FR-306 | Payment methods | Must | collected payment semantics | Draft #44 |
| FR-307 | Partial failure isolation | Must | successful sections survive | Draft #44 |
| FR-308 | Accessible visualization | Must | ECharts + table fallback | Draft #44 |
| FR-309 | Export parity | Should | same definition/query version | Planned |
| FR-310 | Persisted report runs | Could | only if claimed explicitly | Not implemented |
| FR-311 | Dependency safety | Must before deployment | npm/lockfile or vendored asset | Blocked in Draft |

## 11. Delivery & Drivers — Preserved FR-220…239

| ID | المتطلب | الأولوية | معيار القبول | الحالة |
|---|---|---|---|---|
| FR-220 | مقدم التوصيل | Must | internal/platform/customer pickup ownership explicit | Partial light primitives |
| FR-221 | تعيين السائق | Must | assign/unassign بصلاحية وفرع | Merged light assignment |
| FR-222 | دورة حالة المهمة | Must | queued/assigned/picked_up/delivered/failed | Planned |
| FR-223 | Timestamps | Must | كل انتقال محفوظ | Planned |
| FR-224 | COD custody | Must | expected amount كعهدة على السائق | Planned |
| FR-225 | Driver settlement | Must | expected vs received | Planned |
| FR-226 | فرق التسوية | Must | reason + approval + audit | Planned |
| FR-227 | مناطق ورسوم | Must | fee/minimum by zone/source | Light primitives Merged |
| FR-228 | سائق المنصة | Must | external collection لا ينشئ internal custody | Planned |
| FR-229 | إثبات التسليم | Should | PIN/photo/signature policy | Planned |
| FR-230 | فشل التوصيل | Must | reason + financial/inventory outcome | Planned |
| FR-231 | أداء السائق | Should | counts/times/failures | Planned |
| FR-232 | Availability | Should | shift/status | Planned |
| FR-233 | Dispatcher view | Must | scoped tasks and states | Planned |
| FR-234 | Notifications | Should | restaurant/driver event notifications | Planned |
| FR-235 | Audit | Must | assignment/status/settlement | Planned |
| FR-236 | Permissions | Must | driver/dispatcher/manager separation | Planned |
| FR-237 | Branch scope | Must | allowed branches only | Partial catalog scope |
| FR-238 | External delivery reference | Should | provider task ID snapshot | Planned |
| FR-239 | Route optimization | Could | explicit future service | Out of initial scope |

## 12. Finance Control — Preserved FR-240…259

| ID | المتطلب | الأولوية | معيار القبول | الحالة |
|---|---|---|---|---|
| FR-240 | لوحة مالية يومية | Must | sales/net/tax/payments/expenses/cash | Partial data / UI Planned |
| FR-241 | مصروفات | Must | draft→submitted→approved/rejected→posted/paid | Planned |
| FR-242 | تصنيفات مصروف | Must | account/cost-center defaults | Planned |
| FR-243 | مرفقات | Should | invoice/receipt evidence | Planned |
| FR-244 | Cash in/out | Must | reason/reference/permission | Merged shift primitives |
| FR-245 | Shift reconciliation | Must | expected/actual/difference | Merged/Partial UX |
| FR-246 | Payment reconciliation | Must | cards/wallet/bank matching | Backend Partial |
| FR-247 | Source settlement | Must | gross/commission/fees/net | Planned |
| FR-248 | Driver settlement | Must | COD expected/received | Planned |
| FR-249 | Refund/reversal | Must | original event retained | Merged payment/accounting lineage |
| FR-250 | Period lock | Must | block posting before/inside lock policy | Backend Merged |
| FR-251 | Financial event idempotency | Must | no duplicate event | Merged |
| FR-252 | Dimensions | Must | branch/source/order type/payment/cost center | Partial |
| FR-253 | Export | Must | CSV/Excel/accounting adapter | Planned/Partial tooling |
| FR-254 | Approval limits | Should | by role/amount | Planned |
| FR-255 | Tax summaries | Must | outputs/fees/refunds | Partial |
| FR-256 | Audit trail | Must | source record per movement | Merged/Partial by route |
| FR-257 | Daily closing | Must | frozen operational-day summary | Planned/Partial locks |
| FR-258 | Exceptions queue | Must | failed/unbalanced/unmapped visible | Backend Partial / UI Missing |
| FR-259 | Multi-branch | Must | separate + consolidated reports | Draft Reporting/Partial |

## 13. Accounting Bridge & Profitability — Preserved FR-270…289

| ID | المتطلب | الأولوية | معيار القبول | الحالة |
|---|---|---|---|---|
| FR-270 | Chart of accounts mapping | Must | configurable scoped mapping | Backend Merged / Admin Missing |
| FR-271 | Journals | Must | sales/cash/bank/platform/expense/inventory/general | Backend Partial/Merged types |
| FR-272 | Balanced journal entries | Must | debit = credit enforced | Merged |
| FR-273 | Immutable posting | Must | correction by reversal | Merged |
| FR-274 | Source reference | Must | order/payment/expense/settlement lineage | Merged/Partial |
| FR-275 | Financial event outbox | Must | retryable processing | Merged |
| FR-276 | COGS | Must | inventory valuation source | Backend Merged / Pilot |
| FR-277 | Gross profit | Must | sales - COGS with approved semantics | Policy Required / UI Missing |
| FR-278 | Profitability dimensions | Must | product/source/branch | Planned/Partial data |
| FR-279 | External accounting adapter | Should | API/export boundary | Planned |
| FR-280 | Reconciliation status | Must | pending/matched/exception | Backend Partial |
| FR-281 | Closing controls | Must | period/year locks | Period lock Merged / year close Planned |
| FR-282 | Trial balance/P&L | Should | approved mapping and period | Trial balance backend / P&L Planned |
| FR-283 | Multi-currency | Could | explicit currency ledger | Out of initial scope |
| FR-284 | Vendor payables | Should | after purchase lifecycle | Partial AP mapping only |
| FR-285 | Payroll/assets | Could | separate modules | Out of scope |
| FR-286 | Data inalterability | Must | audit/hash/sequence strategy | Immutability Merged / hash strategy Planned |
| FR-287 | Backfill | Must | migrate existing orders/payments safely | Dry-run tooling Merged / baseline policy required |
| FR-288 | Dry run | Must | compare before posting | Merged |
| FR-289 | Legal validation | Must | accountant approval before production | Pending |

## 14. Accounting Operational Additions

| ID | المتطلب | الأولوية | معيار القبول | الحالة |
|---|---|---|---|---|
| FR-290 | Accounting Admin route/navigation | Must before sellable | permission-aware | Missing |
| FR-291 | Event exception/retry UI | Must | safe retry + errors | Missing |
| FR-292 | Journals/lines/lineage UI | Must | read-only evidence first | Missing |
| FR-293 | Mapping/period management | Must for Pilot ops | approvals + audit | Missing |
| FR-294 | Residual reconciliation UI | Must | 4dp/2dp equation visible | Missing |
| FR-295 | Accountant sign-off packet | Must | documented policy/evidence | Pending |

## 15. Integrations/Compliance

| ID | المتطلب | الأولوية | الحالة |
|---|---|---|---|
| FR-500 | Adapter boundary | Must | Foundation only |
| FR-501 | Webhook idempotency/dedup | Must | Planned |
| FR-502 | Online/QR source context | Must | Planned |
| FR-503 | Channel publish/sync | Must | Planned |
| FR-504 | Egyptian e-Receipt adapter | Must عند التفعيل | Planned |
| FR-505 | Versioned legal payload | Must | Planned |
| FR-506 | Retry/status/evidence | Must | Planned |
| FR-507 | Legal/accountant validation | Must | Pending |

## 16. Data Migration & Upgrade

| ID | المتطلب | الأولوية | معيار القبول |
|---|---|---|---|
| MIG-001 | Fresh install | Must | 001→latest + second latest no-op |
| MIG-002 | Supported baseline declaration | Must | version/schema listed explicitly |
| MIG-003 | Customer upgrade fixture | Must لكل baseline مدعوم | preserve IDs/data + reconciliation |
| MIG-004 | Legacy partial-schema detection | Must فقط لو baseline مدعوم | shape-based safe adoption |
| MIG-005 | Backup/recovery | Must | verified restore evidence |
| MIG-006 | No manual history repair | Must | no fabricated migration rows |
| MIG-007 | Unsupported baseline policy | Must | documented export/migration/onboarding path |
| MIG-008 | Original DB protection | Must | clone/test only unless approved |

الحالة الحالية: partial legacy 019 work cancelled؛ therefore `MIG-002/MIG-007` decision required قبل commercial upgrade claim.

## 17. Non-Functional Requirements

| ID | المتطلب |
|---|---|
| NFR-001 | Arabic-first/RTL-first لكل UI/print/export |
| NFR-002 | Tenant/branch isolation at API and DB where practical |
| NFR-003 | Idempotency للعمليات المؤثرة |
| NFR-004 | Immutable snapshots/lineage/audit |
| NFR-005 | No silent pricing/accounting/inventory failure |
| NFR-006 | Currency/decimal precision deterministic |
| NFR-007 | Node 22 CI contract |
| NFR-008 | Tests: contracts/API/Admin/build/color/diff |
| NFR-009 | Accessibility: keyboard/focus/semantic fallback |
| NFR-010 | Responsive: 1920×1080، 1366×768، narrow admin |
| NFR-011 | Observability with redaction/no secrets |
| NFR-012 | Migrations idempotent and rollback/recovery documented |
| NFR-013 | Production dependencies pinned through controlled package/vendor path |
| NFR-014 | Performance budgets defined per high-volume endpoint قبل scale claim |
| NFR-015 | No frontend authoritative financial or stock calculations |

## 18. Release Gates

### Core PR Gate

- exact head verified.
- Draft until CI + manual QA.
- contracts/API/Admin/build/color/diff pass.
- no skipped tests added.
- RTL/Light/Dark/responsive/keyboard/console/network evidence.
- no merge without explicit approval.

### Inventory Commercial Gate

- view + manage + operations + correction/reversal UX.
- pagination/filters.
- audit.
- recipes/count/transfer workflows.
- supported upgrade policy.

### Accounting Pilot Gate

- Admin operations.
- policy approvals.
- reconciliation evidence.
- exception handling.
- no statutory claims.

### Production Gate

- deployment plan/evidence.
- backups/restore.
- dependency vendoring/package lock.
- monitoring/retention.
- user acceptance.

</div>
