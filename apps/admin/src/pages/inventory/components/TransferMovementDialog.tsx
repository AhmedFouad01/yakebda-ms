import { useEffect, useState } from "react";
import { Modal } from "../../../components/ui/overlays";
import { Button, FormField, NumberInput, Select, TextInput } from "../../../components/ui/primitives";
import { createInventoryTransfer } from "../inventoryApi";
import type { InventoryItem, InventoryLocation, InventoryUnit } from "../inventoryTypes";
import { useInventoryMutation } from "../useInventoryMutation";

/**
 * B5 — transfer create dialog over POST /inventory/transfers ONLY. Server
 * atomicity: both legs (transfer_out at source, transfer_in at destination)
 * run inside ONE db.transaction — either both apply or neither does. The
 * client's single idempotency_key is split server-side into `:out`/`:in`;
 * this dialog sends the raw key untouched.
 * No unit selector: source and destination are the same item, so quantity
 * is always sent in the item's base unit — no unit_id field, keeping this
 * screen free of cross-location unit-conversion complexity. The contract
 * doesn't even accept unit_cost for transfers — destination cost is
 * derived server-side from the source leg's moving average automatically.
 * `reason` is required by the contract itself (like B3 waste).
 * Success is declared ONLY after server confirmation.
 */

interface DialogProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  locations: InventoryLocation[];
  items: InventoryItem[];
  unitsById: Map<string, InventoryUnit>;
}

export function TransferMovementDialog({ open, onClose, onSaved, locations, items, unitsById }: DialogProps) {
  const [sourceLocationId, setSourceLocationId] = useState("");
  const [destinationLocationId, setDestinationLocationId] = useState("");
  const [itemId, setItemId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("");
  // مفتاح واحد لكل فتح للـ dialog — يُعاد استخدامه عند إعادة المحاولة بعد فشل،
  // ويُستبدل فقط عند فتح عملية جديدة (open ينتقل من false إلى true).
  // الخادم يقسّمه داخليًا إلى `${key}:out` و `${key}:in` — نرسل المفتاح الخام كما هو.
  const [idempotencyKey, setIdempotencyKey] = useState("");
  const m = useInventoryMutation();

  useEffect(() => {
    if (open) {
      setSourceLocationId("");
      setDestinationLocationId("");
      setItemId("");
      setQuantity("");
      setReason("");
      setIdempotencyKey(crypto.randomUUID());
    }
  }, [open]);

  const sameLocation = !!sourceLocationId && sourceLocationId === destinationLocationId;
  const quantityNumber = Number(quantity);
  const valid =
    !!sourceLocationId &&
    !!destinationLocationId &&
    !sameLocation &&
    !!itemId &&
    quantity.trim() !== "" &&
    Number.isFinite(quantityNumber) &&
    quantityNumber > 0 &&
    reason.trim().length > 0 &&
    reason.trim().length <= 500;

  const selectedItem = items.find((i) => i.id === itemId);
  const baseUnit = selectedItem ? unitsById.get(selectedItem.base_unit_id) : undefined;

  function submit() {
    m.run(
      () =>
        createInventoryTransfer({
          source_location_id: sourceLocationId,
          destination_location_id: destinationLocationId,
          item_id: itemId,
          quantity: quantity.trim(),
          reason: reason.trim(),
          idempotency_key: idempotencyKey,
        }),
      "تم تسجيل التحويل",
      onSaved,
      {
        // 409 هنا يحدث فقط على جانب المصدر (transfer_out) — لا الوجهة أبدًا.
        conflictMessage: "الكمية المطلوبة أكبر من الرصيد المتاح في موقع المصدر.",
        conflictField: "quantity",
      }
    );
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="تحويل مخزون جديد"
      footer={
        <>
          <Button variant="primary" disabled={!valid || m.busy} onClick={submit}>
            {m.busy ? "جارٍ الحفظ…" : "تسجيل التحويل"}
          </Button>
          <Button onClick={onClose}>إلغاء</Button>
        </>
      }
    >
      {m.formError && <div className="alert" role="alert">{m.formError}</div>}
      <FormField label="من موقع (المصدر)" error={m.fieldErrors.source_location_id}>
        <Select value={sourceLocationId} onChange={(e) => setSourceLocationId(e.target.value)}>
          <option value="">اختر موقع المصدر…</option>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>{l.name_ar}</option>
          ))}
        </Select>
      </FormField>
      <FormField
        label="إلى موقع (الوجهة)"
        error={m.fieldErrors.destination_location_id ?? (sameLocation ? "يجب اختيار موقع مخزون مختلف عن المصدر." : undefined)}
      >
        <Select value={destinationLocationId} onChange={(e) => setDestinationLocationId(e.target.value)}>
          <option value="">اختر موقع الوجهة…</option>
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
      <FormField
        label="الكمية"
        error={m.fieldErrors.quantity}
        hint={baseUnit ? `بالوحدة الأساسية للصنف: ${baseUnit.name_ar} (${baseUnit.symbol})` : "بالوحدة الأساسية للصنف"}
      >
        <NumberInput value={quantity} onChange={(e) => setQuantity(e.target.value)} min="0" step="any" dir="ltr" />
      </FormField>
      <FormField label="السبب" error={m.fieldErrors.reason} hint="مطلوب — سبب التحويل، حتى 500 حرف">
        <TextInput value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
      </FormField>
    </Modal>
  );
}
