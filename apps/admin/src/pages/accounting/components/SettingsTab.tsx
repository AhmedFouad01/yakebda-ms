import { useCallback, useEffect, useState } from "react";
import {
  Button,
  Checkbox,
  ErrorState,
  FormField,
  LoadingState,
  NumberInput,
  Select,
  TextInput,
  ViewOnlyNotice,
} from "../../../components/ui/primitives";
import { toast } from "../../../components/ui/overlays";
import { fetchAccountingSettings, updateAccountingSettings } from "../accountingApi";
import type { AccountingSettings, BranchRef } from "../accountingTypes";

type LoadState = "loading" | "error" | "ready";

/**
 * شاشة (ي): إعدادات الحسابات per-tenant — ADR-004 النوع ب.
 * القيم القابلة للتعديل فقط (ض.ق.م + التسجيل، الاعتراف بالإيراد، اليوم
 * التشغيلي، حد الأهمية النسبية). ثوابت النوع أ تُعرض للقراءة فقط. القيم غير
 * المضبوطة تقع على الـdefaults من الخادم؛ لا سلوك مخترَع في الواجهة.
 */
export function SettingsTab({ branches, canManage }: { branches: BranchRef[]; canManage: boolean }) {
  const [state, setState] = useState<LoadState>("loading");
  const [error, setError] = useState("");
  const [branchId, setBranchId] = useState("");
  const [form, setForm] = useState<AccountingSettings | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (branch: string) => {
    setState("loading");
    setError("");
    try {
      const res = await fetchAccountingSettings(branch || undefined);
      setForm(res.data);
      setState("ready");
    } catch (e: any) {
      setError(e.message ?? "تعذر تحميل إعدادات الحسابات");
      setState("error");
    }
  }, []);

  useEffect(() => {
    load(branchId);
  }, [load, branchId]);

  const save = async () => {
    if (!form) return;
    setBusy(true);
    try {
      const res = await updateAccountingSettings(
        {
          vat_registered: form.vat_registered,
          vat_rate: form.vat_rate,
          revenue_recognition: form.revenue_recognition,
          timezone: form.timezone,
          day_close_hour: form.day_close_hour,
          materiality_threshold: form.materiality_threshold,
        },
        branchId || undefined
      );
      setForm(res.data); // القيم الفعلية من الخادم بعد الحفظ
      toast("تم حفظ إعدادات الحسابات");
    } catch (e: any) {
      toast(e.message ?? "تعذر حفظ الإعدادات", "error");
    } finally {
      setBusy(false);
    }
  };

  const patch = (partial: Partial<AccountingSettings>) => setForm((prev) => (prev ? { ...prev, ...partial } : prev));

  return (
    <div className="stack">
      <div className="inv-toolbar">
        <FormField label="النطاق" hint="الإعداد على مستوى الحساب أو تخصيص لفرع">
          <Select value={branchId} onChange={(e) => setBranchId(e.target.value)} aria-label="نطاق الإعداد">
            <option value="">على مستوى الحساب</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </Select>
        </FormField>
      </div>

      {state === "loading" && <LoadingState label="جارٍ تحميل الإعدادات…" />}
      {state === "error" && <ErrorState message={error} onRetry={() => load(branchId)} />}
      {state === "ready" && form && (
        <>
          {/* UX-LANG-01: المفتاح التقني للصلاحية لا يُعرض — الإشعار الموحّد يذكر اسمها بالعربية. */}
          {!canManage && <ViewOnlyNotice permission="accounting.manage" />}

          <div className="panel stack">
            <h3>القيم القابلة للتعديل (ADR-004 النوع ب)</h3>
            <FormField label="حالة التسجيل الضريبي">
              <Checkbox
                label="مسجّل في ض.ق.م"
                checked={form.vat_registered}
                disabled={!canManage}
                onChange={(e) => patch({ vat_registered: e.target.checked })}
              />
            </FormField>
            <FormField label="نسبة ض.ق.م (%)" hint="المعدل العام للمطاعم في مصر 14%">
              <NumberInput
                value={form.vat_rate}
                min={0}
                max={100}
                step={0.01}
                disabled={!canManage}
                onChange={(e) => patch({ vat_rate: Number(e.target.value) })}
              />
            </FormField>
            <FormField label="الاعتراف بالإيراد">
              <Select
                value={form.revenue_recognition}
                disabled={!canManage}
                onChange={(e) => patch({ revenue_recognition: e.target.value })}
              >
                <option value="on_payment">عند إتمام الطلب/الدفع</option>
              </Select>
            </FormField>
            <FormField label="المنطقة الزمنية (IANA)" hint="مثل Africa/Cairo">
              <TextInput
                value={form.timezone}
                disabled={!canManage}
                onChange={(e) => patch({ timezone: e.target.value })}
                dir="ltr"
              />
            </FormField>
            <FormField label="ساعة إقفال اليوم التشغيلي (0–23)" hint="القاهرة 04:00 افتراضيًا">
              <NumberInput
                value={form.day_close_hour}
                min={0}
                max={23}
                disabled={!canManage}
                onChange={(e) => patch({ day_close_hour: Number(e.target.value) })}
              />
            </FormField>
            <FormField label="حد الأهمية النسبية (للتنبيه فقط)" hint="بالجنيه — 0 يعني بلا تنبيه">
              <TextInput
                value={form.materiality_threshold}
                disabled={!canManage}
                onChange={(e) => patch({ materiality_threshold: e.target.value })}
                dir="ltr"
                inputMode="decimal"
              />
            </FormField>
            {canManage && (
              <div className="inv-actions">
                <Button variant="primary" onClick={save} disabled={busy}>حفظ الإعدادات</Button>
              </div>
            )}
          </div>

          <div className="panel">
            <h3>ثوابت المحرك (النوع أ — غير قابلة للتعديل)</h3>
            <dl className="acc-kv">
              <dt>آلية التسوية</dt>
              <dd>قيد تسوية آلي متوازن عند إقفال كل فترة إلى حساب التقريب</dd>
              <dt>تاريخ الاعتراف بالتسوية</dt>
              <dd>تاريخ إقفال الفترة</dd>
              <dt>الدقة</dt>
              <dd className="mono" dir="ltr">4dp source / 2dp journal / half-up</dd>
            </dl>
            <p className="muted">
              هذه الثوابت مطبّقة في المنتج ولا تُعدّل per-tenant (ADR-004). القيم غير المضبوطة أعلاه تقع على
              الـdefaults المعيارية من الخادم.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
