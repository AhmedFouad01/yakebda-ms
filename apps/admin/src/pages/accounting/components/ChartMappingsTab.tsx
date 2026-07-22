import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Badge,
  Button,
  Checkbox,
  EmptyState,
  ErrorState,
  FormField,
  LoadingState,
  Select,
  TextInput,
} from "../../../components/ui/primitives";
import { Modal, toast } from "../../../components/ui/overlays";
import {
  createAccount,
  createMapping,
  fetchAccounts,
  fetchMappings,
  updateAccount,
  updateMapping,
} from "../accountingApi";
import {
  ACCOUNT_TYPE_LABELS,
  type AccountType,
  type AccountingAccount,
  type AccountingMapping,
} from "../accountingTypes";
import { financialEventTypeLabel, mappingDimensionLabel } from "../../../lib/labels";

type LoadState = "loading" | "error" | "ready";

/** شاشة (د): شجرة الحسابات + قواعد الترحيل — FR-270/293. */
export function ChartMappingsTab({ canManage }: { canManage: boolean }) {
  const [state, setState] = useState<LoadState>("loading");
  const [error, setError] = useState("");
  const [accounts, setAccounts] = useState<AccountingAccount[]>([]);
  const [mappings, setMappings] = useState<AccountingMapping[]>([]);
  const [showInactive, setShowInactive] = useState(false);
  const [creatingAccount, setCreatingAccount] = useState(false);
  const [editingAccount, setEditingAccount] = useState<AccountingAccount | null>(null);
  const [creatingMapping, setCreatingMapping] = useState(false);
  const [editingMapping, setEditingMapping] = useState<AccountingMapping | null>(null);

  const load = useCallback(async () => {
    setState("loading");
    setError("");
    try {
      const [accountsRes, mappingsRes] = await Promise.all([fetchAccounts(true), fetchMappings()]);
      setAccounts(accountsRes.data);
      setMappings(mappingsRes.data);
      setState("ready");
    } catch (e: any) {
      setError(e.message ?? "تعذر تحميل شجرة الحسابات");
      setState("error");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const activeAccounts = useMemo(() => accounts.filter((a) => a.is_active), [accounts]);
  const visibleAccounts = useMemo(
    () => (showInactive ? accounts : accounts.filter((a) => a.is_active)),
    [accounts, showInactive]
  );

  if (state === "loading") return <LoadingState label="جارٍ تحميل شجرة الحسابات…" />;
  if (state === "error") return <ErrorState message={error} onRetry={load} />;

  return (
    <div className="stack">
      <div className="inv-actions">
        {canManage && (
          <Button variant="primary" onClick={() => setCreatingAccount(true)}>+ حساب جديد</Button>
        )}
        <Checkbox
          label="إظهار الحسابات المعطلة"
          checked={showInactive}
          onChange={(e) => setShowInactive(e.target.checked)}
        />
      </div>

      {!visibleAccounts.length ? (
        <EmptyState message="لا حسابات في الشجرة" />
      ) : (
        <div className="panel">
          <table className="crm-table inv-table" dir="rtl">
            <caption className="muted">شجرة الحسابات</caption>
            <thead>
              <tr>
                <th scope="col">الكود</th>
                <th scope="col">الاسم</th>
                <th scope="col">النوع</th>
                <th scope="col">الحالة</th>
                {canManage && <th scope="col">إجراء</th>}
              </tr>
            </thead>
            <tbody>
              {visibleAccounts.map((account) => (
                <tr key={account.id}>
                  <td className="mono">{account.code}</td>
                  <td>
                    {account.name_ar}{" "}
                    {account.system_key === "rounding" && <Badge tone="brand">حساب التقريب المعتمد</Badge>}
                    {account.system_key && account.system_key !== "rounding" && (
                      <Badge tone="neutral">قياسي</Badge>
                    )}
                  </td>
                  <td>{ACCOUNT_TYPE_LABELS[account.account_type]}</td>
                  <td>
                    {account.is_active ? <Badge tone="success">نشط</Badge> : <Badge tone="danger">معطل</Badge>}
                  </td>
                  {canManage && (
                    <td>
                      <Button onClick={() => setEditingAccount(account)}>تعديل</Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="inv-actions">
        {canManage && (
          <Button variant="primary" onClick={() => setCreatingMapping(true)}>+ قاعدة ترحيل جديدة</Button>
        )}
      </div>

      {!mappings.length ? (
        <EmptyState message="لا قواعد ترحيل" />
      ) : (
        <div className="panel">
          <table className="crm-table inv-table" dir="rtl">
            <caption className="muted">قواعد الترحيل — قاعدة واحدة لكل (نوع حدث، بُعد)</caption>
            <thead>
              <tr>
                <th scope="col">نوع الحدث</th>
                <th scope="col">البُعد</th>
                <th scope="col">مدين</th>
                <th scope="col">دائن</th>
                <th scope="col">ض.ق.م</th>
                {canManage && <th scope="col">إجراء</th>}
              </tr>
            </thead>
            <tbody>
              {mappings.map((mapping) => (
                <tr key={mapping.id}>
                  <td>
                    {financialEventTypeLabel(mapping.event_type)}{" "}
                    {mapping.event_type === "residual.settlement" && (
                      <Badge tone="brand">تسوية التقريب</Badge>
                    )}
                  </td>
                  <td>{mappingDimensionLabel(mapping.dimension_key)}</td>
                  <td>
                    <span className="mono">{mapping.debit_account_code}</span> — {mapping.debit_account_name_ar}
                  </td>
                  <td>
                    <span className="mono">{mapping.credit_account_code}</span> — {mapping.credit_account_name_ar}
                  </td>
                  <td>
                    {mapping.vat_account_code ? (
                      <>
                        <span className="mono">{mapping.vat_account_code}</span> — {mapping.vat_account_name_ar}
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  {canManage && (
                    <td>
                      <Button onClick={() => setEditingMapping(mapping)}>تعديل</Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AccountCreateDialog
        open={creatingAccount}
        onClose={() => setCreatingAccount(false)}
        onSaved={() => { setCreatingAccount(false); load(); }}
      />
      <AccountEditDialog
        account={editingAccount}
        onClose={() => setEditingAccount(null)}
        onSaved={() => { setEditingAccount(null); load(); }}
      />
      <MappingDialog
        open={creatingMapping}
        mapping={null}
        accounts={activeAccounts}
        onClose={() => setCreatingMapping(false)}
        onSaved={() => { setCreatingMapping(false); load(); }}
      />
      <MappingDialog
        open={!!editingMapping}
        mapping={editingMapping}
        accounts={activeAccounts}
        onClose={() => setEditingMapping(null)}
        onSaved={() => { setEditingMapping(null); load(); }}
      />
    </div>
  );
}

function AccountCreateDialog({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const [code, setCode] = useState("");
  const [nameAr, setNameAr] = useState("");
  const [accountType, setAccountType] = useState<AccountType>("expense");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setCode("");
      setNameAr("");
      setAccountType("expense");
    }
  }, [open]);

  const save = async () => {
    setBusy(true);
    try {
      await createAccount({ code: code.trim(), name_ar: nameAr.trim(), account_type: accountType });
      toast("تم إنشاء الحساب");
      onSaved();
    } catch (e: any) {
      toast(e.message ?? "تعذر إنشاء الحساب", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="حساب جديد"
      footer={
        <div className="inv-actions">
          <Button variant="primary" onClick={save} disabled={busy || !code.trim() || !nameAr.trim()}>حفظ</Button>
          <Button onClick={onClose}>إلغاء</Button>
        </div>
      }
    >
      <FormField label="الكود">
        <TextInput value={code} onChange={(e) => setCode(e.target.value)} dir="ltr" />
      </FormField>
      <FormField label="الاسم">
        <TextInput value={nameAr} onChange={(e) => setNameAr(e.target.value)} />
      </FormField>
      <FormField label="النوع">
        <Select value={accountType} onChange={(e) => setAccountType(e.target.value as AccountType)}>
          {(Object.keys(ACCOUNT_TYPE_LABELS) as AccountType[]).map((type) => (
            <option key={type} value={type}>{ACCOUNT_TYPE_LABELS[type]}</option>
          ))}
        </Select>
      </FormField>
    </Modal>
  );
}

function AccountEditDialog({
  account,
  onClose,
  onSaved,
}: {
  account: AccountingAccount | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [nameAr, setNameAr] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (account) {
      setNameAr(account.name_ar);
      setIsActive(account.is_active);
    }
  }, [account]);

  const save = async () => {
    if (!account) return;
    setBusy(true);
    try {
      await updateAccount(account.id, { name_ar: nameAr.trim(), is_active: isActive });
      toast("تم تحديث الحساب");
      onSaved();
    } catch (e: any) {
      toast(e.message ?? "تعذر تحديث الحساب", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={!!account}
      onClose={onClose}
      title={account ? `تعديل الحساب ${account.code}` : "تعديل الحساب"}
      footer={
        <div className="inv-actions">
          <Button variant="primary" onClick={save} disabled={busy || !nameAr.trim()}>حفظ</Button>
          <Button onClick={onClose}>إلغاء</Button>
        </div>
      }
    >
      <FormField label="الاسم">
        <TextInput value={nameAr} onChange={(e) => setNameAr(e.target.value)} />
      </FormField>
      <FormField label="الحالة" hint="التعطيل بدل الحذف — الخادم يرفض تعطيل حساب مرتبط بقاعدة ترحيل">
        <Checkbox label="نشط" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
      </FormField>
    </Modal>
  );
}

function MappingDialog({
  open,
  mapping,
  accounts,
  onClose,
  onSaved,
}: {
  open: boolean;
  mapping: AccountingMapping | null;
  accounts: AccountingAccount[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [eventType, setEventType] = useState("");
  const [dimensionKey, setDimensionKey] = useState("default");
  const [debitId, setDebitId] = useState("");
  const [creditId, setCreditId] = useState("");
  const [vatId, setVatId] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setEventType(mapping?.event_type ?? "");
      setDimensionKey(mapping?.dimension_key ?? "default");
      setDebitId(mapping?.debit_account_id ?? "");
      setCreditId(mapping?.credit_account_id ?? "");
      setVatId(mapping?.vat_account_id ?? "");
    }
  }, [open, mapping]);

  const save = async () => {
    setBusy(true);
    try {
      if (mapping) {
        await updateMapping(mapping.id, {
          debit_account_id: debitId,
          credit_account_id: creditId,
          vat_account_id: vatId || null,
        });
        toast("تم تحديث قاعدة الترحيل");
      } else {
        await createMapping({
          event_type: eventType.trim(),
          dimension_key: dimensionKey.trim() || "default",
          debit_account_id: debitId,
          credit_account_id: creditId,
          vat_account_id: vatId || null,
        });
        toast("تم إنشاء قاعدة الترحيل");
      }
      onSaved();
    } catch (e: any) {
      toast(e.message ?? "تعذر حفظ قاعدة الترحيل", "error");
    } finally {
      setBusy(false);
    }
  };

  const accountOption = (account: AccountingAccount) => (
    <option key={account.id} value={account.id}>
      {account.code} — {account.name_ar}
    </option>
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        mapping
          ? `تعديل قاعدة ${financialEventTypeLabel(mapping.event_type)} — ${mappingDimensionLabel(mapping.dimension_key)}`
          : "قاعدة ترحيل جديدة"
      }
      footer={
        <div className="inv-actions">
          <Button
            variant="primary"
            onClick={save}
            disabled={busy || !debitId || !creditId || (!mapping && !eventType.trim())}
          >
            حفظ
          </Button>
          <Button onClick={onClose}>إلغاء</Button>
        </div>
      }
    >
      {!mapping && (
        <>
          <FormField label="نوع الحدث" hint="مثل payment.captured">
            <TextInput value={eventType} onChange={(e) => setEventType(e.target.value)} dir="ltr" />
          </FormField>
          <FormField label="البُعد" hint="default إن لم يوجد بُعد">
            <TextInput value={dimensionKey} onChange={(e) => setDimensionKey(e.target.value)} dir="ltr" />
          </FormField>
        </>
      )}
      <FormField label="الحساب المدين" hint="الحسابات النشطة فقط — الخادم يتحقق">
        <Select value={debitId} onChange={(e) => setDebitId(e.target.value)}>
          <option value="">اختر حسابًا</option>
          {accounts.map(accountOption)}
        </Select>
      </FormField>
      <FormField label="الحساب الدائن">
        <Select value={creditId} onChange={(e) => setCreditId(e.target.value)}>
          <option value="">اختر حسابًا</option>
          {accounts.map(accountOption)}
        </Select>
      </FormField>
      <FormField label="حساب ض.ق.م (اختياري)">
        <Select value={vatId} onChange={(e) => setVatId(e.target.value)}>
          <option value="">بدون</option>
          {accounts.map(accountOption)}
        </Select>
      </FormField>
    </Modal>
  );
}
