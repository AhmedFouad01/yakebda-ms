import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { t } from "../lib/t";
import { useMe } from "../lib/me";

/**
 * YKMS-02E — الإعدادات: مصدر الحقيقة التشغيلي.
 * أقسام حسب وثيقة docs/YKMS-02E_Settings_Architecture_AR.md.
 * كل ما هو placeholder معلَّم بوضوح «لاحقًا» ولا يدّعي عملًا غير موجود.
 */

interface Settings {
  [k: string]: unknown;
  restaurant_name: string;
  restaurant_name_en: string;
  system_display_name: string;
  address: string;
  phone: string;
  tax_number: string;
  logo_url: string;
  brand_primary_color: string;
  brand_secondary_color: string;
  default_language: "ar" | "en";
  rtl_enabled: boolean;
  currency: string;
  timezone: string;
  receipt_footer: string;
  vat_enabled: boolean;
  vat_percentage: number;
  prices_include_vat: boolean;
  service_fee_enabled: boolean;
  service_fee_type: "percent" | "fixed";
  service_fee_value: number;
  default_delivery_fee: number;
  min_delivery_order: number;
  rounding_rule: "none" | "nearest_050" | "nearest_1";
  receipt_tax_display: "combined" | "detailed";
  order_type_takeaway_enabled: boolean;
  order_type_delivery_enabled: boolean;
  order_type_dine_in_enabled: boolean;
  online_orders_enabled: boolean;
  require_customer_for_delivery: boolean;
  require_address_for_delivery: boolean;
  require_driver_for_delivery: boolean;
  order_number_prefix: string;
  order_type_letter_prefix: boolean;
  order_daily_reset: boolean;
  order_starting_number: number;
  branch_specific_numbering: boolean;
  approval_delete_item_after_kitchen: boolean;
  approval_cancel_order: boolean;
  approval_discount_above_limit: boolean;
  approval_refund: boolean;
  approval_open_cash_drawer: boolean;
  show_product_images: boolean;
  enabled_payment_methods: string[];
  allow_discounts: boolean;
  max_discount_without_manager: number;
  max_cashier_discount_percent: number;
  discount_reason_required: boolean;
  offers_combo_enabled: boolean;
  offers_buy_x_get_y_enabled: boolean;
  offers_happy_hour_enabled: boolean;
  offers_scheduled_enabled: boolean;
  kds_enabled: boolean;
  kitchen_ticket_enabled: boolean;
  default_prep_time_minutes: number;
  kds_warning_minutes: number;
  kds_late_minutes: number;
  kds_hide_ready_after_minutes: number;
  kds_sound_alert: boolean;
  receipt_printing_enabled: boolean;
  kitchen_printer_enabled: boolean;
  paper_width_mm: 58 | 80;
  receipt_copies: number;
  auto_print_on_kitchen_send: boolean;
  auto_print_on_payment: boolean;
  cash_drawer_enabled: boolean;
  barcode_scanner_enabled: boolean;
  customer_display_enabled: boolean;
  payment_terminal_enabled: boolean;
  kds_screen_enabled: boolean;
  require_open_shift_for_cash: boolean;
  opening_cash_required: boolean;
  force_close_shift_before_day_end: boolean;
  manager_approval_cash_out: boolean;
  shift_report_visibility: "manager" | "all";
  customers_enabled: boolean;
  customer_phone_required: boolean;
  allow_order_cancel: boolean;
}

const SECTIONS = [
  ["profile", "بيانات المطعم"],
  ["branches", "الفروع"],
  ["taxes", "الضرائب والرسوم"],
  ["orders", "الطلبات"],
  ["menu", "المنيو"],
  ["offers", "العروض والخصومات"],
  ["kitchen", "المطبخ"],
  ["printing", "الطباعة والأجهزة"],
  ["shift", "الشيفت والكاش"],
  ["delivery", "العملاء والتوصيل"],
  ["users", "المستخدمون والصلاحيات"],
  ["reports", "التقارير"],
] as const;
type SectionKey = (typeof SECTIONS)[number][0];

export function SettingsPage() {
  const { can, ready } = useMe();
  const editable = can("settings.manage");
  const [section, setSection] = useState<SectionKey>("profile");
  const [s, setS] = useState<Settings | null>(null);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ data: Settings }>("/settings")
      .then((r) => setS(r.data))
      .catch((e) => setError(e.message));
  }, []);

  if (!ready || !s) return <div className="muted">{error || "…"}</div>;

  function set<K extends keyof Settings>(k: K, v: Settings[K]) {
    setS((cur) => (cur ? { ...cur, [k]: v } : cur));
  }

  async function save() {
    if (!s || busy) return;
    setBusy(true);
    setMsg("");
    setError("");
    try {
      const res = await api<{ data: Settings }>("/settings", { method: "PATCH", body: s });
      setS(res.data);
      setMsg(t.common.save + " ✓");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const dis = !editable;
  const Toggle = ({ k, label, off }: { k: keyof Settings; label: string; off?: boolean }) => (
    <label className={`set-row${off ? " set-off" : ""}`}>
      <input type="checkbox" disabled={dis || off} checked={!!s[k]} onChange={(e) => set(k, e.target.checked as never)} />
      <span>{label}{off ? " — لاحقًا" : ""}</span>
    </label>
  );
  const Num = ({ k, label, min = 0 }: { k: keyof Settings; label: string; min?: number }) => (
    <label className="set-row">
      <span>{label}</span>
      <input type="number" min={min} disabled={dis} value={Number(s[k])} onChange={(e) => set(k, Number(e.target.value) as never)} />
    </label>
  );
  const Txt = ({ k, label, ltr }: { k: keyof Settings; label: string; ltr?: boolean }) => (
    <label className="set-row">
      <span>{label}</span>
      <input disabled={dis} dir={ltr ? "ltr" : undefined} value={String(s[k] ?? "")} onChange={(e) => set(k, e.target.value as never)} />
    </label>
  );

  return (
    <div dir="rtl" className="setx">
      <aside className="setx-nav">
        <h3>{t.settings.title}</h3>
        {SECTIONS.map(([key, label]) => (
          <button key={key} className={section === key ? "active" : ""} onClick={() => setSection(key)}>
            {label}
          </button>
        ))}
      </aside>

      <div className="setx-body">
        {error && <div className="alert">{error}</div>}
        {msg && <div className="ok">{msg}</div>}
        {!editable && <div className="muted">{t.settings.readOnly}</div>}

        {section === "profile" && (
          <section className="panel set-card">
            <h3>بيانات المطعم</h3>
            <Txt k="restaurant_name" label="اسم المطعم بالعربية" />
            <Txt k="restaurant_name_en" label="الاسم بالإنجليزية" ltr />
            <Txt k="system_display_name" label="اسم النظام الظاهر في POS" ltr />
            <Txt k="address" label="العنوان" />
            <Txt k="phone" label="أرقام التواصل" ltr />
            <Txt k="tax_number" label="الرقم الضريبي" ltr />
            <Txt k="logo_url" label="رابط اللوجو" ltr />
            <label className="set-row">
              <span>ألوان البراند (أصفر / أسود)</span>
              <span className="set-colors">
                <input type="color" disabled={dis} value={s.brand_primary_color} onChange={(e) => set("brand_primary_color", e.target.value)} />
                <input type="color" disabled={dis} value={s.brand_secondary_color} onChange={(e) => set("brand_secondary_color", e.target.value)} />
              </span>
            </label>
            <label className="set-row">
              <span>اللغة الافتراضية</span>
              <select disabled={dis} value={s.default_language} onChange={(e) => set("default_language", e.target.value as "ar" | "en")}>
                <option value="ar">العربية</option>
                <option value="en">English</option>
              </select>
            </label>
            <Toggle k="rtl_enabled" label="واجهة RTL" />
            <Txt k="currency" label="العملة" ltr />
            <Txt k="timezone" label="المنطقة الزمنية" ltr />
            <Txt k="receipt_footer" label="نص أسفل الفاتورة" />
          </section>
        )}

        {section === "branches" && <BranchesSection editable={editable} />}

        {section === "taxes" && (
          <section className="panel set-card">
            <h3>الضرائب والرسوم</h3>
            <Toggle k="vat_enabled" label="تفعيل ضريبة القيمة المضافة" />
            <Num k="vat_percentage" label="نسبة الضريبة %" />
            <Toggle k="prices_include_vat" label="الأسعار شاملة الضريبة (إيقافها = تُضاف فوق السعر)" />
            <Toggle k="service_fee_enabled" label="تفعيل رسوم الخدمة" />
            <label className="set-row">
              <span>نوع رسوم الخدمة</span>
              <select disabled={dis} value={s.service_fee_type} onChange={(e) => set("service_fee_type", e.target.value as "percent" | "fixed")}>
                <option value="percent">نسبة %</option>
                <option value="fixed">مبلغ ثابت</option>
              </select>
            </label>
            <Num k="service_fee_value" label="قيمة رسوم الخدمة" />
            <Num k="default_delivery_fee" label="رسوم التوصيل الافتراضية" />
            <Num k="min_delivery_order" label="الحد الأدنى لطلب التوصيل" />
            <label className="set-row">
              <span>قاعدة التقريب</span>
              <select disabled={dis} value={s.rounding_rule} onChange={(e) => set("rounding_rule", e.target.value as Settings["rounding_rule"])}>
                <option value="none">بدون</option>
                <option value="nearest_050">لأقرب 0.50</option>
                <option value="nearest_1">لأقرب 1 جنيه</option>
              </select>
            </label>
            <label className="set-row">
              <span>عرض الضريبة في الفاتورة</span>
              <select disabled={dis} value={s.receipt_tax_display} onChange={(e) => set("receipt_tax_display", e.target.value as "combined" | "detailed")}>
                <option value="combined">مدمج</option>
                <option value="detailed">مفصل</option>
              </select>
            </label>
          </section>
        )}

        {section === "orders" && (
          <section className="panel set-card">
            <h3>الطلبات</h3>
            <div className="set-sub">أنواع الطلب</div>
            <Toggle k="order_type_takeaway_enabled" label="تيك أواي" />
            <Toggle k="order_type_delivery_enabled" label="دليفري" />
            <Toggle k="order_type_dine_in_enabled" label="الصالة (مقفولة بقرار تشغيلي حالي)" off />
            <Toggle k="online_orders_enabled" label="طلبات أونلاين" off />
            <div className="set-sub">متطلبات الدليفري</div>
            <Toggle k="require_customer_for_delivery" label="يتطلب عميلًا" />
            <Toggle k="require_address_for_delivery" label="يتطلب عنوانًا" />
            <Toggle k="require_driver_for_delivery" label="يتطلب سائقًا (اختياري)" />
            <div className="set-sub">ترقيم الطلبات</div>
            <Txt k="order_number_prefix" label="بادئة عامة (مثال: YK)" ltr />
            <Toggle k="order_type_letter_prefix" label="حرف نوع الطلب T/D/O" />
            <Toggle k="order_daily_reset" label="تصفير الترقيم يوميًا" />
            <Num k="order_starting_number" label="رقم البداية" min={1} />
            <Toggle k="branch_specific_numbering" label="ترقيم مستقل لكل فرع" />
            <div className="set-sub">موافقات المدير</div>
            <Toggle k="approval_delete_item_after_kitchen" label="حذف صنف بعد إرسال المطبخ (endpoint لاحقًا)" />
            <Toggle k="approval_cancel_order" label="إلغاء الطلب يتطلب صلاحية إلغاء" />
            <Toggle k="approval_discount_above_limit" label="خصم فوق الحد يتطلب مديرًا" />
            <Toggle k="approval_refund" label="الاسترداد يتطلب مديرًا (endpoint لاحقًا)" />
            <Toggle k="approval_open_cash_drawer" label="فتح درج الكاش يتطلب صلاحية" />
          </section>
        )}

        {section === "menu" && <MenuSection editable={editable} />}

        {section === "offers" && (
          <section className="panel set-card">
            <h3>العروض والخصومات</h3>
            <Toggle k="allow_discounts" label="تفعيل الخصم اليدوي" />
            <Num k="max_discount_without_manager" label="أقصى خصم للكاشير (ج.م)" />
            <Num k="max_cashier_discount_percent" label="أقصى خصم للكاشير %" />
            <Toggle k="discount_reason_required" label="سبب الخصم إلزامي" />
            <div className="set-sub">محرك العروض — placeholders (بلا منطق وهمي)</div>
            <Toggle k="offers_combo_enabled" label="كومبو / وجبات مجمعة" off />
            <Toggle k="offers_buy_x_get_y_enabled" label="اشترِ X واحصل على Y" off />
            <Toggle k="offers_happy_hour_enabled" label="Happy Hour" off />
            <Toggle k="offers_scheduled_enabled" label="عروض مجدولة" off />
          </section>
        )}

        {section === "kitchen" && (
          <>
            <section className="panel set-card">
              <h3>المطبخ / KDS</h3>
              <Toggle k="kds_enabled" label="تفعيل شاشة المطبخ KDS" />
              <Toggle k="kitchen_ticket_enabled" label="تفعيل تذاكر المطبخ" />
              <Num k="default_prep_time_minutes" label="وقت التحضير الافتراضي (دقائق)" />
              <Num k="kds_warning_minutes" label="تحذير بعد (دقائق)" min={1} />
              <Num k="kds_late_minutes" label="متأخر بعد (دقائق)" min={1} />
              <Num k="kds_hide_ready_after_minutes" label="إخفاء الجاهز بعد (دقائق)" min={1} />
              <Toggle k="kds_sound_alert" label="تنبيه صوتي عند طلب جديد" />
            </section>
            <StationsSection editable={editable} />
            <PrepTimesSection editable={editable} />
          </>
        )}

        {section === "printing" && (
          <section className="panel set-card">
            <h3>الطباعة والأجهزة</h3>
            <Toggle k="receipt_printing_enabled" label="طابعة الإيصالات" />
            <Toggle k="kitchen_printer_enabled" label="طابعة المطبخ" />
            <label className="set-row">
              <span>عرض الورق</span>
              <select disabled={dis} value={s.paper_width_mm} onChange={(e) => set("paper_width_mm", Number(e.target.value) as 58 | 80)}>
                <option value={58}>58mm</option>
                <option value={80}>80mm</option>
              </select>
            </label>
            <Num k="receipt_copies" label="عدد النسخ" min={1} />
            <Toggle k="auto_print_on_kitchen_send" label="طباعة تذكرة المطبخ تلقائيًا عند الإرسال" />
            <Toggle k="auto_print_on_payment" label="طباعة الإيصال تلقائيًا عند الدفع" />
            <div className="set-sub">أجهزة — placeholders حتى تكامل الجسر</div>
            <Toggle k="cash_drawer_enabled" label="درج الكاش" off />
            <Toggle k="barcode_scanner_enabled" label="قارئ الباركود" off />
            <Toggle k="customer_display_enabled" label="شاشة العميل" off />
            <Toggle k="payment_terminal_enabled" label="جهاز الدفع البنكي" off />
            <Toggle k="kds_screen_enabled" label="شاشة KDS مستقلة" off />
            <div className="muted">إدارة الطابعات الفعلية ونقاط الاتصال من صفحة «الهاردوير».</div>
          </section>
        )}

        {section === "shift" && (
          <section className="panel set-card">
            <h3>الشيفت والكاش</h3>
            <Toggle k="require_open_shift_for_cash" label="الدفع النقدي يتطلب شيفتًا مفتوحًا" />
            <Toggle k="opening_cash_required" label="رصيد افتتاحي إلزامي عند فتح الشيفت" />
            <Toggle k="force_close_shift_before_day_end" label="إجبار إغلاق الشيفت قبل نهاية اليوم (تنفيذ لاحقًا)" />
            <Toggle k="manager_approval_cash_out" label="سحب الكاش يتطلب مديرًا (paid in/out لاحقًا)" />
            <label className="set-row">
              <span>ظهور تقرير الشيفت</span>
              <select disabled={dis} value={s.shift_report_visibility} onChange={(e) => set("shift_report_visibility", e.target.value as "manager" | "all")}>
                <option value="manager">المدير فقط</option>
                <option value="all">الجميع</option>
              </select>
            </label>
          </section>
        )}

        {section === "delivery" && (
          <>
            <section className="panel set-card">
              <h3>العملاء</h3>
              <Toggle k="customers_enabled" label="تفعيل سجل العملاء" />
              <Toggle k="customer_phone_required" label="رقم الهاتف إلزامي" />
            </section>
            <ZonesSection editable={editable} />
            <DriversSection editable={editable} />
          </>
        )}

        {section === "users" && <RolesSection />}

        {section === "reports" && (
          <section className="panel set-card">
            <h3>التقارير</h3>
            <div className="muted">
              تقارير المبيعات وطرق الدفع وأفضل الأصناف متاحة في صفحة <Link to="/reports">التقارير</Link>. تقارير الشيفت
              والمطبخ والسائقين تُستكمل في المراحل القادمة.
            </div>
          </section>
        )}

        {editable && !["branches", "menu", "users", "reports"].includes(section) && (
          <div className="pos-actions" style={{ maxWidth: 280 }}>
            <button className="primary" disabled={busy} onClick={save}>{t.common.save}</button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ——— الفروع ——— */
function BranchesSection({ editable }: { editable: boolean }) {
  const [rows, setRows] = useState<Array<{
    id: string; name: string; address?: string; phone?: string; is_active: boolean;
    accepts_takeaway: boolean; accepts_delivery: boolean; dine_in_enabled: boolean;
  }>>([]);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  const load = () => api<{ data: typeof rows }>("/branches").then((r) => setRows(r.data)).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  async function patch(id: string, body: Record<string, unknown>) {
    try {
      await api(`/branches/${id}`, { method: "PATCH", body });
      setMsg(t.common.save + " ✓");
      setError("");
      load();
    } catch (e: any) { setError(e.message); }
  }

  return (
    <section className="panel set-card">
      <h3>الفروع</h3>
      {error && <div className="alert">{error}</div>}
      {msg && <div className="ok">{msg}</div>}
      <table>
        <thead>
          <tr><th>الفرع</th><th>الهاتف</th><th>نشط</th><th>تيك أواي</th><th>دليفري</th><th>الصالة</th></tr>
        </thead>
        <tbody>
          {rows.map((b) => (
            <tr key={b.id}>
              <td>{b.name}<div className="muted">{b.address}</div></td>
              <td>
                <input disabled={!editable} dir="ltr" defaultValue={b.phone ?? ""} style={{ width: 120 }}
                  onBlur={(e) => e.target.value !== (b.phone ?? "") && patch(b.id, { phone: e.target.value || null })} />
              </td>
              {(["is_active", "accepts_takeaway", "accepts_delivery"] as const).map((k) => (
                <td key={k}>
                  <input type="checkbox" disabled={!editable} checked={b[k]} onChange={(e) => patch(b.id, { [k]: e.target.checked })} />
                </td>
              ))}
              <td><span className="stub">مقفولة حاليًا</span></td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="muted">أسعار وإتاحة منيو الفرع من صفحة «المنيو». الصالة/الطاولات مخفية بقرار تشغيلي.</div>
    </section>
  );
}

/* ——— المنيو: أعلام تشغيلية على الأصناف + صورة مربعة ——— */
function MenuSection({ editable }: { editable: boolean }) {
  const [tab, setTab] = useState<"products" | "info">("products");
  const [stations, setStations] = useState<Array<{ id: string; name_ar: string }>>([]);
  const [rows, setRows] = useState<Array<{
    id: string; name_ar: string; image_url?: string | null; pos_visible: boolean;
    kitchen_printable: boolean; discountable: boolean; prep_station_id?: string | null; prep_time_minutes: number;
  }>>([]);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  const load = () =>
    Promise.all([
      api<{ data: typeof rows }>("/products").then((r) => setRows(r.data)),
      api<{ data: typeof stations }>("/prep-stations").then((r) => setStations(r.data)),
    ]).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  async function patch(id: string, body: Record<string, unknown>) {
    try {
      await api(`/products/${id}`, { method: "PATCH", body });
      setMsg(t.common.save + " ✓"); setError(""); load();
    } catch (e: any) { setError(e.message); }
  }

  return (
    <section className="panel set-card">
      <h3>المنيو — أعلام التشغيل</h3>
      <div className="seg" style={{ marginBottom: 10 }}>
        <button className={tab === "products" ? "active" : ""} onClick={() => setTab("products")}>الأصناف</button>
        <button className={tab === "info" ? "active" : ""} onClick={() => setTab("info")}>الأقسام والأحجام والإضافات</button>
      </div>
      {error && <div className="alert">{error}</div>}
      {msg && <div className="ok">{msg}</div>}
      {tab === "info" && (
        <div className="muted">
          إدارة الأقسام والأصناف والأحجام (لقمة/هامر فينو وسياحي — كبسولة/رغيف) والإضافات الحقيقية (طحينة/باربيكيو/شيدر/بطاطس)
          تتم من صفحة <Link to="/menu">المنيو</Link> ومدير الأصناف داخل POS — بلا أصناف أو إضافات مخترعة.
          <div className="set-sub">معيار الصور: مربعة 1:1 — 800×800 — JPG/WebP — أقل من 400KB.</div>
        </div>
      )}
      {tab === "products" && (
        <table>
          <thead>
            <tr><th>الصنف</th><th>الصورة (مربعة)</th><th>يظهر في POS</th><th>يُطبع للمطبخ</th><th>قابل للخصم</th><th>محطة التحضير</th><th>تحضير (د)</th></tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id}>
                <td>{p.name_ar}</td>
                <td>
                  <div className="set-img">
                    {p.image_url ? <img src={p.image_url} alt={p.name_ar} /> : <span>—</span>}
                    <input disabled={!editable} dir="ltr" placeholder="https://…" defaultValue={p.image_url ?? ""}
                      onBlur={(e) => e.target.value !== (p.image_url ?? "") && patch(p.id, { image_url: e.target.value || null })} />
                  </div>
                </td>
                {(["pos_visible", "kitchen_printable", "discountable"] as const).map((k) => (
                  <td key={k}>
                    <input type="checkbox" disabled={!editable} checked={p[k]} onChange={(e) => patch(p.id, { [k]: e.target.checked })} />
                  </td>
                ))}
                <td>
                  <select disabled={!editable} value={p.prep_station_id ?? ""} onChange={(e) => patch(p.id, { prep_station_id: e.target.value || null })}>
                    <option value="">حسب القسم</option>
                    {stations.map((st) => <option key={st.id} value={st.id}>{st.name_ar}</option>)}
                  </select>
                </td>
                <td>
                  <input type="number" min={0} disabled={!editable} defaultValue={p.prep_time_minutes} style={{ width: 60 }}
                    onBlur={(e) => Number(e.target.value) !== p.prep_time_minutes && patch(p.id, { prep_time_minutes: Number(e.target.value) })} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

/* ——— محطات التحضير ——— */
function StationsSection({ editable }: { editable: boolean }) {
  const [rows, setRows] = useState<Array<{ id: string; name_ar: string; is_active: boolean }>>([]);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const load = () => api<{ data: typeof rows }>("/prep-stations").then((r) => setRows(r.data)).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);
  return (
    <section className="panel set-card">
      <h3>محطات التحضير</h3>
      {error && <div className="alert">{error}</div>}
      {editable && (
        <div className="form-row">
          <input placeholder="اسم المحطة" value={name} onChange={(e) => setName(e.target.value)} />
          <button className="primary" disabled={!name}
            onClick={async () => { try { await api("/prep-stations", { method: "POST", body: { name_ar: name, sort_order: rows.length } }); setName(""); load(); } catch (e: any) { setError(e.message); } }}>
            إضافة محطة
          </button>
        </div>
      )}
      <div className="seg wrap">
        {rows.map((st) => (
          <button key={st.id} className={st.is_active ? "active" : ""} disabled={!editable}
            onClick={async () => { await api(`/prep-stations/${st.id}`, { method: "PATCH", body: { is_active: !st.is_active } }); load(); }}>
            {st.name_ar}
          </button>
        ))}
      </div>
      <div className="muted">توجيه الأقسام للمحطات من «أوقات التحضير» أدناه، وتخصيص صنف بعينه من قسم «المنيو».</div>
    </section>
  );
}

/* ——— أوقات التحضير الافتراضية بالقسم + توجيه المحطة ——— */
function PrepTimesSection({ editable }: { editable: boolean }) {
  const [cats, setCats] = useState<Array<{ id: string; name_ar: string; default_prep_time_minutes: number; default_prep_station_id?: string | null }>>([]);
  const [stations, setStations] = useState<Array<{ id: string; name_ar: string }>>([]);
  const [error, setError] = useState("");
  const load = () =>
    Promise.all([
      api<{ data: typeof cats }>("/categories").then((r) => setCats(r.data)),
      api<{ data: typeof stations }>("/prep-stations").then((r) => setStations(r.data)),
    ]).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);
  async function patch(id: string, body: Record<string, unknown>) {
    try { await api(`/categories/${id}`, { method: "PATCH", body }); setError(""); load(); }
    catch (e: any) { setError(e.message); }
  }
  return (
    <section className="panel set-card">
      <h3>أوقات التحضير وتوجيه المحطات (حسب القسم)</h3>
      {error && <div className="alert">{error}</div>}
      <table>
        <thead><tr><th>القسم</th><th>المحطة الافتراضية</th><th>تحضير افتراضي (د)</th></tr></thead>
        <tbody>
          {cats.map((c) => (
            <tr key={c.id}>
              <td>{c.name_ar}</td>
              <td>
                <select disabled={!editable} value={c.default_prep_station_id ?? ""} onChange={(e) => patch(c.id, { default_prep_station_id: e.target.value || null })}>
                  <option value="">—</option>
                  {stations.map((st) => <option key={st.id} value={st.id}>{st.name_ar}</option>)}
                </select>
              </td>
              <td>
                <input type="number" min={0} disabled={!editable} defaultValue={c.default_prep_time_minutes} style={{ width: 60 }}
                  onBlur={(e) => Number(e.target.value) !== c.default_prep_time_minutes && patch(c.id, { default_prep_time_minutes: Number(e.target.value) })} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

/* ——— مناطق التوصيل ——— */
function ZonesSection({ editable }: { editable: boolean }) {
  const [rows, setRows] = useState<Array<{ id: string; name_ar: string; fee: string | number; min_order: string | number; is_active: boolean }>>([]);
  const [form, setForm] = useState({ name_ar: "", fee: 0, min_order: 0 });
  const [error, setError] = useState("");
  const load = () => api<{ data: typeof rows }>("/delivery-zones").then((r) => setRows(r.data)).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);
  return (
    <section className="panel set-card">
      <h3>مناطق التوصيل</h3>
      {error && <div className="alert">{error}</div>}
      {editable && (
        <div className="form-row">
          <input placeholder="اسم المنطقة" value={form.name_ar} onChange={(e) => setForm({ ...form, name_ar: e.target.value })} />
          <input type="number" min={0} placeholder="رسوم" value={form.fee || ""} onChange={(e) => setForm({ ...form, fee: Number(e.target.value) })} />
          <input type="number" min={0} placeholder="حد أدنى" value={form.min_order || ""} onChange={(e) => setForm({ ...form, min_order: Number(e.target.value) })} />
          <button className="primary" disabled={!form.name_ar}
            onClick={async () => { try { await api("/delivery-zones", { method: "POST", body: form }); setForm({ name_ar: "", fee: 0, min_order: 0 }); load(); } catch (e: any) { setError(e.message); } }}>
            إضافة منطقة
          </button>
        </div>
      )}
      <table>
        <thead><tr><th>المنطقة</th><th>الرسوم</th><th>الحد الأدنى</th><th>نشطة</th></tr></thead>
        <tbody>
          {rows.map((z) => (
            <tr key={z.id}>
              <td>{z.name_ar}</td>
              <td>{Number(z.fee).toFixed(2)}</td>
              <td>{Number(z.min_order).toFixed(2)}</td>
              <td>
                <input type="checkbox" disabled={!editable} checked={z.is_active}
                  onChange={async (e) => { await api(`/delivery-zones/${z.id}`, { method: "PATCH", body: { is_active: e.target.checked } }); load(); }} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

/* ——— السائقون ——— */
function DriversSection({ editable }: { editable: boolean }) {
  const { can } = useMe();
  const manage = editable && can("drivers.manage");
  const [rows, setRows] = useState<Array<{ id: string; name: string; phone?: string | null; is_active: boolean }>>([]);
  const [form, setForm] = useState({ name: "", phone: "" });
  const [error, setError] = useState("");
  const load = () => api<{ data: typeof rows }>("/drivers").then((r) => setRows(r.data)).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);
  return (
    <section className="panel set-card">
      <h3>السائقون</h3>
      {error && <div className="alert">{error}</div>}
      {manage && (
        <div className="form-row">
          <input placeholder="اسم السائق" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input placeholder="الهاتف" dir="ltr" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <button className="primary" disabled={!form.name}
            onClick={async () => { try { await api("/drivers", { method: "POST", body: { name: form.name, phone: form.phone || null } }); setForm({ name: "", phone: "" }); load(); } catch (e: any) { setError(e.message); } }}>
            إضافة سائق
          </button>
        </div>
      )}
      <table>
        <thead><tr><th>السائق</th><th>الهاتف</th><th>نشط</th></tr></thead>
        <tbody>
          {rows.map((d) => (
            <tr key={d.id}>
              <td>{d.name}</td>
              <td dir="ltr">{d.phone}</td>
              <td>
                <input type="checkbox" disabled={!manage} checked={d.is_active}
                  onChange={async (e) => { await api(`/drivers/${d.id}`, { method: "PATCH", body: { is_active: e.target.checked } }); load(); }} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="muted">تعيين السائق على طلب دليفري من صفحة «الطلبات». تقرير تسوية السائق — لاحقًا.</div>
    </section>
  );
}

/* ——— المستخدمون والصلاحيات: مصفوفة قراءة ——— */
function RolesSection() {
  const [roles, setRoles] = useState<Array<{ id: string; key: string; name_ar: string; permissions?: Array<{ key: string; name_ar: string; group: string }> }>>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    api<{ data: typeof roles }>("/roles").then((r) => setRoles(r.data)).catch((e) => setError(e.message));
  }, []);
  return (
    <section className="panel set-card">
      <h3>المستخدمون والصلاحيات</h3>
      {error && <div className="alert">{error}</div>}
      <div className="muted">إدارة المستخدمين من صفحة <Link to="/users">المستخدمين</Link>. الخريطة أدناه للقراءة — تحرير الأدوار endpoint لاحقًا.</div>
      {roles.map((role) => (
        <div key={role.id} className="set-role">
          <strong>{role.name_ar}</strong> <span className="muted" dir="ltr">({role.key})</span>
          <div className="set-perms">
            {role.key === "owner" || role.key === "admin"
              ? <span className="stub">كل الصلاحيات</span>
              : (role.permissions ?? []).map((p) => <span key={p.key} className="stub">{p.name_ar}</span>)}
            {role.key !== "owner" && role.key !== "admin" && !(role.permissions ?? []).length && <span className="muted">بلا صلاحيات</span>}
          </div>
        </div>
      ))}
    </section>
  );
}
