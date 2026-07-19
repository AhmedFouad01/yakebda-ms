import { useEffect, useState } from "react";
import { Modal } from "../../../components/ui/overlays";
import { Button, FormField, NumberInput, Select, TextInput } from "../../../components/ui/primitives";
import { createInventoryWaste } from "../inventoryApi";
import type { InventoryItem, InventoryLocation, InventoryUnit } from "../inventoryTypes";
import { useInventoryMutation } from "../useInventoryMutation";

/**
 * B3 — waste create dialog over POST /inventory/waste ONLY. Unlike B2 issue,
 * `reason` is required by the contract itself (not just a UI-level rule) —
 * the server rejects an empty reason with a 422 on its own.
 * There is no approval flow or cap on this endpoint (documented gap, not
 * simulated here — see PR notes). Success is declared ONLY after server
 * confirmation.
 */

interface DialogProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  locations: InventoryLocation[];
  items: InventoryItem[];
  units: InventoryUnit[];
}

export function WasteMovementDialog({ open, onClose, onSaved, locations, items, units }: DialogProps) {
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
        createInventoryWaste({
          location_id: locationId,
          item_id: itemId,
          quantity: quantity.trim(),
          unit_id: unitId || undefined,
          reason: reason.trim(),
          idempotency_key: idempotencyKey,
        }),
      "تم تسجيل الهدر",
      onSaved,
      {
        // err.conflict() في الخادم لا يرسل الكمية المتاحة فعليًا ضمن جسم الخطأ (لا details إطلاقًا)
        // لذا الرسالة عامة عن قصد، لا نختلق رقمًا غير موجود.
        conflictMessage: "الكمية المطلوبة أكبر من الرصيد المتاح في هذا الموقع.",
        conflictField: "quantity",
      }
    );
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="هدر جديد"
      footer={
        <>
          <Button variant="primary" disabled={!valid || m.busy} onClick={submit}>
            {m.busy ? "جارٍ الحفظ…" : "تسجيل الهدر"}
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
      <FormField label="الكمية" error={m.fieldErrors.quantity} hint="بوحدة الهدر أدناه (أو الوحدة الأساسية إن لم تُحدَّد)">
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
      <FormField label="السبب" error={m.fieldErrors.reason} hint="مطلوب — سبب الهدر، حتى 500 حرف">
        <TextInput value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
      </FormField>
    </Modal>
  );
}
