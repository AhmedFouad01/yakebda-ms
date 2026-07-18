import { FormField, Select } from "../../../components/ui/primitives";
import type { InventoryLocation } from "../inventoryTypes";

/**
 * S1.4 — Inventory location selector over the CURRENT contract:
 * GET /inventory/locations already enforces account + user-branch scope
 * server-side; this component only presents what the API returned.
 * "" ⇒ كل المواقع (no client-side location filtering key).
 */
export function InventoryLocationSelect({
  locations,
  value,
  onChange,
  branchNames,
}: {
  locations: InventoryLocation[];
  value: string;
  onChange: (locationId: string) => void;
  branchNames: Map<string, string>;
}) {
  const showBranch = new Set(locations.map((l) => l.branch_id)).size > 1;
  return (
    <FormField label="الموقع المخزني">
      <Select value={value} onChange={(e) => onChange(e.target.value)} aria-label="اختيار الموقع المخزني">
        <option value="">كل المواقع ({locations.length})</option>
        {locations.map((l) => (
          <option key={l.id} value={l.id}>
            {l.name_ar}
            {showBranch && branchNames.get(l.branch_id) ? ` — ${branchNames.get(l.branch_id)}` : ""}
          </option>
        ))}
      </Select>
    </FormField>
  );
}
