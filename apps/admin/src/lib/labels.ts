/**
 * UX-LANG-01 — طبقة عرض النصوص العربية.
 *
 * قاعدة حاكمة: أي قيمة تقنية (enum / مفتاح / كود) لا تظهر للمستخدم أبدًا.
 * كل دوال هذا الملف تُرجع نصًا عربيًا دائمًا — وعند وصول قيمة غير معروفة
 * تُرجع وصفًا عربيًا عامًا بدل الكود الخام.
 *
 * الكود يبقى إنجليزيًا بالداخل (مفاتيح الصلاحيات، أسماء المتغيرات، قيم الـAPI)؛
 * التعريب في طبقة العرض فقط.
 */

/** معجم المصطلحات المعتمد (UX-LANG-01) — مرجع واحد للتسميات المتكررة. */
export const lexicon = {
  accountingMovements: "حركة الحسابات",
  balanceReview: "مراجعة الأرصدة",
  accountRouting: "توجيه الحسابات",
  differenceSettlement: "تصفية الفروق",
  financialMonth: "الشهر المالي",
  financialMovement: "حركة مالية",
  needsReview: "حركات محتاجة مراجعة",
  accountsTree: "دليل الحسابات",
  reviewPack: "ملف المراجعة",
  openDifferences: "الفروق غير المصفّاة",
} as const;

/** نص بديل عام حين تصل قيمة غير معروفة — لا يُعرض كود خام إطلاقًا. */
function fallback(generic: string): string {
  return generic;
}

function lookup(map: Record<string, string>, value: unknown, generic: string): string {
  if (value === null || value === undefined || value === "") return "—";
  const key = String(value);
  return map[key] ?? fallback(generic);
}

/* ——— الطلبات ——— */

const ORDER_STATUS: Record<string, string> = {
  draft: "مسودة",
  submitted: "تم الإرسال",
  in_kitchen: "في المطبخ",
  ready: "جاهز",
  completed: "مكتمل",
  cancelled: "ملغي",
};
export const orderStatusLabel = (v: unknown) => lookup(ORDER_STATUS, v, "حالة أخرى");

const ORDER_TYPE: Record<string, string> = {
  dine_in: "صالة",
  takeaway: "تيك أواي",
  delivery: "دليفري",
};
export const orderTypeLabel = (v: unknown) => lookup(ORDER_TYPE, v, "نوع آخر");

const PAYMENT_METHOD: Record<string, string> = {
  cash: "نقدي",
  card: "بطاقة",
  wallet: "محفظة إلكترونية",
  unpaid: "غير مدفوع",
};
export const paymentMethodLabel = (v: unknown) => lookup(PAYMENT_METHOD, v, "طريقة أخرى");

/* ——— الطاولات والشيفتات ——— */

const TABLE_STATUS: Record<string, string> = {
  available: "متاحة",
  occupied: "مشغولة",
  reserved: "محجوزة",
  cleaning: "تنظيف",
};
export const tableStatusLabel = (v: unknown) => lookup(TABLE_STATUS, v, "حالة أخرى");

const SHIFT_STATUS: Record<string, string> = {
  open: "مفتوح",
  closed: "مغلق",
};
export const shiftStatusLabel = (v: unknown) => lookup(SHIFT_STATUS, v, "حالة أخرى");

/* ——— المخزون ——— */

const MOVEMENT_TYPE: Record<string, string> = {
  receipt: "استلام",
  issue: "صرف",
  adjustment: "تسوية رصيد",
  transfer_in: "تحويل وارد",
  transfer_out: "تحويل صادر",
  waste: "هالك",
  count_adjustment: "تسوية جرد",
  consumption: "استهلاك",
  reversal: "عكس حركة",
};
export const movementTypeLabel = (v: unknown) => lookup(MOVEMENT_TYPE, v, "حركة أخرى");

const MOVEMENT_SOURCE: Record<string, string> = {
  payment: "دفعة",
  purchase_receipt: "استلام مشتريات",
  stock_movement: "حركة مخزون",
  inventory_transfer: "تحويل مخزون",
  inventory_waste: "هالك مخزون",
  inventory_stock_count: "جرد مخزون",
  inventory_consumption_reversal: "عكس استهلاك",
  order_consumption: "استهلاك طلب",
  shift_cash_movement: "حركة نقدية بالشيفت",
  journal_entry: "قيد محاسبي",
  residual_settlement: "تصفية فروق",
  cp7_manual: "تسجيل يدوي",
};
export const movementSourceLabel = (v: unknown) => lookup(MOVEMENT_SOURCE, v, "مصدر آخر");

/* ——— الطباعة والأجهزة ——— */

const PRINT_STATUS: Record<string, string> = {
  pending: "بالانتظار",
  printing: "جارٍ الطباعة",
  printed: "تمت الطباعة",
  failed: "فشلت",
  cancelled: "ملغاة",
};
export const printStatusLabel = (v: unknown) => lookup(PRINT_STATUS, v, "حالة أخرى");

/** القيم الفعلية المسجّلة للأجهزة (devices.type). */
const DEVICE_TYPE: Record<string, string> = {
  pos: "جهاز كاشير",
  kds: "شاشة مطبخ",
  waiter: "جهاز ويتر",
  customer_display: "شاشة عميل",
  kitchen_printer: "طابعة مطبخ",
  receipt_printer: "طابعة إيصالات",
};
export const deviceTypeLabel = (v: unknown) => lookup(DEVICE_TYPE, v, "جهاز آخر");

/** القيم الفعلية للأجهزة الطرفية (hardware_endpoints.kind). */
const HARDWARE_KIND: Record<string, string> = {
  receipt_printer: "طابعة إيصالات",
  kitchen_printer: "طابعة مطبخ",
  cash_drawer: "درج نقدية",
  customer_display: "شاشة عميل",
  barcode_scanner: "قارئ باركود",
};
export const hardwareKindLabel = (v: unknown) => lookup(HARDWARE_KIND, v, "نوع آخر");

/** القيم الفعلية للتطبيقات المرتبطة (api_clients.kind). */
const CLIENT_KIND: Record<string, string> = {
  website: "الموقع الإلكتروني",
  qr: "الطلب بالمسح الضوئي",
  mobile: "تطبيق الموبايل",
  bridge: "وسيط الطباعة",
  other: "أخرى",
};
export const clientKindLabel = (v: unknown) => lookup(CLIENT_KIND, v, "نوع آخر");

/* ——— الحسابات (جاهزة لشاشات الحسابات) ——— */

const FINANCIAL_EVENT_STATUS: Record<string, string> = {
  pending: "بالانتظار",
  processing: "جارٍ المعالجة",
  posted: "مُسجّلة",
  failed: "لم تُسجّل",
  dead: "متوقفة",
  pending_policy: "بانتظار قاعدة",
  deferred_rounding: "فرق مؤجل",
  non_posting: "بلا أثر محاسبي",
  reconciled: "مُصفّاة",
};
export const financialEventStatusLabel = (v: unknown) => lookup(FINANCIAL_EVENT_STATUS, v, "حالة أخرى");

const ACCOUNT_TYPE: Record<string, string> = {
  asset: "أصل",
  liability: "التزام",
  equity: "حقوق ملكية",
  revenue: "إيراد",
  expense: "مصروف",
};
export const accountTypeLabel = (v: unknown) => lookup(ACCOUNT_TYPE, v, "نوع آخر");

const PERIOD_STATUS: Record<string, string> = {
  open: "مفتوح",
  locked: "مقفول",
};
export const periodStatusLabel = (v: unknown) => lookup(PERIOD_STATUS, v, "حالة أخرى");

const RESIDUAL_STATUS: Record<string, string> = {
  open: "غير مصفّى",
  settled: "مُصفّى",
  reversed: "معكوس",
};
export const residualStatusLabel = (v: unknown) => lookup(RESIDUAL_STATUS, v, "حالة أخرى");

/**
 * نوع الحركة المالية (financial_events.event_type / journal_entries.event_type).
 * القيم تقنية بنقطة فاصلة مثل `payment.captured` — لا تظهر للمستخدم أبدًا.
 */
const FINANCIAL_EVENT_TYPE: Record<string, string> = {
  // الطلبات والدفع
  "payment.captured": "تحصيل دفعة",
  "refund.posted": "استرداد مبلغ",
  "cash.movement": "حركة نقدية",
  // المخزون (inventoryService.eventTypes)
  "inventory.receipt": "استلام مخزون",
  "inventory.issue": "صرف مخزون",
  "inventory.adjustment": "تسوية مخزون",
  "inventory.transfer": "تحويل مخزون",
  "inventory.waste": "هالك مخزون",
  "inventory.consumption": "استهلاك مخزون",
  "inventory.reversal": "عكس حركة مخزون",
  // الحسابات
  "journal.reversal": "عكس قيد",
  "residual.settlement": "تصفية فروق",
  consume: "استهلاك مخزون",
  reverse: "عكس حركة",
  "test.manual": "حركة اختبار",
};
export const financialEventTypeLabel = (v: unknown) => lookup(FINANCIAL_EVENT_TYPE, v, "حركة أخرى");

/** مكوّن سطر القيد (journal_lines.component). */
const JOURNAL_LINE_COMPONENT: Record<string, string> = {
  revenue: "إيراد",
  tender: "تحصيل",
  vat: "ضريبة القيمة المضافة",
  debit: "مدين",
  credit: "دائن",
};
export const journalLineComponentLabel = (v: unknown) => lookup(JOURNAL_LINE_COMPONENT, v, "مكوّن آخر");

/** سياسة الاعتراف بالإيراد (accounting_settings.revenue_recognition). */
const REVENUE_RECOGNITION: Record<string, string> = {
  on_payment: "عند إتمام الطلب/الدفع",
};
export const revenueRecognitionLabel = (v: unknown) => lookup(REVENUE_RECOGNITION, v, "سياسة أخرى");

/** بُعد قاعدة التوجيه (accounting_mappings.dimension_key). */
const MAPPING_DIMENSION: Record<string, string> = {
  default: "الافتراضي",
  cash: "نقدي",
  card: "بطاقة",
  wallet: "محفظة إلكترونية",
};
export const mappingDimensionLabel = (v: unknown) => lookup(MAPPING_DIMENSION, v, "بُعد آخر");

/* ——— سجل العمليات ——— */

/**
 * إجراءات سجل العمليات: تُعرض بجملة عربية مفهومة بدل المفتاح التقني
 * (مثل `accounting.journal.reverse`). أي إجراء غير معروف يظهر كوصف عام.
 */
const AUDIT_ACTION: Record<string, string> = {
  // الدخول والحسابات
  "auth.login": "تسجيل دخول",
  "auth.login_failed": "محاولة دخول فاشلة",
  "auth.pin_login": "دخول برمز سريع",
  "auth.pin_failed": "محاولة دخول برمز سريع فاشلة",
  // المستخدمون والأدوار
  "user.create": "إضافة مستخدم",
  "user.update": "تعديل مستخدم",
  "role.create": "إضافة دور",
  "role.update": "تعديل دور",
  "role.delete": "حذف دور",
  "role.duplicate": "نسخ دور",
  // الفروع والإعدادات
  "branch.create": "إضافة فرع",
  "branch.update": "تعديل فرع",
  "settings.update": "تعديل الإعدادات",
  "settings.logo_upload": "رفع الشعار",
  "settings.logo_remove": "إزالة الشعار",
  // المنيو
  "category.create": "إضافة قسم",
  "product.create": "إضافة صنف",
  "product.delete": "حذف صنف",
  "product.image_upload": "رفع صورة صنف",
  "menu.import": "استيراد منيو",
  "menu.import_excel": "استيراد منيو من ملف",
  // الطلبات والدفع
  "order.create": "إنشاء طلب",
  "order.cancelled": "إلغاء طلب",
  "order.assign_driver": "تعيين سائق",
  "order.print_receipt": "طباعة إيصال",
  "payment.record": "تسجيل دفعة",
  "payment.refund": "استرداد مبلغ",
  "payment.refund_on_cancel": "استرداد عند الإلغاء",
  "order_source.create": "إضافة مصدر طلبات",
  "order_source.update": "تعديل مصدر طلبات",
  "order_source.menu_update": "تعديل منيو مصدر الطلبات",
  // الشيفت
  "shift.open": "فتح شيفت",
  "shift.close": "إغلاق شيفت",
  "shift.cash_in": "إيداع نقدية",
  "shift.cash_out": "سحب نقدية",
  "shift.print_report": "طباعة تقرير شيفت",
  // المطبخ
  "kitchen.paused": "إيقاف المطبخ مؤقتًا",
  "kitchen.resumed": "استئناف المطبخ",
  "kitchen.order_held": "تعليق طلب",
  "kitchen.order_resumed": "استئناف طلب",
  "kitchen.transition_blocked_by_pause": "تعذّر تحديث طلب (المطبخ متوقف)",
  "kitchen.transition_blocked_by_hold": "تعذّر تحديث طلب (الطلب معلّق)",
  // المخزون
  "inventory.movement.create": "تسجيل حركة مخزون",
  "inventory.consumption.reverse": "عكس استهلاك مخزون",
  // الحسابات
  "accounting.events.process": "معالجة الحركات المالية",
  "accounting.event.retry": "إعادة محاولة حركة مالية",
  "accounting.event.mark_dead": "إيقاف حركة مالية",
  "accounting.journal.reverse": "عكس قيد",
  "accounting.period.lock": "إقفال الشهر المالي",
  "accounting.period.open": "إعادة فتح الشهر المالي",
  "accounting.account.create": "إضافة حساب",
  "accounting.account.update": "تعديل حساب",
  "accounting.mapping.create": "إضافة قاعدة توجيه",
  "accounting.mapping.update": "تعديل قاعدة توجيه",
  "accounting.reconciliation.settle": "تصفية الفروق",
  "accounting.settings.update": "تعديل إعدادات الحسابات",
  // الأجهزة والطباعة والتكامل
  "device.register": "تسجيل جهاز",
  "device_profile.create": "إضافة إعداد جهاز",
  "hardware_endpoint.create": "إضافة جهاز طرفي",
  "print_job.create": "إرسال أمر طباعة",
  "print_job.requeue_stuck": "إعادة جدولة أوامر الطباعة",
  "api_client.create": "إضافة تطبيق مرتبط",
  "api_token.create": "إصدار مفتاح وصول",
  "api_token.revoke": "إلغاء مفتاح وصول",
  // عامة
  create: "إضافة",
  update: "تعديل",
  error: "خطأ",
};
export const auditActionLabel = (v: unknown) => lookup(AUDIT_ACTION, v, "إجراء آخر");

/* ——— الصلاحيات والأدوار ——— */

const PERMISSION_GROUP: Record<string, string> = {
  dashboard: "لوحة التحكم",
  pos: "نقطة البيع",
  orders: "الطلبات",
  menu: "المنيو",
  kitchen: "المطبخ",
  customers: "العملاء",
  delivery: "التوصيل",
  shifts: "الورديات",
  reports: "التقارير",
  settings: "الإعدادات",
  users: "المستخدمون",
  roles: "الأدوار",
  devices: "الأجهزة",
  printing: "الطباعة",
  audit: "سجل العمليات",
  hardware: "الأجهزة الطرفية",
  api: "التطبيقات المرتبطة",
  integrations: "التكاملات",
  inventory: "المخزون",
  accounting: "الحسابات",
};

/** يحتوي حروفًا عربية؟ (الـAPI يرسل بعض المجموعات معرّبة أصلًا). */
function hasArabic(value: string): boolean {
  return /[؀-ۿ]/.test(value);
}

/**
 * أسماء الصلاحيات بالعربية — تقابل كتالوج الخادم (`PERMISSIONS.name_ar`).
 * تُستخدم حين نحتاج ذكر صلاحية في جملة موجّهة للمستخدم، بدل طبع المفتاح
 * التقني مثل `accounting.manage` على الشاشة.
 */
const PERMISSION: Record<string, string> = {
  "users.manage": "إدارة المستخدمين",
  "roles.manage": "إدارة الأدوار والصلاحيات",
  "permissions.manage": "إدارة خريطة الصلاحيات",
  "branches.manage": "إدارة الفروع",
  "devices.manage": "إدارة الأجهزة",
  "hardware.manage": "إدارة الأجهزة الطرفية",
  "print_jobs.create": "إنشاء أوامر الطباعة",
  "print_jobs.manage": "إدارة أوامر الطباعة",
  "cash_drawer.open": "فتح درج النقدية",
  "audit.view": "عرض سجل العمليات",
  "api_clients.manage": "إدارة التطبيقات المرتبطة",
  "menu.manage": "إدارة المنيو",
  "products.edit": "تعديل الأصناف والأسعار",
  "products.disable": "إيقاف الأصناف",
  "orders.create": "إنشاء الطلبات",
  "orders.manage": "إدارة الطلبات وحالاتها",
  "orders.cancel": "إلغاء الطلبات",
  "orders.refund": "استرداد المدفوعات",
  "orders.discount_above_limit": "اعتماد خصم فوق حد الكاشير",
  "orders.delete_item_after_submit": "حذف صنف بعد إرسال المطبخ",
  "payments.record": "تسجيل المدفوعات",
  "shifts.manage": "إدارة الشيفت والنقدية",
  "kitchen.view": "عرض شاشة المطبخ",
  "kitchen.update": "تحديث حالة المطبخ",
  "kitchen.manage": "إيقاف واستئناف المطبخ",
  "tables.manage": "إدارة الطاولات",
  "customers.view": "عرض العملاء",
  "customers.lookup": "البحث عن العملاء من نقطة البيع",
  "customers.manage": "إدارة العملاء",
  "drivers.manage": "إدارة السائقين",
  "delivery.assign": "تعيين سائق للطلبات",
  "reports.view": "عرض التقارير",
  "settings.view": "عرض الإعدادات",
  "settings.manage": "إدارة الإعدادات",
  "inventory.view": "عرض المخزون",
  "inventory.manage": "إدارة المخزون",
  "accounting.view": `عرض ${lexicon.accountingMovements}`,
  "accounting.manage": `إدارة ${lexicon.accountingMovements}`,
};

/** اسم الصلاحية بالعربية — لا يُعرض مفتاح تقني للمستخدم أبدًا. */
export function permissionLabel(v: unknown): string {
  if (v === null || v === undefined || v === "") return "صلاحية أخرى";
  const key = String(v);
  return PERMISSION[key] ?? (hasArabic(key) ? key : "صلاحية أخرى");
}

/** اسم مجموعة الصلاحيات — لا يُعرض مفتاح إنجليزي للمستخدم أبدًا. */
export function permissionGroupLabel(v: unknown): string {
  if (v === null || v === undefined || v === "") return "أخرى";
  const key = String(v);
  return PERMISSION_GROUP[key] ?? (hasArabic(key) ? key : "أخرى");
}

const ROLE: Record<string, string> = {
  owner: "المالك",
  admin: "مدير النظام",
  manager: "المدير",
  cashier: "الكاشير",
  waiter: "الويتر",
  kitchen: "موظف المطبخ",
  inventory_clerk: "مسؤول المخزون",
  accountant: "المحاسب",
  driver: "السائق",
  integrations_admin: "مسؤول التكاملات",
};

/** اسم الدور — يُفضّل الاسم القادم من الخادم، ثم الخريطة، ثم وصف عام. */
export function roleLabel(key: unknown, nameAr?: string | null): string {
  if (nameAr && hasArabic(nameAr)) return nameAr;
  if (key === null || key === undefined || key === "") return "دور آخر";
  const value = String(key);
  return ROLE[value] ?? (hasArabic(value) ? value : "دور آخر");
}

/** أنواع السجلات في سجل العمليات (entity_type). */
const ENTITY_TYPE: Record<string, string> = {
  user: "مستخدم",
  role: "دور",
  branch: "فرع",
  settings: "الإعدادات",
  product: "صنف",
  category: "قسم",
  order: "طلب",
  payment: "دفعة",
  shift: "شيفت",
  device: "جهاز",
  print_job: "أمر طباعة",
  api_client: "تطبيق مرتبط",
  stock_movement: "حركة مخزون",
  financial_event: "حركة مالية",
  journal_entry: "قيد محاسبي",
  accounting_period: "شهر مالي",
  accounting_account: "حساب",
  accounting_mapping: "قاعدة توجيه",
  accounting_settings: "إعدادات الحسابات",
  financial_event_reconciliation: "فرق محاسبي",
};
export const entityTypeLabel = (v: unknown) => lookup(ENTITY_TYPE, v, "سجل آخر");
