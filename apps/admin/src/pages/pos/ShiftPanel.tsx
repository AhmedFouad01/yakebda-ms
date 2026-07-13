import { useState } from "react";
import { t } from "../../lib/t";
import { usePosController } from "./PosContext";
import { money } from "./posUtils";

export function ShiftPanel() {
  const { shift, openShift, closeShift } = usePosController();
  const [cashValue, setCashValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [panelError, setPanelError] = useState("");

  async function submitShiftAction() {
    if (busy) return;
    const amount = Number(cashValue);
    if (!Number.isFinite(amount) || amount < 0) {
      setPanelError("أدخل مبلغًا صحيحًا لا يقل عن صفر");
      return;
    }
    setBusy(true);
    setPanelError("");
    const ok = shift ? await closeShift(amount) : await openShift(amount);
    if (ok) setCashValue("");
    setBusy(false);
  }

  return (
    <div>
      <h3>إدارة الشيفت</h3>
      <div className="posx-shift-stats large">
        <div><span>حالة الشيفت</span><b>{shift ? "مفتوح" : "مغلق"}</b></div>
        <div><span>افتتاحي</span><b>{money(Number(shift?.opening_cash ?? 0))}</b></div>
        <div><span>نقدي</span><b>{money(Number(shift?.totals?.cash_sales ?? 0))}</b></div>
        <div><span>طلبات</span><b>{shift?.totals?.orders_count ?? 0}</b></div>
        <div><span>المتوقع</span><b>{money(Number(shift?.totals?.expected_cash ?? 0))}</b></div>
      </div>
      <label className="field">
        <span>{shift ? t.shift.closingCash : t.shift.openingCash}</span>
        <input
          type="number"
          min="0"
          step="0.01"
          inputMode="decimal"
          value={cashValue}
          onChange={(event) => setCashValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void submitShiftAction();
          }}
          disabled={busy}
          autoFocus
        />
      </label>
      {panelError && <div className="alert">{panelError}</div>}
      <div className="pos-actions">
        <button className="primary" disabled={busy || cashValue === ""} onClick={() => void submitShiftAction()}>
          {busy ? "جارٍ الحفظ…" : shift ? "إغلاق الشيفت" : "فتح شيفت"}
        </button>
      </div>
    </div>
  );
}
