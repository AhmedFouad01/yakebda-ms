import { useState } from "react";
import { toast } from "../../components/ui/overlays";
import { fieldErrorsOf, isInsufficientStockError } from "./inventoryApi";

/**
 * Shared write-mutation state machine for inventory operation dialogs
 * (B1 purchase-receipts, B2 issue, …). Extracted out of per-dialog copies
 * once a third consumer needed it. Success is declared ONLY after server
 * confirmation. A 409 (insufficient stock) can be surfaced as a field-level
 * error via `conflictField`/`conflictMessage` — err.conflict() in the API
 * (apps/api/src/lib/errors.ts) never carries a `details` payload, so the
 * server never tells us the actual available quantity; the message given
 * here MUST stay a generic "exceeds available stock" statement, not a
 * fabricated number.
 */
export function useInventoryMutation() {
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  async function run(
    mutate: () => Promise<unknown>,
    successText: string,
    onSaved: () => void,
    options?: { conflictMessage?: string; conflictField?: string }
  ) {
    if (busy) return; // منع الإرسال المزدوج
    setBusy(true);
    setFormError("");
    setFieldErrors({});
    try {
      await mutate(); // النجاح فقط بعد تأكيد الخادم
      toast(successText);
      onSaved();
    } catch (e: unknown) {
      if (options?.conflictMessage && isInsufficientStockError(e)) {
        if (options.conflictField) {
          setFieldErrors({ [options.conflictField]: options.conflictMessage });
        } else {
          setFormError(options.conflictMessage);
        }
        return;
      }
      const fields = fieldErrorsOf(e);
      setFieldErrors(fields);
      setFormError(Object.keys(fields).length ? "" : (e as Error).message || "تعذر تنفيذ العملية");
    } finally {
      setBusy(false);
    }
  }

  return { busy, formError, fieldErrors, run };
}
