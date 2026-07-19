import { useEffect, useState } from "react";
import { Modal } from "../../../components/ui/overlays";
import { Button, FormField, NumberInput, Select, TextInput } from "../../../components/ui/primitives";
import { createInventoryAdjustment } from "../inventoryApi";
import type { InventoryItem, InventoryLocation, InventoryUnit } from "../inventoryTypes";
import { useInventoryMutation } from "../useInventoryMutation";

type Direction = "increase" | "decrease";

/**
 * B4 — adjustment create dialog over POST /inventory/movements (movement_type=adjustment)
 * ONLY. The contract takes a single SIGNED quantity (client picks +/-, the
 * server never computes a delta from a target balance) — "direction" here
 * is a UI-only concept that flips the sign before sending, it is not a
 * server field. `reason` is optional in the contract but required here in
 * the UI: an adjustment is a manual balance override with no external
 * document backing it, so every one must be justified and auditable.
 * `unit_cost` only makes sense on an increase (the server ignores/derives
 * it from the moving average on a decrease), so it's hidden for decreases.
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

export function AdjustmentMovementDialog({ open, onClose, onSaved, locations, items, units }: DialogProps) {
  const [locationId, setLocationId] = useState("");
  const [itemId, setItemId] = useState("");
  const [direction, setDirection] = useState<Direction>("increase");
  const [quantity, setQuantity] = useState("");
  const [unitId, setUnitId] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [reason, setReason] = useState("");
  // مفتاح واحد لكل فتح للـ dialog — يُعاد استخدامه عند إعادة المحاولة بعد فشل،
  // ويُستبدل فقط عند فتح عملية جديدة (open ينتقل من false إلى true).
  const [idempotencyKey, setIdempotencyKey] = useState("");
  const m = useInventoryMutation();

  useEffect(() => {
    if (open) {
      setLocationId("");
      setItemId("");
      setDirection("increase");
      setQuantity("");
      setUnitId("");
      setUnitCost("");
      setReason("");
      setIdempotencyKey(crypto.randomUUID());
    }
  }, [open]);

  const quantityNumber = Number(quantity);
  const unitCostNumber = Number(unitCost);
  const valid =
    !!locationId &&
    !!itemId &&
    quantity.trim() !== "" &&
    Number.isFinite(quantityNumber) &&
    quantityNumber > 0 &&
    (direction === "decrease" || unitCost.trim() === "" || (Number.isFinite(unitCostNumber) && unitCostNumber >= 0)) &&
    reason.trim().length > 0 &&
    reason.trim().length <= 500;

  function submit() {
    const signedQuantity = direction === "decrease" ? `-${quantity.trim()}` : quantity.trim();
    m.run(
      () =>
        createInventoryAdjustment({
          location_id: locationId,
          item_id: itemId,
          quantity: signedQuantity,
          unit_id: unitId || undefined,
          unit_cost: direction === "increase" && unitCost.trim() ? unitCost.trim() : undefined,
          reason: reason.trim(),
          idempotency_key: idempotencyKey,
        }),
      "تم تسجيل التسوية",
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
      title="تسوية رصيد جديدة"
      footer={
        <>
          <Button variant="primary" disabled={!valid || m.busy} onClick={submit}>
            {m.busy ? "جارٍ الحفظ…" : "تسجيل التسوية"}
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
      <FormField label="اتجاه التسوية">
        <Select value={direction} onChange={(e) => setDirection(e.target.value as Direction)}>
          <option value="increase">زيادة</option>
          <option value="decrease">نقصان</option>
        </Select>
      </FormField>
      <FormField label="الكمية" error={m.fieldErrors.quantity} hint="المقدار المطلق للتسوية — بوحدة أدناه (أو الوحدة الأساسية إن لم تُحدَّد)">
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
      {direction === "increase" && (
        <FormField label="تكلفة الوحدة" error={m.fieldErrors.unit_cost} hint="اختياري — تُستخدم متوسط التكلفة الحالي إن تُرك فارغًا (مطلوب إن كان هذا أول رصيد للصنف)">
          <NumberInput value={unitCost} onChange={(e) => setUnitCost(e.target.value)} min="0" step="any" dir="ltr" />
        </FormField>
      )}
      <FormField label="السبب" error={m.fieldErrors.reason} hint="مطلوب — سبب التسوية، حتى 500 حرف">
        <TextInput value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
      </FormField>
    </Modal>
  );
}
