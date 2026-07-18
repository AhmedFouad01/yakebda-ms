import { useCallback, useEffect, useMemo, useState } from "react";
import { EmptyState, ErrorState, FormField, LoadingState, PageHeader, Select, Tabs, TextInput, ViewOnlyNotice } from "../../components/ui/primitives";
import { api } from "../../lib/api";
import { useMe } from "../../lib/me";
import {
  fetchInventoryItems,
  fetchInventoryLevels,
  fetchInventoryLocations,
  fetchInventoryMovements,
  fetchInventoryUnits,
} from "./inventoryApi";
import type {
  InventoryItem,
  InventoryLevelRow,
  InventoryLocation,
  InventoryMovementRow,
  InventoryUnit,
} from "./inventoryTypes";
import { InventoryLocationSelect } from "./components/InventoryLocationSelect";
import { InventoryLevelsTable } from "./components/InventoryLevelsTable";
import { InventoryMovementsTable } from "./components/InventoryMovementsTable";

/**
 * Sprint 1 — Inventory Admin read-only foundation.
 * Active areas only (no fake tabs): نظرة عامة (levels/valuation) + الحركات.
 * Master-data management (units/items/suppliers) arrives in Sprint 2.
 * Balances/valuation are server-authoritative; this page only renders them.
 */

type LoadState = "loading" | "error" | "ready";

export function InventoryPage() {
  const { can } = useMe();
  const canManage = can("inventory.manage");
  const [tab, setTab] = useState("overview");

  // مرجع مشترك: المواقع/الوحدات/الأصناف للأسماء والرموز + محدد الموقع
  const [refState, setRefState] = useState<LoadState>("loading");
  const [refError, setRefError] = useState("");
  const [locations, setLocations] = useState<InventoryLocation[]>([]);
  const [units, setUnits] = useState<InventoryUnit[]>([]);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [branchNames, setBranchNames] = useState<Map<string, string>>(new Map());
  // اختيار الموقع يبقى حيًّا طوال بقاء الصفحة (S1.4)
  const [locationId, setLocationId] = useState("");

  const loadRefs = useCallback(async () => {
    setRefState("loading");
    setRefError("");
    try {
      const [locs, us, its, branches] = await Promise.all([
        fetchInventoryLocations(),
        fetchInventoryUnits(),
        fetchInventoryItems(),
        api<{ data: Array<{ id: string; name: string }> }>("/branches").catch(() => ({ data: [] })),
      ]);
      setLocations(locs.data);
      setUnits(us.data);
      setItems(its.data);
      setBranchNames(new Map(branches.data.map((b) => [b.id, b.name])));
      setRefState("ready");
    } catch (e: any) {
      setRefError(e.message ?? "تعذر تحميل بيانات المخزون");
      setRefState("error");
    }
  }, []);

  useEffect(() => {
    loadRefs();
  }, [loadRefs]);

  const unitsById = useMemo(() => new Map(units.map((u) => [u.id, u])), [units]);
  const itemsById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const locationsById = useMemo(() => new Map(locations.map((l) => [l.id, l])), [locations]);

  return (
    <div dir="rtl">
      <PageHeader
        title="المخزون"
        subtitle="أرصدة وحركات المخزون — القيم من الخادم مباشرة"
      />
      {!canManage && <ViewOnlyNotice permission="inventory.manage" />}

      <Tabs
        tabs={[
          ["overview", "نظرة عامة"],
          ["movements", "الحركات"],
        ]}
        active={tab}
        onChange={setTab}
      />

      {refState === "loading" && <LoadingState label="جارٍ تحميل بيانات المخزون…" />}
      {refState === "error" && <ErrorState message={refError} onRetry={loadRefs} />}

      {refState === "ready" && tab === "overview" && (
        <OverviewTab
          locations={locations}
          branchNames={branchNames}
          locationId={locationId}
          onLocationChange={setLocationId}
          unitsById={unitsById}
        />
      )}
      {refState === "ready" && tab === "movements" && (
        <MovementsTab
          locations={locations}
          branchNames={branchNames}
          locationId={locationId}
          onLocationChange={setLocationId}
          itemsById={itemsById}
          locationsById={locationsById}
          items={items}
        />
      )}
    </div>
  );
}

function OverviewTab({
  locations,
  branchNames,
  locationId,
  onLocationChange,
  unitsById,
}: {
  locations: InventoryLocation[];
  branchNames: Map<string, string>;
  locationId: string;
  onLocationChange: (id: string) => void;
  unitsById: Map<string, InventoryUnit>;
}) {
  const [state, setState] = useState<LoadState>("loading");
  const [error, setError] = useState("");
  const [rows, setRows] = useState<InventoryLevelRow[]>([]);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setState("loading");
    setError("");
    try {
      const res = await fetchInventoryLevels();
      setRows(res.data);
      setState("ready");
    } catch (e: any) {
      setError(e.message ?? "تعذر تحميل الأرصدة");
      setState("error");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // فلترة عرضية فقط على صفوف أعادها الخادم كاملة ضمن نطاق المستخدم
  const visible = useMemo(() => {
    const q = search.trim();
    return rows
      .filter((r) => !locationId || r.location_id === locationId)
      .filter((r) => !q || r.name_ar.includes(q));
  }, [rows, locationId, search]);

  return (
    <div className="stack">
      <div className="inv-toolbar">
        <InventoryLocationSelect locations={locations} value={locationId} onChange={onLocationChange} branchNames={branchNames} />
        <TextInput
          placeholder="ابحث باسم الصنف…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="بحث في الأصناف"
        />
      </div>

      {state === "loading" && <LoadingState label="جارٍ تحميل الأرصدة…" />}
      {state === "error" && <ErrorState message={error} onRetry={load} />}
      {state === "ready" && !visible.length && (
        <EmptyState message={search || locationId ? "لا نتائج مطابقة" : "لا أصناف مخزنية بعد"} />
      )}
      {state === "ready" && visible.length > 0 && (
        <div className="panel">
          <InventoryLevelsTable rows={visible} units={unitsById} />
        </div>
      )}
    </div>
  );
}

function MovementsTab({
  locations,
  branchNames,
  locationId,
  onLocationChange,
  itemsById,
  locationsById,
  items,
}: {
  locations: InventoryLocation[];
  branchNames: Map<string, string>;
  locationId: string;
  onLocationChange: (id: string) => void;
  itemsById: Map<string, InventoryItem>;
  locationsById: Map<string, InventoryLocation>;
  items: InventoryItem[];
}) {
  const [state, setState] = useState<LoadState>("loading");
  const [error, setError] = useState("");
  const [rows, setRows] = useState<InventoryMovementRow[]>([]);
  const [itemId, setItemId] = useState("");

  const load = useCallback(async () => {
    setState("loading");
    setError("");
    try {
      // فلاتر العقد الحالي فقط: location_id + item_id (لا نوع/تاريخ — فجوة موثقة)
      const res = await fetchInventoryMovements({
        location_id: locationId || undefined,
        item_id: itemId || undefined,
      });
      setRows(res.data);
      setState("ready");
    } catch (e: any) {
      setError(e.message ?? "تعذر تحميل الحركات");
      setState("error");
    }
  }, [locationId, itemId]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="stack">
      <div className="inv-toolbar">
        <InventoryLocationSelect locations={locations} value={locationId} onChange={onLocationChange} branchNames={branchNames} />
        <FormField label="الصنف">
          <Select value={itemId} onChange={(e) => setItemId(e.target.value)} aria-label="تصفية حسب الصنف">
            <option value="">كل الأصناف</option>
            {items.map((i) => (
              <option key={i.id} value={i.id}>{i.name_ar}</option>
            ))}
          </Select>
        </FormField>
      </div>

      {state === "loading" && <LoadingState label="جارٍ تحميل الحركات…" />}
      {state === "error" && <ErrorState message={error} onRetry={load} />}
      {state === "ready" && !rows.length && <EmptyState message="لا حركات مسجلة بعد" />}
      {state === "ready" && rows.length > 0 && (
        <div className="panel">
          <InventoryMovementsTable rows={rows} items={itemsById} locations={locationsById} />
        </div>
      )}
    </div>
  );
}
