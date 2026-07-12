from __future__ import annotations

from pathlib import Path

PATH = Path("apps/admin/src/pages/Pos.tsx")


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected one exact match, found {count}")
    return text.replace(old, new, 1)


def main() -> None:
    text = PATH.read_text(encoding="utf-8")

    text = replace_once(
        text,
        '''  async function openShift() {
    const cash = window.prompt(t.shift.openingCash, "0");
    if (cash == null) return;
    try {
      await api("/shifts/open", { method: "POST", body: { branch_id: branchId, opening_cash: Number(cash) || 0 } });
      await loadShift(branchId);
      setError("");
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function closeShift() {
    if (!shift) return;
    const cash = window.prompt(t.shift.closingCash, "0");
    if (cash == null) return;
    try {
      await api(`/shifts/${shift.id}/close`, { method: "POST", body: { actual_cash: Number(cash) || 0 } });
      await loadShift(branchId);
      setError("");
    } catch (e: any) {
      setError(e.message);
    }
  }
''',
        '''  async function openShift(openingCash: number): Promise<boolean> {
    if (!branchId) return false;
    try {
      await api("/shifts/open", { method: "POST", body: { branch_id: branchId, opening_cash: openingCash } });
      await loadShift(branchId);
      setError("");
      return true;
    } catch (e: any) {
      setError(e.message);
      return false;
    }
  }

  async function closeShift(actualCash: number): Promise<boolean> {
    if (!shift) return false;
    try {
      await api(`/shifts/${shift.id}/close`, { method: "POST", body: { actual_cash: actualCash } });
      await loadShift(branchId);
      setError("");
      return true;
    } catch (e: any) {
      setError(e.message);
      return false;
    }
  }
''',
        "replace prompt based shift actions",
    )

    text = replace_once(
        text,
        '''              {can("shifts.manage") && <button onClick={shift ? closeShift : openShift}>{shift ? t.shift.close : t.shift.open}</button>}''',
        '''              {can("shifts.manage") && <button onClick={() => setAdminPanel("shift")}>{shift ? t.shift.close : t.shift.open}</button>}''',
        "open shift modal from toolbar",
    )

    text = replace_once(
        text,
        '''function ShiftPanel({ shift, money, openShift, closeShift }: { shift: Shift | null; money: (value: number) => string; openShift: () => void; closeShift: () => void }) {
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
      <div className="pos-actions"><button className="primary" onClick={shift ? closeShift : openShift}>{shift ? "إغلاق الشيفت" : "فتح شيفت"}</button></div>
    </div>
  );
}
''',
        '''function ShiftPanel({
  shift,
  money,
  openShift,
  closeShift,
}: {
  shift: Shift | null;
  money: (value: number) => string;
  openShift: (openingCash: number) => Promise<boolean>;
  closeShift: (actualCash: number) => Promise<boolean>;
}) {
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
''',
        "replace shift panel with validated form",
    )

    PATH.write_text(text, encoding="utf-8", newline="\n")
    print(f"Updated {PATH}")


if __name__ == "__main__":
    main()
