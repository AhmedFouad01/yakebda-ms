import { Knex } from "knex";
import bcrypt from "bcryptjs";
import { newId } from "../lib/ids";

export const PERMISSIONS: Array<{ key: string; name_ar: string; group: string }> = [
  { key: "users.manage", name_ar: "إدارة المستخدمين", group: "المستخدمون" },
  { key: "roles.manage", name_ar: "إدارة الأدوار والصلاحيات", group: "المستخدمون" },
  { key: "branches.manage", name_ar: "إدارة الفروع", group: "الفروع" },
  { key: "devices.manage", name_ar: "إدارة الأجهزة", group: "الأجهزة" },
  { key: "hardware.manage", name_ar: "إدارة الهاردوير ونقاط الاتصال", group: "الأجهزة" },
  { key: "print_jobs.create", name_ar: "إنشاء مهام طباعة", group: "الطباعة" },
  { key: "print_jobs.manage", name_ar: "إدارة طابور الطباعة", group: "الطباعة" },
  { key: "cash_drawer.open", name_ar: "فتح درج الكاش", group: "الطباعة" },
  { key: "audit.view", name_ar: "عرض سجل العمليات", group: "الأمان" },
  { key: "api_clients.manage", name_ar: "إدارة عملاء API والرموز", group: "التكاملات" },
  { key: "menu.manage", name_ar: "إدارة المنيو", group: "المنيو" },
  { key: "orders.create", name_ar: "إنشاء الطلبات", group: "الطلبات" },
  { key: "orders.manage", name_ar: "إدارة الطلبات وحالاتها", group: "الطلبات" },
  { key: "payments.record", name_ar: "تسجيل المدفوعات", group: "الطلبات" },
  { key: "shifts.manage", name_ar: "إدارة الشيفت والكاش", group: "الشيفتات" },
  { key: "kitchen.view", name_ar: "عرض شاشة المطبخ", group: "المطبخ" },
  { key: "kitchen.update", name_ar: "تحديث حالة المطبخ", group: "المطبخ" },
  { key: "tables.manage", name_ar: "إدارة الطاولات", group: "الطاولات" },
  { key: "customers.manage", name_ar: "إدارة العملاء", group: "العملاء" },
  { key: "reports.view", name_ar: "عرض التقارير", group: "التقارير" },
  { key: "settings.manage", name_ar: "إدارة الإعدادات", group: "الإعدادات" },
  { key: "orders.cancel", name_ar: "إلغاء الطلبات", group: "الطلبات" },
  { key: "orders.discount_above_limit", name_ar: "اعتماد خصم فوق حد الكاشير", group: "الطلبات" },
  { key: "orders.refund", name_ar: "استرداد المدفوعات (لاحقًا)", group: "الطلبات" },
  { key: "orders.delete_item_after_submit", name_ar: "حذف صنف بعد إرسال المطبخ (لاحقًا)", group: "الطلبات" },
  { key: "products.edit", name_ar: "تعديل الأصناف والأسعار", group: "المنيو" },
  { key: "products.disable", name_ar: "إيقاف الأصناف", group: "المنيو" },
  { key: "drivers.manage", name_ar: "إدارة السائقين", group: "التوصيل" },
  { key: "delivery.assign", name_ar: "تعيين سائق للطلبات", group: "التوصيل" },
  { key: "permissions.manage", name_ar: "إدارة خريطة الصلاحيات", group: "المستخدمون" },
];

export const ROLES: Array<{ key: string; name_ar: string; perms: string[] | "all" }> = [
  { key: "owner", name_ar: "المالك", perms: "all" },
  {
    key: "manager",
    name_ar: "المدير",
    perms: [
      "users.manage",
      "branches.manage",
      "devices.manage",
      "hardware.manage",
      "print_jobs.create",
      "print_jobs.manage",
      "cash_drawer.open",
      "audit.view",
      "menu.manage",
      "orders.create",
      "orders.manage",
      "payments.record",
      "shifts.manage",
      "kitchen.view",
      "kitchen.update",
      "tables.manage",
      "customers.manage",
      "reports.view",
      "settings.manage",
      "orders.cancel",
      "orders.discount_above_limit",
      "orders.refund",
      "orders.delete_item_after_submit",
      "products.edit",
      "products.disable",
      "drivers.manage",
      "delivery.assign",
    ],
  },
  {
    key: "cashier",
    name_ar: "الكاشير",
    perms: ["print_jobs.create", "orders.create", "orders.manage", "payments.record", "shifts.manage", "customers.manage", "reports.view"],
  },
  { key: "waiter", name_ar: "الويتر", perms: ["orders.create", "tables.manage"] },
  { key: "kitchen", name_ar: "موظف المطبخ", perms: ["kitchen.view", "kitchen.update"] },
  { key: "inventory_clerk", name_ar: "مسؤول المخزون", perms: [] },
  { key: "accountant", name_ar: "المحاسب", perms: ["audit.view", "reports.view"] },
  { key: "driver", name_ar: "سائق", perms: [] },
  { key: "admin", name_ar: "أدمن النظام", perms: "all" },
  { key: "integrations_admin", name_ar: "مسؤول التكاملات", perms: ["api_clients.manage", "audit.view"] },
];

/**
 * YKMS-02F — مزامنة علاجية idempotent:
 * تُدخل أي صلاحيات ناقصة من الكتالوج وتمنح أدوار owner/admin كل الصلاحيات
 * في كل الحسابات. آمنة على البيانات وتعمل على قواعد قديمة وجديدة.
 */
export async function syncPermissionCatalog(db: Knex): Promise<void> {
  for (const p of PERMISSIONS) {
    await db("permissions").insert(p).onConflict("key").ignore();
  }
  const fullRoles = await db("roles").whereIn("key", ["owner", "admin"]);
  for (const role of fullRoles) {
    for (const p of PERMISSIONS) {
      await db("role_permissions")
        .insert({ role_id: role.id, permission_key: p.key })
        .onConflict(["role_id", "permission_key"])
        .ignore();
    }
  }
}

export interface SeedResult {
  accountId: string;
  branchId: string;
  branch2Id?: string;
  ownerEmail: string;
  ownerPassword: string;
}

/** Seed a demo account with an owner, roles and one branch. Idempotent-ish for dev. */
export async function seedFoundation(db: Knex): Promise<SeedResult> {
  const existing = await db("accounts").first();
  const ownerEmail = "owner@ykms.local";
  const ownerPassword = "Owner@12345";
  if (existing) {
    const branch = await db("branches").where({ account_id: existing.id }).first();
    return { accountId: existing.id, branchId: branch?.id, ownerEmail, ownerPassword };
  }

  const accountId = newId();
  await db("accounts").insert({ id: accountId, name: "يا كبدة" });

  const branchId = newId();
  await db("branches").insert({
    id: branchId,
    account_id: accountId,
    name: "فرع رئيسي",
    address: "القاهرة",
    timezone: "Africa/Cairo",
  });

  const branch2Id = newId();
  await db("branches").insert({
    id: branch2Id,
    account_id: accountId,
    name: "فرع تجريبي",
    address: "الجيزة",
    timezone: "Africa/Cairo",
  });

  await db("permissions")
    .insert(PERMISSIONS)
    .onConflict("key")
    .ignore();

  const roleIds: Record<string, string> = {};
  for (const r of ROLES) {
    const id = newId();
    roleIds[r.key] = id;
    await db("roles").insert({
      id,
      account_id: accountId,
      key: r.key,
      name_ar: r.name_ar,
      is_system: true,
    });
    const perms = r.perms === "all" ? PERMISSIONS.map((p) => p.key) : r.perms;
    if (perms.length) {
      await db("role_permissions").insert(
        perms.map((p) => ({ role_id: id, permission_key: p }))
      );
    }
  }

  const ownerId = newId();
  await db("users").insert({
    id: ownerId,
    account_id: accountId,
    name: "المالك",
    email: ownerEmail,
    password_hash: bcrypt.hashSync(ownerPassword, 10),
  });
  await db("user_roles").insert({ user_id: ownerId, role_id: roleIds["owner"] });

  const cashierId = newId();
  await db("users").insert({
    id: cashierId,
    account_id: accountId,
    branch_id: branchId,
    name: "كاشير تجريبي",
    pin_hash: bcrypt.hashSync("1234", 10),
  });
  await db("user_roles").insert({ user_id: cashierId, role_id: roleIds["cashier"] });

  const managerId = newId();
  await db("users").insert({
    id: managerId,
    account_id: accountId,
    branch_id: branchId,
    name: "مدير الفرع",
    email: "manager@ykms.local",
    password_hash: bcrypt.hashSync("Manager@12345", 10),
  });
  await db("user_roles").insert({ user_id: managerId, role_id: roleIds["manager"] });

  const kitchenId = newId();
  await db("users").insert({
    id: kitchenId,
    account_id: accountId,
    branch_id: branchId,
    name: "موظف المطبخ",
    email: "kitchen@ykms.local",
    password_hash: bcrypt.hashSync("Kitchen@12345", 10),
  });
  await db("user_roles").insert({ user_id: kitchenId, role_id: roleIds["kitchen"] });

  await seedMvp(db, { accountId, branchId, branch2Id, cashierId });

  return { accountId, branchId, branch2Id, ownerEmail, ownerPassword };
}

/** YKMS-02 — Demo menu, tables, customers, hardware and sample orders for يا كبدة. */
export async function seedMvp(
  db: Knex,
  ctx: { accountId: string; branchId: string; branch2Id: string; cashierId: string }
): Promise<void> {
  const { accountId, branchId, branch2Id, cashierId } = ctx;

  // --- Categories ---
  const catNames = ["ساندوتشات", "أطباق", "إضافات", "مشروبات", "وجبات"];
  const cats: Record<string, string> = {};
  for (let i = 0; i < catNames.length; i++) {
    const id = newId();
    cats[catNames[i]] = id;
    await db("categories").insert({ id, account_id: accountId, name_ar: catNames[i], sort_order: i });
  }

  // --- Modifier groups + modifiers ---
  const gExtras = newId();
  await db("modifier_groups").insert({
    id: gExtras,
    account_id: accountId,
    name_ar: "إضافات الساندوتش",
    min_select: 0,
    max_select: 4,
    sort_order: 0,
  });
  const gSauce = newId();
  await db("modifier_groups").insert({
    id: gSauce,
    account_id: accountId,
    name_ar: "الشطة والصوص",
    min_select: 0,
    max_select: 2,
    sort_order: 1,
  });
  const modOf: Record<string, string> = {};
  const mods: Array<[string, string, number]> = [
    [gSauce, "شطة", 0],
    [gSauce, "طحينة", 2],
    [gSauce, "بدون شطة", 0],
    [gExtras, "مخلل زيادة", 3],
    [gExtras, "عيش زيادة", 2],
    [gExtras, "جبنة", 5],
  ];
  for (const [gid, name, delta] of mods) {
    const id = newId();
    modOf[name] = id;
    await db("modifiers").insert({ id, modifier_group_id: gid, name_ar: name, price_delta: delta });
  }

  // --- Products ---
  const productDefs: Array<{ cat: string; name: string; price: number; variants?: Array<[string, number]>; groups?: string[] }> = [
    { cat: "ساندوتشات", name: "ساندوتش كبدة", price: 25, variants: [["صغير", 0], ["كبير", 10]], groups: [gSauce, gExtras] },
    { cat: "ساندوتشات", name: "ساندوتش سجق", price: 27, variants: [["صغير", 0], ["كبير", 10]], groups: [gSauce, gExtras] },
    { cat: "ساندوتشات", name: "ساندوتش كبدة ميكس", price: 30, groups: [gSauce, gExtras] },
    { cat: "أطباق", name: "طبق كبدة", price: 60, variants: [["ربع كيلو", 0], ["نص كيلو", 45]], groups: [gSauce] },
    { cat: "إضافات", name: "بطاطس", price: 15 },
    { cat: "إضافات", name: "مخلل", price: 5 },
    { cat: "مشروبات", name: "بيبسي", price: 10 },
    { cat: "مشروبات", name: "مياه", price: 5 },
    { cat: "وجبات", name: "وجبة كبدة كاملة", price: 75, groups: [gSauce, gExtras] },
  ];
  const prodOf: Record<string, string> = {};
  const varOf: Record<string, string> = {};
  let sort = 0;
  for (const p of productDefs) {
    const id = newId();
    prodOf[p.name] = id;
    await db("products").insert({
      id,
      account_id: accountId,
      category_id: cats[p.cat],
      name_ar: p.name,
      base_price: p.price,
      sort_order: sort++,
    });
    for (const [vname, delta] of p.variants ?? []) {
      const vid = newId();
      varOf[`${p.name}/${vname}`] = vid;
      await db("product_variants").insert({ id: vid, product_id: id, name_ar: vname, price_delta: delta });
    }
    if (p.groups?.length) {
      await db("product_modifier_groups").insert(
        p.groups.map((gid, i) => ({ product_id: id, modifier_group_id: gid, sort_order: i }))
      );
    }
  }

  // Branch pricing + availability samples (فرع تجريبي)
  await db("branch_product_prices").insert({
    branch_id: branch2Id,
    product_id: prodOf["ساندوتش كبدة"],
    price_override: 28,
  });
  await db("branch_product_availability").insert({
    branch_id: branch2Id,
    product_id: prodOf["طبق كبدة"],
    is_available: false,
    availability_note_ar: "غير متاح مؤقتًا",
  });

  // --- Tables ---
  const tableIds: string[] = [];
  for (let i = 1; i <= 6; i++) {
    const id = newId();
    tableIds.push(id);
    await db("dining_tables").insert({ id, branch_id: branchId, name_ar: `طاولة ${i}`, seats: i <= 4 ? 4 : 6 });
  }

  // --- Customers ---
  const customerId = newId();
  await db("customers").insert({
    id: customerId,
    account_id: accountId,
    name: "أحمد محمد",
    phone: "01000000001",
    address: "مدينة العبور — الحي الأول",
  });
  await db("customers").insert({
    id: newId(),
    account_id: accountId,
    name: "محمود علي",
    phone: "01000000002",
    address: "القاهرة — مدينة نصر",
  });

  // --- YKMS-02E: محطات التحضير الافتراضية ---
  const stationIds: Record<string, string> = {};
  const stations = ["جريل", "قلاية", "تجهيز", "مشروبات"];
  for (let i = 0; i < stations.length; i++) {
    const sid = newId();
    stationIds[stations[i]] = sid;
    await db("prep_stations").insert({ id: sid, account_id: accountId, name_ar: stations[i], sort_order: i });
  }
  // ربط افتراضي: البطاطس/فواتح الشهية → قلاية، مشروبات → مشروبات، الحواوشي/ساندوتشات/أطباق/وجبات → جريل، إضافات → تجهيز
  const catStation: Record<string, string> = {
    "ساندوتشات": "جريل",
    "أطباق": "جريل",
    "وجبات": "جريل",
    "الحواوشي": "جريل",
    "البطاطس": "قلاية",
    "فواتح الشهية": "قلاية",
    "إضافات": "تجهيز",
    "مشروبات": "مشروبات",
  };
  for (const [catName, stName] of Object.entries(catStation)) {
    await db("categories")
      .where({ account_id: accountId, name_ar: catName })
      .update({ default_prep_station_id: stationIds[stName] });
  }

  // --- Default settings (account-level rows; باقي القيم الافتراضية تعيش في الكود) ---
  for (const [key, value] of Object.entries({
    restaurant_name: "يا كبدة",
    brand_name_ar: "يا كبدة",
    currency: "EGP",
  })) {
    await db("settings")
      .insert({
        id: newId(),
        account_id: accountId,
        branch_id: null,
        key,
        value: JSON.stringify(value),
      })
      .onConflict(["account_id", "branch_id", "key"])
      .ignore();
  }

  // --- POS device + receipt printer for the main branch ---
  const posDeviceId = newId();
  await db("devices").insert({
    id: posDeviceId,
    account_id: accountId,
    branch_id: branchId,
    name: "كاشير 1",
    type: "pos",
    platform: "windows",
  });
  await db("hardware_endpoints").insert({
    id: newId(),
    branch_id: branchId,
    device_id: posDeviceId,
    name: "طابعة الإيصالات الرئيسية",
    kind: "receipt_printer",
    connection: "usb",
    protocol: "escpos",
  });

  // --- Operational open shift for cashier demo ---
  const shiftId = newId();
  await db("shifts").insert({
    id: shiftId,
    account_id: accountId,
    branch_id: branchId,
    cashier_user_id: cashierId,
    opening_cash: 500,
    status: "open",
    notes: "شيفت تجريبي مفتوح للتشغيل السريع",
  });
  await db("shift_cash_movements").insert({
    id: newId(),
    shift_id: shiftId,
    type: "cash_in",
    amount: 50,
    reason: "عهدة فكة إضافية",
    created_by: cashierId,
  });

  // --- Sample orders (one completed+paid, one in kitchen, one delivery draft->submitted) ---
  async function sampleOrder(opts: {
    orderNo: number;
    type: string;
    status: string;
    items: Array<{ name: string; qty: number; variant?: string; mods?: string[] }>;
    payment?: { method: string };
    tableId?: string;
    customerId?: string;
    deliveryFee?: number;
  }) {
    const orderId = newId();
    let subtotal = 0;
    const lineRows: Array<Record<string, unknown>> = [];
    const modRows: Array<Record<string, unknown>> = [];
    for (const it of opts.items) {
      const pid = prodOf[it.name];
      const prod = productDefs.find((p) => p.name === it.name)!;
      const vKey = it.variant ? `${it.name}/${it.variant}` : null;
      const vDelta = it.variant ? (prod.variants!.find((v) => v[0] === it.variant)![1]) : 0;
      const mDelta = (it.mods ?? []).reduce((s, m) => s + mods.find((x) => x[1] === m)![2], 0);
      const unit = prod.price + vDelta + mDelta;
      const line = unit * it.qty;
      subtotal += line;
      const itemId = newId();
      lineRows.push({
        id: itemId,
        order_id: orderId,
        product_id: pid,
        variant_id: vKey ? varOf[vKey] : null,
        name_ar: it.name,
        variant_name_ar: it.variant ?? null,
        qty: it.qty,
        unit_price: unit,
        line_total: line,
      });
      for (const m of it.mods ?? []) {
        modRows.push({
          id: newId(),
          order_item_id: itemId,
          modifier_id: modOf[m],
          name_ar: m,
          price_delta: mods.find((x) => x[1] === m)![2],
        });
      }
    }
    const deliveryFee = opts.deliveryFee ?? 0;
    await db("orders").insert({
      id: orderId,
      account_id: accountId,
      branch_id: branchId,
      order_no: opts.orderNo,
      order_type: opts.type,
      status: opts.status,
      table_id: opts.tableId ?? null,
      customer_id: opts.customerId ?? null,
      delivery_fee: deliveryFee,
      subtotal,
      discount: 0,
      total: subtotal + deliveryFee,
      created_by: cashierId,
      submitted_at: db.fn.now(),
      completed_at: opts.status === "completed" ? db.fn.now() : null,
    });
    await db("order_items").insert(lineRows);
    if (modRows.length) await db("order_item_modifiers").insert(modRows);
    await db("order_status_history").insert({
      id: newId(),
      order_id: orderId,
      from_status: null,
      to_status: opts.status,
      changed_by: cashierId,
    });
    if (opts.payment) {
      await db("payments").insert({
        id: newId(),
        order_id: orderId,
        branch_id: branchId,
        method: opts.payment.method,
        amount: subtotal + deliveryFee,
        received_by: cashierId,
        shift_id: opts.payment.method === "cash" ? shiftId : null,
      });
    }
    if (opts.tableId) {
      await db("dining_tables").where({ id: opts.tableId }).update({ status: "occupied" });
    }
  }

  await sampleOrder({
    orderNo: 1,
    type: "takeaway",
    status: "completed",
    items: [
      { name: "ساندوتش كبدة", qty: 2, variant: "كبير", mods: ["شطة", "جبنة"] },
      { name: "بيبسي", qty: 2 },
    ],
    payment: { method: "cash" },
  });
  await sampleOrder({
    orderNo: 2,
    type: "dine_in",
    status: "in_kitchen",
    tableId: tableIds[0],
    items: [
      { name: "طبق كبدة", qty: 1, variant: "نص كيلو", mods: ["طحينة"] },
      { name: "بطاطس", qty: 1 },
      { name: "مياه", qty: 2 },
    ],
  });
  await sampleOrder({
    orderNo: 3,
    type: "delivery",
    status: "submitted",
    customerId,
    deliveryFee: 10,
    items: [{ name: "وجبة كبدة كاملة", qty: 1, mods: ["بدون شطة"] }],
    payment: { method: "card" },
  });
}
