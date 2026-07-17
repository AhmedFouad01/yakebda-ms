import { useState } from "react";
import { Modal, toast } from "../../../components/ui/overlays";
import { Button, FormField, NumberInput, Select, TextInput } from "../../../components/ui/primitives";
import {
  createInventoryConversion,
  createInventoryItem,
  createInventorySupplier,
  createInventoryUnit,
  fieldErrorsOf,
} from "../inventoryApi";
import type { InventoryUnit } from "../inventoryTypes";

/**
 * S2.2–S2.5 — create dialogs over the CURRENT contracts only.
 * The API supports create-only for master data (no edit/disable/delete
 * endpoints exist — documented gap), so these dialogs are the entire
 * legitimate management surface. Success is declared ONLY after server
 * confirmation; server field errors render inline and inputs survive
 * recoverable failures. Modal supplies focus trap + restoration.
 */

interface DialogProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

function useMutation() {
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  async function run(mutate: () => Promise<unknown>, successText: string, onSaved: () => void) {
    if (busy) return; // منع الإرسال المزدوج
    setBusy(true);
    setFormError("");
    setFieldErrors({});
    try {
      await mutate(); // النجاح فقط بعد تأكيد الخادم
      toast(successText);
      onSaved();
    } catch (e: unknown) {
      const fields = fieldErrorsOf(e);
      setFieldErrors(fields);
      setFormError(Object.keys(fields).length ? "" : (e as Error).message || "تعذر تنفيذ العملية");
    } finally {
      setBusy(false);
    }
  }
  return { busy, formError, fieldErrors, run };
}

export function UnitCreateDialog({ open, onClose, onSaved }: DialogProps) {
  const [nameAr, setNameAr] = useState("");
  const [symbol, setSymbol] = useState("");
  const m = useMutation();
  const valid = nameAr.trim().length > 0 && nameAr.trim().length <= 80 && symbol.trim().length > 0 && symbol.trim().length <= 20;

  return (
    <Modal open={open} onClose={onClose} title="وحدة قياس جديدة"
      footer={<>
        <Button variant="primary" disabled={!valid || m.busy}
          onClick={() => m.run(() => createInventoryUnit({ name_ar: nameAr.trim(), symbol: symbol.trim() }), "تمت إضافة الوحدة", onSaved)}>
          {m.busy ? "جارٍ الحفظ…" : "إضافة"}
        </Button>
        <Button onClick={onClose}>إلغاء</Button>
      </>}>
      {m.formError && <div className="alert" role="alert">{m.formError}</div>}
      <FormField label="اسم الوحدة" error={m.fieldErrors.name_ar} hint="مثال: كيلوجرام — حتى 80 حرفًا">
        <TextInput value={nameAr} onChange={(e) => setNameAr(e.target.value)} maxLength={80} />
      </FormField>
      <FormField label="الرمز" error={m.fieldErrors.symbol} hint="مثال: كجم — حتى 20 حرفًا، فريد داخل الحساب">
        <TextInput value={symbol} onChange={(e) => setSymbol(e.target.value)} maxLength={20} />
      </FormField>
    </Modal>
  );
}

export function ConversionCreateDialog({ open, onClose, onSaved, units }: DialogProps & { units: InventoryUnit[] }) {
  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [factor, setFactor] = useState("");
  const m = useMutation();
  const selfConversion = !!fromId && fromId === toId;
  const factorNumber = Number(factor);
  const valid = !!fromId && !!toId && !selfConversion && factor.trim() !== "" && Number.isFinite(factorNumber) && factorNumber > 0;

  return (
    <Modal open={open} onClose={onClose} title="معامل تحويل جديد"
      footer={<>
        <Button variant="primary" disabled={!valid || m.busy}
          onClick={() => m.run(() => createInventoryConversion({ from_unit_id: fromId, to_unit_id: toId, factor: factor.trim() }), "تمت إضافة معامل التحويل", onSaved)}>
          {m.busy ? "جارٍ الحفظ…" : "إضافة"}
        </Button>
        <Button onClick={onClose}>إلغاء</Button>
      </>}>
      {m.formError && <div className="alert" role="alert">{m.formError}</div>}
      <FormField label="من وحدة" error={m.fieldErrors.from_unit_id}>
        <Select value={fromId} onChange={(e) => setFromId(e.target.value)}>
          <option value="">اختر الوحدة…</option>
          {units.map((u) => <option key={u.id} value={u.id}>{u.name_ar} ({u.symbol})</option>)}
        </Select>
      </FormField>
      <FormField label="إلى وحدة" error={m.fieldErrors.to_unit_id ?? (selfConversion ? "لا يمكن التحويل من وحدة إلى نفسها." : undefined)}>
        <Select value={toId} onChange={(e) => setToId(e.target.value)}>
          <option value="">اختر الوحدة…</option>
          {units.map((u) => <option key={u.id} value={u.id}>{u.name_ar} ({u.symbol})</option>)}
        </Select>
      </FormField>
      <FormField label="المعامل" error={m.fieldErrors.factor}
        hint="عدد وحدات الهدف المكافئ لواحدة مصدر — الدقة تُحفظ كما يخزنها الخادم (حتى 8 منازل)">
        <NumberInput value={factor} onChange={(e) => setFactor(e.target.value)} min="0" step="any" dir="ltr" />
      </FormField>
    </Modal>
  );
}

export function ItemCreateDialog({ open, onClose, onSaved, units }: DialogProps & { units: InventoryUnit[] }) {
  const [nameAr, setNameAr] = useState("");
  const [sku, setSku] = useState("");
  const [baseUnitId, setBaseUnitId] = useState("");
  const [reorderLevel, setReorderLevel] = useState("0");
  const m = useMutation();
  const valid = nameAr.trim().length > 0 && nameAr.trim().length <= 160 && !!baseUnitId;

  return (
    <Modal open={open} onClose={onClose} title="صنف مخزني جديد"
      footer={<>
        <Button variant="primary" disabled={!valid || m.busy}
          onClick={() => m.run(
            () => createInventoryItem({
              name_ar: nameAr.trim(),
              sku: sku.trim() || undefined,
              base_unit_id: baseUnitId,
              reorder_level: reorderLevel.trim() || "0",
            }),
            "تمت إضافة الصنف",
            onSaved
          )}>
          {m.busy ? "جارٍ الحفظ…" : "إضافة"}
        </Button>
        <Button onClick={onClose}>إلغاء</Button>
      </>}>
      {m.formError && <div className="alert" role="alert">{m.formError}</div>}
      <FormField label="اسم الصنف" error={m.fieldErrors.name_ar}>
        <TextInput value={nameAr} onChange={(e) => setNameAr(e.target.value)} maxLength={160} />
      </FormField>
      <FormField label="كود الصنف (SKU)" error={m.fieldErrors.sku} hint="اختياري — فريد داخل الحساب">
        <TextInput value={sku} onChange={(e) => setSku(e.target.value)} maxLength={80} dir="ltr" />
      </FormField>
      <FormField label="الوحدة الأساسية" error={m.fieldErrors.base_unit_id}>
        <Select value={baseUnitId} onChange={(e) => setBaseUnitId(e.target.value)}>
          <option value="">اختر الوحدة…</option>
          {units.map((u) => <option key={u.id} value={u.id}>{u.name_ar} ({u.symbol})</option>)}
        </Select>
      </FormField>
      <FormField label="حد إعادة الطلب" error={m.fieldErrors.reorder_level} hint="بالوحدة الأساسية — لا يغيّر الرصيد">
        <NumberInput value={reorderLevel} onChange={(e) => setReorderLevel(e.target.value)} min="0" step="any" dir="ltr" />
      </FormField>
    </Modal>
  );
}

export function SupplierCreateDialog({ open, onClose, onSaved }: DialogProps) {
  const [nameAr, setNameAr] = useState("");
  const [phone, setPhone] = useState("");
  const m = useMutation();
  const valid = nameAr.trim().length > 0 && nameAr.trim().length <= 160;

  return (
    <Modal open={open} onClose={onClose} title="مورد جديد"
      footer={<>
        <Button variant="primary" disabled={!valid || m.busy}
          onClick={() => m.run(() => createInventorySupplier({ name_ar: nameAr.trim(), phone: phone.trim() || undefined }), "تمت إضافة المورد", onSaved)}>
          {m.busy ? "جارٍ الحفظ…" : "إضافة"}
        </Button>
        <Button onClick={onClose}>إلغاء</Button>
      </>}>
      {m.formError && <div className="alert" role="alert">{m.formError}</div>}
      <FormField label="اسم المورد" error={m.fieldErrors.name_ar}>
        <TextInput value={nameAr} onChange={(e) => setNameAr(e.target.value)} maxLength={160} />
      </FormField>
      <FormField label="الهاتف" error={m.fieldErrors.phone} hint="اختياري">
        <TextInput value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={40} dir="ltr" />
      </FormField>
    </Modal>
  );
}
