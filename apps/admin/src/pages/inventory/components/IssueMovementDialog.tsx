import { useEffect, useState } from "react";
import { Modal } from "../../../components/ui/overlays";
import { Button, FormField, NumberInput, Select, TextInput } from "../../../components/ui/primitives";
import { createInventoryIssue } from "../inventoryApi";
import type { InventoryItem, InventoryLocation, InventoryUnit } from "../inventoryTypes";
import { useInventoryMutation } from "../useInventoryMutation";

/**
 * B2 — issue create dialog over POST /inventory/movements (movement_type=issue)
 * ONLY. movement_type and source_type are fixed internally, not user-facing —
 * the generic /movements contract takes a free-text source_type but this
 * screen only ever emits one kind of write. `reason` is optional in the
 * contract; required here in the UI only (client-side rule, not a server
 * constraint) since an issue reduces stock and needs a stated justification.
 * Success is declared ONLY after server confirmation.
 */

interface DialogProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  locations: InventoryLocation[];
  items: InventoryItem[];
  units: InventoryUnit[];
}

export function IssueMovementDialog({ open, onClose, onSaved, locations, items, units }: DialogProps) {
  const [locationId, setLocationId] = useState("");
  const [itemId, setItemId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unitId, setUnitId] = useState("");
  const [reason, setReason] = useState("");
  // مفتاح واحد لكل فتح للـ dialog — يُعاد استخدامه عند إعادة المحاولة بعد فشل،
  // ويُستبدل فقط عند فتح عملية جديدة (open ينتقل من false إلى true).
  const [idempotencyKey, setIdempotencyKey] = useState("");
  const m = useInventoryMutation();

  useEffect(() => {
    if (open) {
      setLocationId("");
      setItemId("");
      setQuantity("");
      setUnitId("");
      setReason("");
      setIdempotencyKey(crypto.randomUUID());
    }
  }, [open]);

  const quantityNumber = Number(quantity);
  const valid =
    !!locationId &&
    !!itemId &&
    quantity.trim() !== "" &&
    Number.isFinite(quantityNumber) &&
    quantityNumber > 0 &&
    reason.trim().length > 0 &&
    reason.trim().length <= 500;

  function submit() {
    m.run(
      () =>
        createInventoryIssue({
          location_id: locationId,
          item_id: itemId,
          quantity: quantity.trim(),
          unit_id: unitId || undefined,
          reason: reason.trim(),
          idempotency_key: idempotencyKey,
        }),
      "تم تسجيل الصرف",
      onSaved,
      {
        // err.conflict() في الخادم (apps/api/src/lib/errors.ts) لا يرسل الكمية المتاحة فعليًا ضمن
        // جسم الخطأ (لا details إطلاقًا) — لذا الرسالة عامة عن قصد، لا نختلق رقمًا غير موجود.
        conflictMessage: "الكمية المطلوبة أكبر من الرصيد المتاح في هذا الموقع.",
        conflictField: "quantity",
      }
    );
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="صرف جديد"
      footer={
        <>
          <Button variant="primary" disabled={!valid || m.busy} onClick={submit}>
            {m.busy ? "جارٍ الحفظ…" : "تسجيل الصرف"}
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
      <FormField label="الكمية" error={m.fieldErrors.quantity} hint="بوحدة الصرف أدناه (أو الوحدة الأساسية إن لم تُحدَّد)">
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
      <FormField label="السبب" error={m.fieldErrors.reason} hint="مطلوب — سبب الصرف، حتى 500 حرف">
        <TextInput value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
      </FormField>
    </Modal>
  );
}
