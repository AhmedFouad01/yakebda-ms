import { useState } from "react";
import { Link } from "react-router-dom";
import { useMe } from "../../lib/me";
import {
  PageHeader,
  SectionCard,
  ViewOnlyNotice,
  StickyActionBar,
  SaveButton,
  CancelButton,
  Button,
  LoadingState,
  ErrorState,
} from "../../components/ui/primitives";
import { useSettingsDoc, RowToggle, RowNum, RowText, RowSelect, SubHead, RowCtx } from "./shared";
import {
  BranchesSection,
  StationsSection,
  PrepTimesSection,
  ZonesSection,
  DriversSection,
  RolesSection,
} from "./crudSections";
import { SourcesSection } from "./SourcesSection";
import { LogoUploadField } from "./LogoUploadField";

/**
 * YKMS-02F — الإعدادات: 12 قسمًا مطابقة للوثيقة، مبنية على نظام uif.
 * - صلاحية settings.manage تتحكم في التحرير؛ بدونها «وضع العرض فقط» بقيم مقروءة.
 * - أقسام الوثيقة القائمة على key-value تحفظ عبر شريط ثابت مع dirty state.
 * - أقسام CRUD (فروع/منيو/محطات/مناطق/سائقون/أدوار) تحفظ فوريًا.
 */

const SECTIONS: Array<[string, string, boolean]> = [
  // [key, label, isDocBased]
  ["profile", "بيانات المطعم", true],
  ["branches", "الفروع", false],
  ["taxes", "الضرائب والرسوم", true],
  ["orders", "الطلبات", true],
  ["sources", "المصادر", false],
  ["offers", "العروض والخصومات", true],
  ["kitchen", "المطبخ", true],
  ["printing", "الطباعة والأجهزة", true],
  ["shift", "الشيفت والكاش", true],
  ["delivery", "العملاء والتوصيل", true],
  ["users", "المستخدمون والصلاحيات", false],
  ["reports", "التقارير", false],
];

export function SettingsLayout() {
  const { can, ready, me } = useMe();
  const editable = can("settings.manage");
  const [section, setSection] = useState("profile");
  const doc = useSettingsDoc();
  const ctx: RowCtx = { doc, editable };

  if (!ready) return <LoadingState />;

  const current = SECTIONS.find(([k]) => k === section)!;
  const isDoc = current[2];

  return (
    <div className="settings-page">
      <PageHeader title="الإعدادات" subtitle="التهيئة التشغيلية — مصدر الحقيقة لـ POS والمطبخ والطلبات" />
      <div className="setx2">
        <aside className="setx2-nav">
          {SECTIONS.map(([key, label]) => (
            <Button key={key} variant="ghost" className={section === key ? "active" : ""} aria-current={section === key ? "page" : undefined} onClick={() => setSection(key)}>
              {label}
            </Button>
          ))}
        </aside>

        <div className="setx2-body">
          {!editable && <ViewOnlyNotice permission="settings.manage" />}
          {isDoc && doc.loadError && <ErrorState message={doc.loadError} onRetry={doc.reload} />}
          {isDoc && !doc.data && !doc.loadError && <LoadingState label="جارٍ تحميل الإعدادات…" />}

          {isDoc && doc.data && (
            <>
              {section === "profile" && (
                <SectionCard title="بيانات المطعم" hint="الاسم والهوية البصرية وبيانات الفاتورة">
                  <RowText ctx={ctx} k="restaurant_name" label="اسم المطعم بالعربية" />
                  <RowText ctx={ctx} k="restaurant_name_en" label="الاسم بالإنجليزية" ltr />
                  <RowText ctx={ctx} k="system_display_name" label="اسم النظام في POS" ltr />
                  <RowText ctx={ctx} k="address" label="العنوان" />
                  <RowText ctx={ctx} k="phone" label="أرقام التواصل" ltr />
                  <RowText ctx={ctx} k="tax_number" label="الرقم الضريبي" ltr />
                  <LogoUploadField
                    accountId={me?.accountId ?? ""}
                    logoUrl={doc.data.logo_url}
                    editable={editable}
                    onChanged={doc.reload}
                  />
                  <RowSelect ctx={ctx} k="default_language" label="اللغة الافتراضية" options={[["ar", "العربية"], ["en", "English"]]} />
                  <RowToggle ctx={ctx} k="rtl_enabled" label="واجهة RTL" />
                  <RowText ctx={ctx} k="currency" label="العملة" ltr />
                  <RowText ctx={ctx} k="timezone" label="المنطقة الزمنية" ltr />
                  <RowText ctx={ctx} k="receipt_footer" label="نص أسفل الفاتورة" />
                </SectionCard>
              )}

              {section === "taxes" && (
                <SectionCard title="الضرائب والرسوم" hint="القيم تُطبَّق فورًا على الطلبات والفواتير">
                  <RowToggle ctx={ctx} k="vat_enabled" label="تفعيل ضريبة القيمة المضافة" />
                  <RowNum ctx={ctx} k="vat_percentage" label="نسبة الضريبة %" />
                  <RowToggle ctx={ctx} k="prices_include_vat" label="الأسعار شاملة الضريبة" />
                  <RowToggle ctx={ctx} k="service_fee_enabled" label="تفعيل رسوم الخدمة" />
                  <RowSelect ctx={ctx} k="service_fee_type" label="نوع رسوم الخدمة" options={[["percent", "نسبة %"], ["fixed", "مبلغ ثابت"]]} />
                  <RowNum ctx={ctx} k="service_fee_value" label="قيمة رسوم الخدمة" />
                  <RowNum ctx={ctx} k="default_delivery_fee" label="رسوم التوصيل الافتراضية" />
                  <RowNum ctx={ctx} k="min_delivery_order" label="الحد الأدنى لطلب التوصيل" />
                  <RowSelect ctx={ctx} k="rounding_rule" label="قاعدة التقريب" options={[["none", "بدون"], ["nearest_050", "لأقرب 0.50"], ["nearest_1", "لأقرب 1 جنيه"]]} />
                  <RowSelect ctx={ctx} k="receipt_tax_display" label="عرض الضريبة في الفاتورة" options={[["combined", "مدمج"], ["detailed", "مفصل"]]} />
                </SectionCard>
              )}

              {section === "orders" && (
                <SectionCard title="الطلبات" hint="أنواع الطلب والمتطلبات والترقيم والموافقات">
                  <SubHead>أنواع الطلب</SubHead>
                  <RowToggle ctx={ctx} k="order_type_takeaway_enabled" label="تيك أواي" />
                  <RowToggle ctx={ctx} k="order_type_delivery_enabled" label="دليفري" />
                  <RowToggle ctx={ctx} k="order_type_dine_in_enabled" label="الصالة (مقفولة بقرار تشغيلي)" off />
                  <RowToggle ctx={ctx} k="online_orders_enabled" label="طلبات أونلاين" off />
                  <SubHead>متطلبات الدليفري</SubHead>
                  <RowToggle ctx={ctx} k="require_customer_for_delivery" label="يتطلب عميلًا" />
                  <RowToggle ctx={ctx} k="require_address_for_delivery" label="يتطلب عنوانًا" />
                  <RowToggle ctx={ctx} k="require_driver_for_delivery" label="يتطلب سائقًا" />
                  <SubHead>ترقيم الطلبات</SubHead>
                  <RowText ctx={ctx} k="order_number_prefix" label="بادئة عامة (مثال: YK)" ltr />
                  <RowToggle ctx={ctx} k="order_type_letter_prefix" label="حرف نوع الطلب T/D/O" />
                  <RowToggle ctx={ctx} k="order_daily_reset" label="تصفير الترقيم يوميًا" />
                  <RowNum ctx={ctx} k="order_starting_number" label="رقم البداية" min={1} />
                  <RowToggle ctx={ctx} k="branch_specific_numbering" label="ترقيم مستقل لكل فرع" />
                  <SubHead>موافقات المدير</SubHead>
                  <RowToggle ctx={ctx} k="approval_cancel_order" label="إلغاء الطلب يتطلب صلاحية" />
                  <RowToggle ctx={ctx} k="approval_discount_above_limit" label="خصم فوق الحد يتطلب مديرًا" />
                  <RowToggle ctx={ctx} k="approval_open_cash_drawer" label="فتح درج الكاش يتطلب صلاحية" />
                  <RowToggle ctx={ctx} k="approval_delete_item_after_kitchen" label="حذف صنف بعد إرسال المطبخ" off />
                  <RowToggle ctx={ctx} k="approval_refund" label="الاسترداد يتطلب مديرًا" off />
                </SectionCard>
              )}

              {section === "offers" && (
                <SectionCard title="العروض والخصومات" hint="حدود الخصم اليدوي؛ محرك العروض لاحقًا">
                  <RowToggle ctx={ctx} k="allow_discounts" label="تفعيل الخصم اليدوي" />
                  <RowNum ctx={ctx} k="max_discount_without_manager" label="أقصى خصم للكاشير (ج.م)" />
                  <RowNum ctx={ctx} k="max_cashier_discount_percent" label="أقصى خصم للكاشير %" />
                  <RowToggle ctx={ctx} k="discount_reason_required" label="سبب الخصم إلزامي" />
                  <SubHead>محرك العروض</SubHead>
                  <RowToggle ctx={ctx} k="offers_combo_enabled" label="كومبو / وجبات مجمعة" off />
                  <RowToggle ctx={ctx} k="offers_buy_x_get_y_enabled" label="اشترِ X واحصل على Y" off />
                  <RowToggle ctx={ctx} k="offers_happy_hour_enabled" label="Happy Hour" off />
                  <RowToggle ctx={ctx} k="offers_scheduled_enabled" label="عروض مجدولة" off />
                </SectionCard>
              )}

              {section === "kitchen" && (
                <>
                  <SectionCard title="المطبخ / KDS" hint="عتبات SLA والتنبيه الصوتي">
                    <RowToggle ctx={ctx} k="kds_enabled" label="تفعيل شاشة المطبخ KDS" />
                    <RowToggle ctx={ctx} k="kitchen_ticket_enabled" label="تفعيل تذاكر المطبخ" />
                    <RowNum ctx={ctx} k="default_prep_time_minutes" label="وقت التحضير الافتراضي (دقائق)" />
                    <RowNum ctx={ctx} k="kds_warning_minutes" label="تحذير بعد (دقائق)" min={1} />
                    <RowNum ctx={ctx} k="kds_late_minutes" label="متأخر بعد (دقائق)" min={1} />
                    <RowNum ctx={ctx} k="kds_hide_ready_after_minutes" label="إخفاء الجاهز بعد (دقائق)" min={1} />
                    <RowToggle ctx={ctx} k="kds_sound_alert" label="تنبيه صوتي عند طلب جديد" />
                  </SectionCard>
                  <StationsSection editable={editable} />
                  <PrepTimesSection editable={editable} />
                </>
              )}

              {section === "printing" && (
                <SectionCard title="الطباعة والأجهزة" hint="الطابعات الفعلية تُدار من صفحة الهاردوير">
                  <RowToggle ctx={ctx} k="receipt_printing_enabled" label="طابعة الإيصالات" />
                  <RowToggle ctx={ctx} k="kitchen_printer_enabled" label="طابعة المطبخ" />
                  <RowSelect ctx={ctx} k="paper_width_mm" label="عرض الورق" numeric options={[[58, "58mm"], [80, "80mm"]]} />
                  <RowNum ctx={ctx} k="receipt_copies" label="عدد النسخ" min={1} />
                  <RowToggle ctx={ctx} k="auto_print_on_kitchen_send" label="طباعة تذكرة المطبخ تلقائيًا عند الإرسال" />
                  <RowToggle ctx={ctx} k="auto_print_on_payment" label="طباعة الإيصال تلقائيًا عند الدفع" />
                  <SubHead>الأجهزة</SubHead>
                  <RowToggle ctx={ctx} k="cash_drawer_enabled" label="درج الكاش" off />
                  <RowToggle ctx={ctx} k="barcode_scanner_enabled" label="قارئ الباركود" off />
                  <RowToggle ctx={ctx} k="customer_display_enabled" label="شاشة العميل" off />
                  <RowToggle ctx={ctx} k="payment_terminal_enabled" label="جهاز الدفع البنكي" off />
                  <RowToggle ctx={ctx} k="kds_screen_enabled" label="شاشة KDS مستقلة" off />
                </SectionCard>
              )}

              {section === "shift" && (
                <SectionCard title="الشيفت والكاش">
                  <RowToggle ctx={ctx} k="require_open_shift_for_cash" label="الدفع النقدي يتطلب شيفتًا مفتوحًا" />
                  <RowToggle ctx={ctx} k="opening_cash_required" label="رصيد افتتاحي إلزامي" />
                  <RowToggle ctx={ctx} k="force_close_shift_before_day_end" label="إجبار إغلاق الشيفت قبل نهاية اليوم" off />
                  <RowToggle ctx={ctx} k="manager_approval_cash_out" label="سحب الكاش يتطلب مديرًا" off />
                  <RowSelect ctx={ctx} k="shift_report_visibility" label="ظهور تقرير الشيفت" options={[["manager", "المدير فقط"], ["all", "الجميع"]]} />
                </SectionCard>
              )}

              {section === "delivery" && (
                <>
                  <SectionCard title="العملاء">
                    <RowToggle ctx={ctx} k="customers_enabled" label="تفعيل سجل العملاء" />
                    <RowToggle ctx={ctx} k="customer_phone_required" label="رقم الهاتف إلزامي" />
                  </SectionCard>
                  <ZonesSection editable={editable} />
                  <DriversSection editable={editable} />
                </>
              )}

              {/* شريط الحفظ الثابت لأقسام الوثيقة القابلة للتحرير */}
              {editable && (
                <StickyActionBar dirty={doc.dirty}>
                  <CancelButton onClick={doc.reset}>تراجع</CancelButton>
                  <SaveButton busy={doc.saving} disabled={!doc.dirty} onClick={doc.save} />
                </StickyActionBar>
              )}
            </>
          )}

          {/* أقسام CRUD (حفظ فوري لكل عنصر) */}
          {section === "branches" && <BranchesSection editable={editable} />}
          {section === "sources" && <SourcesSection editable={editable} />}
          {section === "users" && <RolesSection />}
          {section === "reports" && (
            <SectionCard title="التقارير">
              <div className="uif-hint">
                تقارير المبيعات وطرق الدفع وأفضل الأصناف في صفحة <Link to="/reports">التقارير</Link>. تقارير الشيفت
                والمطبخ والسائقين سيتم توفيرها في مرحلة لاحقة.
              </div>
            </SectionCard>
          )}
        </div>
      </div>
    </div>
  );
}
