import { Badge } from "../../../components/ui/primitives";
import { fmtMoney, fmtQuantity } from "../inventoryApi";
import type { InventoryLevelRow, InventoryUnit } from "../inventoryTypes";

/**
 * S1.5 — levels & valuation straight from GET /inventory/levels.
 * quantity_on_hand / stock_value are authoritative server aggregates;
 * no balance or valuation math happens here.
 */
export function InventoryLevelsTable({
  rows,
  units,
}: {
  rows: InventoryLevelRow[];
  units: Map<string, InventoryUnit>;
}) {
  return (
    <table className="crm-table inv-table" dir="rtl">
      <thead>
        <tr>
          <th scope="col">الصنف</th>
          <th scope="col">الوحدة</th>
          <th scope="col">الموقع</th>
          <th scope="col">الكمية المتاحة</th>
          <th scope="col">قيمة المخزون</th>
          <th scope="col">الحالة</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const unit = units.get(row.base_unit_id);
          const qty = Number(row.quantity_on_hand);
          const reorder = Number(row.reorder_level);
          // مقارنة عرضية بين قيمتين سلطويتين من الخادم (ليست حساب رصيد).
          const low = Number.isFinite(qty) && Number.isFinite(reorder) && reorder > 0 && qty < reorder;
          return (
            <tr key={`${row.item_id}:${row.location_id}`}>
              <td>{row.name_ar}</td>
              <td>{unit ? `${unit.name_ar} (${unit.symbol})` : "غير متاح"}</td>
              <td>{row.location_name_ar}</td>
              <td className="mono inv-num">{fmtQuantity(row.quantity_on_hand)}</td>
              <td className="mono inv-num">{fmtMoney(row.stock_value)}</td>
              <td>
                {low ? (
                  <Badge tone="warning">تحت حد الطلب ({fmtQuantity(row.reorder_level)})</Badge>
                ) : (
                  <span className="muted">طبيعي</span>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
