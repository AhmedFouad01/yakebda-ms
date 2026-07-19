import { useEffect, useState } from "react";
import { Modal, toast } from "../../../components/ui/overlays";
import { Button, FormField, NumberInput, Select, TextInput } from "../../../components/ui/primitives";
import { createInventoryPurchaseReceipt, fieldErrorsOf } from "../inventoryApi";
import type { InventoryItem, InventoryLocation, InventorySupplier, InventoryUnit } from "../inventoryTypes";

/**
 * B1 — purchase-receipt create dialog over POST /inventory/purchase-receipts
 * ONLY (no /movements generic path here). No read endpoint exists for a
 * dedicated receipts log; the movements tab already covers that — not
 * duplicated here. Success is declared ONLY after server confirmation.
 */

interface DialogProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  locations: InventoryLocation[];
  items: InventoryItem[];
  suppliers: InventorySupplier[];
  units: InventoryUnit[];
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

export function PurchaseReceiptDialog({ open, onClose, onSaved, locations, items, suppliers, units }: DialogProps) {
  const [locationId, setLocationId] = useState("");
  const [itemId, setItemId] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unitId, setUnitId] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [receiptReference, setReceiptReference] = useState("");
  // مفتاح واحد لكل فتح للـ dialog — يُعاد استخدامه عند إعادة المحاولة بعد فشل،
  // ويُستبدل فقط عند فتح عملية جديدة (open ينتقل من false إلى true).
  const [idempotencyKey, setIdempotencyKey] = useState("");
  const m = useMutation();

  useEffect(() => {
    if (open) {
      setLocationId("");
      setItemId("");
      setSupplierId("");
      setQuantity("");
      setUnitId("");
      setUnitCost("");
      setReceiptReference("");
      setIdempotencyKey(crypto.randomUUID());
    }
  }, [open]);

  const quantityNumber = Number(quantity);
  const unitCostNumber = Number(unitCost);
  const valid =
    !!locationId &&
    !!itemId &&
    !!supplierId &&
    quantity.trim() !== "" &&
    Number.isFinite(quantityNumber) &&
    quantityNumber > 0 &&
    unitCost.trim() !== "" &&
    Number.isFinite(unitCostNumber) &&
    unitCostNumber >= 0 &&
    receiptReference.trim().length > 0 &&
    receiptReference.trim().length <= 160;

  function submit() {
    m.run(
      () =>
        createInventoryPurchaseReceipt({
          location_id: locationId,
          item_id: itemId,
          supplier_id: supplierId,
          quantity: quantity.trim(),
          unit_id: unitId || undefined,
          unit_cost: unitCost.trim(),
          receipt_reference: receiptReference.trim(),
          idempotency_key: idempotencyKey,
        }),
      "تم تسجيل الاستلام",
      onSaved
    );
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="استلام مشتريات جديد"
      footer={
        <>
          <Button variant="primary" disabled={!valid || m.busy} onClick={submit}>
            {m.busy ? "جارٍ الحفظ…" : "تسجيل الاستلام"}
          </Button>
          <Button onClick={onClose}>إلغاء</Button>
        </>
      }
    >
      {m.formError && <div className="alert" role="alert">{m.formError}</div>}
      <FormField label="الموقع المخزني" error={m.fieldErrors.location_id}>
        <Select value={locationId} onChange={(e) => setLocationId(e.target.value)}>
          <option value="">اختر الموقع…</option>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>{l.name_ar}</option>
          ))}
        </Select>
      </FormField>
      <FormField label="الصنف" error={m.fieldErrors.item_id}>
        <Select value={itemId} onChange={(e) => setItemId(e.target.value)}>
          <option value="">اختر الصنف…</option>
          {items.map((i) => (
            <option key={i.id} value={i.id}>{i.name_ar}</option>
          ))}
        </Select>
      </FormField>
      <FormField label="المورّد" error={m.fieldErrors.supplier_id}>
        <Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
          <option value="">اختر المورّد…</option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>{s.name_ar}</option>
          ))}
        </Select>
      </FormField>
      <FormField label="الكمية" error={m.fieldErrors.quantity} hint="بوحدة الاستلام أدناه (أو الوحدة الأساسية إن لم تُحدَّد)">
        <NumberInput value={quantity} onChange={(e) => setQuantity(e.target.value)} min="0" step="any" dir="ltr" />
      </FormField>
      <FormField label="الوحدة" error={m.fieldErrors.unit_id} hint="اختياري — الوحدة الأساسية للصنف افتراضيًا">
        <Select value={unitId} onChange={(e) => setUnitId(e.target.value)}>
          <option value="">الوحدة الأساسية للصنف</option>
          {units.map((u) => (
            <option key={u.id} value={u.id}>{u.name_ar} ({u.symbol})</option>
          ))}
        </Select>
      </FormField>
      <FormField label="تكلفة الوحدة" error={m.fieldErrors.unit_cost} hint="بعملة الحساب">
        <NumberInput value={unitCost} onChange={(e) => setUnitCost(e.target.value)} min="0" step="any" dir="ltr" />
      </FormField>
      <FormField label="مرجع الاستلام" error={m.fieldErrors.receipt_reference} hint="رقم فاتورة المورّد أو مرجع مشابه — حتى 160 حرفًا">
        <TextInput value={receiptReference} onChange={(e) => setReceiptReference(e.target.value)} maxLength={160} />
      </FormField>
    </Modal>
  );
}
