import { Badge } from "../../../components/ui/primitives";
import { fmtDateTime, fmtMoney, fmtQuantity, MOVEMENT_TYPE_AR } from "../inventoryApi";
import type { InventoryItem, InventoryLocation, InventoryMovementRow } from "../inventoryTypes";

/**
 * S1.6 — read-only movement history from GET /inventory/movements.
 * Rows are rendered as returned; balances are never reconstructed here.
 */
export function InventoryMovementsTable({
  rows,
  items,
  locations,
}: {
  rows: InventoryMovementRow[];
  items: Map<string, InventoryItem>;
  locations: Map<string, InventoryLocation>;
}) {
  return (
    <table className="crm-table inv-table" dir="rtl">
      <thead>
        <tr>
          <th scope="col">التاريخ</th>
          <th scope="col">الصنف</th>
          <th scope="col">الموقع</th>
          <th scope="col">النوع</th>
          <th scope="col">الكمية (أساسي)</th>
          <th scope="col">القيمة</th>
          <th scope="col">المصدر</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((m) => (
          <tr key={m.id}>
            <td className="muted">{fmtDateTime(m.created_at)}</td>
            <td>{items.get(m.item_id)?.name_ar ?? "صنف غير نشط"}</td>
            <td>{locations.get(m.location_id)?.name_ar ?? "غير متاح"}</td>
            <td>
              <Badge tone={Number(m.quantity_base) < 0 ? "danger" : "success"}>
                {MOVEMENT_TYPE_AR[m.movement_type] ?? m.movement_type}
              </Badge>
              {m.reversal_of_movement_id && <span className="muted inv-rev"> (عكس لحركة سابقة)</span>}
            </td>
            <td className="mono inv-num">{fmtQuantity(m.quantity_base)}</td>
            <td className="mono inv-num">{fmtMoney(m.total_value)}</td>
            <td className="muted">
              {m.source_type}
              {m.source_id ? <span className="mono"> #{m.source_id.slice(0, 12)}</span> : null}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
