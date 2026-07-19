import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, EmptyState, ErrorState, FormField, LoadingState, PageHeader, Select, Tabs, TextInput, ViewOnlyNotice } from "../../components/ui/primitives";
import { api } from "../../lib/api";
import { useMe } from "../../lib/me";
import {
  fetchInventoryItems,
  fetchInventoryLevels,
  fetchInventoryLocations,
  fetchInventoryMovements,
  fetchInventorySuppliers,
  fetchInventoryUnits,
  fmtQuantity,
} from "./inventoryApi";
import type {
  InventoryItem,
  InventoryLevelRow,
  InventoryLocation,
  InventoryMovementRow,
  InventorySupplier,
  InventoryUnit,
} from "./inventoryTypes";
import { InventoryLocationSelect } from "./components/InventoryLocationSelect";
import { InventoryLevelsTable } from "./components/InventoryLevelsTable";
import { InventoryMovementsTable } from "./components/InventoryMovementsTable";
import {
  ConversionCreateDialog,
  ItemCreateDialog,
  SupplierCreateDialog,
  UnitCreateDialog,
} from "./components/MasterDataDialogs";
import { PurchaseReceiptDialog } from "./components/PurchaseReceiptDialog";
import { IssueMovementDialog } from "./components/IssueMovementDialog";
import { WasteMovementDialog } from "./components/WasteMovementDialog";
import { AdjustmentMovementDialog } from "./components/AdjustmentMovementDialog";

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
  const [suppliers, setSuppliers] = useState<InventorySupplier[]>([]);
  const [branchNames, setBranchNames] = useState<Map<string, string>>(new Map());
  // اختيار الموقع يبقى حيًّا طوال بقاء الصفحة (S1.4)
  const [locationId, setLocationId] = useState("");
  // يُزاد بعد كل عملية كتابة ناجحة (B1: استلام) لفرض إعادة تحميل الأرصدة من الخادم
  // فورًا في تبويب "نظرة عامة" — لا حساب رصيد في React، فقط طلب جديد لـ GET /inventory/levels.
  const [overviewReloadSignal, setOverviewReloadSignal] = useState(0);

  const loadRefs = useCallback(async () => {
    setRefState("loading");
    setRefError("");
    try {
      const [locs, us, its, sups, branches] = await Promise.all([
        fetchInventoryLocations(),
        fetchInventoryUnits(),
        fetchInventoryItems(),
        fetchInventorySuppliers(),
        api<{ data: Array<{ id: string; name: string }> }>("/branches").catch(() => ({ data: [] })),
      ]);
      setLocations(locs.data);
      setUnits(us.data);
      setItems(its.data);
      setSuppliers(sups.data);
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
          ["receipts", "استلام مشتريات"],
          ["issue", "صرف"],
          ["waste", "هدر"],
          ["adjustment", "تسوية"],
          ["items", "الأصناف"],
          ["units", "الوحدات"],
          ["suppliers", "الموردون"],
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
          reloadSignal={overviewReloadSignal}
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
      {refState === "ready" && tab === "receipts" && (
        <PurchaseReceiptsTab
          locations={locations}
          items={items}
          suppliers={suppliers}
          units={units}
          canManage={canManage}
          onSaved={() => setOverviewReloadSignal((n) => n + 1)}
        />
      )}
      {refState === "ready" && tab === "issue" && (
        <IssueTab
          locations={locations}
          items={items}
          units={units}
          canManage={canManage}
          onSaved={() => setOverviewReloadSignal((n) => n + 1)}
        />
      )}
      {refState === "ready" && tab === "waste" && (
        <WasteTab
          locations={locations}
          items={items}
          units={units}
          canManage={canManage}
          onSaved={() => setOverviewReloadSignal((n) => n + 1)}
        />
      )}
      {refState === "ready" && tab === "adjustment" && (
        <AdjustmentTab
          locations={locations}
          items={items}
          units={units}
          canManage={canManage}
          onSaved={() => setOverviewReloadSignal((n) => n + 1)}
        />
      )}
      {refState === "ready" && tab === "items" && (
        <ItemsTab items={items} unitsById={unitsById} canManage={canManage} units={units} onChanged={loadRefs} />
      )}
      {refState === "ready" && tab === "units" && (
        <UnitsTab units={units} canManage={canManage} onChanged={loadRefs} />
      )}
      {refState === "ready" && tab === "suppliers" && (
        <SuppliersTab suppliers={suppliers} canManage={canManage} onChanged={loadRefs} />
      )}
    </div>
  );
}

/* ——— Sprint 2 — master-data tabs (create-only per the current contracts) ——— */

function ItemsTab({
  items,
  unitsById,
  units,
  canManage,
  onChanged,
}: {
  items: InventoryItem[];
  unitsById: Map<string, InventoryUnit>;
  units: InventoryUnit[];
  canManage: boolean;
  onChanged: () => void;
}) {
  const [adding, setAdding] = useState(false);
  return (
    <div className="stack">
      {canManage && (
        <div className="inv-actions">
          <Button variant="primary" onClick={() => setAdding(true)}>+ صنف جديد</Button>
        </div>
      )}
      {!items.length ? (
        <EmptyState message="لا أصناف بعد" action={canManage ? <Button variant="primary" onClick={() => setAdding(true)}>إضافة أول صنف</Button> : undefined} />
      ) : (
        <div className="panel">
          <table className="crm-table inv-table" dir="rtl">
            <thead>
              <tr>
                <th scope="col">الاسم</th>
                <th scope="col">SKU</th>
                <th scope="col">الوحدة الأساسية</th>
                <th scope="col">حد إعادة الطلب</th>
              </tr>
            </thead>
            <tbody>
              {items.map((i) => {
                const u = unitsById.get(i.base_unit_id);
                return (
                  <tr key={i.id}>
                    <td>{i.name_ar}</td>
                    <td className="mono">{i.sku ?? "—"}</td>
                    <td>{u ? `${u.name_ar} (${u.symbol})` : "غير متاح"}</td>
                    <td className="mono inv-num">{fmtQuantity(i.reorder_level)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <ItemCreateDialog open={adding} units={units} onClose={() => setAdding(false)}
        onSaved={() => { setAdding(false); onChanged(); }} />
    </div>
  );
}

function UnitsTab({ units, canManage, onChanged }: { units: InventoryUnit[]; canManage: boolean; onChanged: () => void }) {
  const [addingUnit, setAddingUnit] = useState(false);
  const [addingConversion, setAddingConversion] = useState(false);
  return (
    <div className="stack">
      {canManage && (
        <div className="inv-actions">
          <Button variant="primary" onClick={() => setAddingUnit(true)}>+ وحدة جديدة</Button>
          <Button onClick={() => setAddingConversion(true)} disabled={units.length < 2}
            title={units.length < 2 ? "أضف وحدتين على الأقل أولًا" : undefined}>+ معامل تحويل</Button>
        </div>
      )}
      {!units.length ? (
        <EmptyState message="لا وحدات قياس بعد" action={canManage ? <Button variant="primary" onClick={() => setAddingUnit(true)}>إضافة أول وحدة</Button> : undefined} />
      ) : (
        <div className="panel">
          <table className="crm-table inv-table" dir="rtl">
            <thead>
              <tr>
                <th scope="col">الاسم</th>
                <th scope="col">الرمز</th>
              </tr>
            </thead>
            <tbody>
              {units.map((u) => (
                <tr key={u.id}>
                  <td>{u.name_ar}</td>
                  <td className="mono">{u.symbol}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {canManage && (
        <p className="muted inv-gap-note">
          معاملات التحويل تُسجَّل عبر «+ معامل تحويل»؛ لا يوفر العقد الحالي مسار قراءة لقائمتها بعد — التكرارات يرفضها الخادم.
        </p>
      )}
      <UnitCreateDialog open={addingUnit} onClose={() => setAddingUnit(false)}
        onSaved={() => { setAddingUnit(false); onChanged(); }} />
      <ConversionCreateDialog open={addingConversion} units={units} onClose={() => setAddingConversion(false)}
        onSaved={() => { setAddingConversion(false); onChanged(); }} />
    </div>
  );
}

function SuppliersTab({ suppliers, canManage, onChanged }: { suppliers: InventorySupplier[]; canManage: boolean; onChanged: () => void }) {
  const [adding, setAdding] = useState(false);
  return (
    <div className="stack">
      {canManage && (
        <div className="inv-actions">
          <Button variant="primary" onClick={() => setAdding(true)}>+ مورد جديد</Button>
        </div>
      )}
      {!suppliers.length ? (
        <EmptyState message="لا موردون بعد" action={canManage ? <Button variant="primary" onClick={() => setAdding(true)}>إضافة أول مورد</Button> : undefined} />
      ) : (
        <div className="panel">
          <table className="crm-table inv-table" dir="rtl">
            <thead>
              <tr>
                <th scope="col">الاسم</th>
                <th scope="col">الهاتف</th>
              </tr>
            </thead>
            <tbody>
              {suppliers.map((s) => (
                <tr key={s.id}>
                  <td>{s.name_ar}</td>
                  <td className="mono" dir="ltr">{s.phone ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <SupplierCreateDialog open={adding} onClose={() => setAdding(false)}
        onSaved={() => { setAdding(false); onChanged(); }} />
    </div>
  );
}

/* ——— Sprint 3 — B1: purchase receipts (POST /inventory/purchase-receipts only) ——— */

function PurchaseReceiptsTab({
  locations,
  items,
  suppliers,
  units,
  canManage,
  onSaved,
}: {
  locations: InventoryLocation[];
  items: InventoryItem[];
  suppliers: InventorySupplier[];
  units: InventoryUnit[];
  canManage: boolean;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="stack">
      {canManage && (
        <div className="inv-actions">
          <Button variant="primary" onClick={() => setOpen(true)}>+ استلام جديد</Button>
        </div>
      )}
      {!canManage && (
        <EmptyState message="لا صلاحية لتسجيل استلامات — راجع الأرصدة والحركات من التبويبات الأخرى" />
      )}
      {canManage && (
        <p className="muted inv-gap-note">
          لا يوفر العقد الحالي مسارًا مخصصًا لسجل استلامات المشتريات؛ راجع تبويب «الحركات» لعرض الحركات المسجّلة
          (بما فيها الاستلامات، نوعها «استلام»).
        </p>
      )}
      <PurchaseReceiptDialog
        open={open}
        locations={locations}
        items={items}
        suppliers={suppliers}
        units={units}
        onClose={() => setOpen(false)}
        onSaved={() => { setOpen(false); onSaved(); }}
      />
    </div>
  );
}

/* ——— Sprint 3 — B2: issue (POST /inventory/movements, movement_type=issue only) ——— */

function IssueTab({
  locations,
  items,
  units,
  canManage,
  onSaved,
}: {
  locations: InventoryLocation[];
  items: InventoryItem[];
  units: InventoryUnit[];
  canManage: boolean;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="stack">
      {canManage && (
        <div className="inv-actions">
          <Button variant="primary" onClick={() => setOpen(true)}>+ صرف جديد</Button>
        </div>
      )}
      {!canManage && (
        <EmptyState message="لا صلاحية لتسجيل عمليات صرف — راجع الأرصدة والحركات من التبويبات الأخرى" />
      )}
      {canManage && (
        <p className="muted inv-gap-note">
          لا يوفر العقد الحالي مسارًا مخصصًا لسجل عمليات الصرف؛ راجع تبويب «الحركات» لعرض الحركات المسجّلة
          (بما فيها الصرف، نوعها «صرف»).
        </p>
      )}
      <IssueMovementDialog
        open={open}
        locations={locations}
        items={items}
        units={units}
        onClose={() => setOpen(false)}
        onSaved={() => { setOpen(false); onSaved(); }}
      />
    </div>
  );
}

/* ——— Sprint 3 — B3: waste (POST /inventory/waste only) ——— */
/* لا موافقة/حد أقصى على الهدر حاليًا (يعكس الـ backend كما هو) — رقابة الهالك
   (approval/limit) تحسين مستقبلي يحتاج تعديل خادم؛ خارج نطاق B3. */

function WasteTab({
  locations,
  items,
  units,
  canManage,
  onSaved,
}: {
  locations: InventoryLocation[];
  items: InventoryItem[];
  units: InventoryUnit[];
  canManage: boolean;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="stack">
      {canManage && (
        <div className="inv-actions">
          <Button variant="primary" onClick={() => setOpen(true)}>+ هدر جديد</Button>
        </div>
      )}
      {!canManage && (
        <EmptyState message="لا صلاحية لتسجيل عمليات هدر — راجع الأرصدة والحركات من التبويبات الأخرى" />
      )}
      {canManage && (
        <p className="muted inv-gap-note">
          لا يوفر العقد الحالي مسارًا مخصصًا لسجل عمليات الهدر؛ راجع تبويب «الحركات» لعرض الحركات المسجّلة
          (بما فيها الهدر، نوعها «هدر»).
        </p>
      )}
      <WasteMovementDialog
        open={open}
        locations={locations}
        items={items}
        units={units}
        onClose={() => setOpen(false)}
        onSaved={() => { setOpen(false); onSaved(); }}
      />
    </div>
  );
}

/* ——— Sprint 3 — B4: adjustment (POST /inventory/movements, movement_type=adjustment only) ——— */

function AdjustmentTab({
  locations,
  items,
  units,
  canManage,
  onSaved,
}: {
  locations: InventoryLocation[];
  items: InventoryItem[];
  units: InventoryUnit[];
  canManage: boolean;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="stack">
      {canManage && (
        <div className="inv-actions">
          <Button variant="primary" onClick={() => setOpen(true)}>+ تسوية جديدة</Button>
        </div>
      )}
      {!canManage && (
        <EmptyState message="لا صلاحية لتسجيل تسويات رصيد — راجع الأرصدة والحركات من التبويبات الأخرى" />
      )}
      {canManage && (
        <p className="muted inv-gap-note">
          لا يوفر العقد الحالي مسارًا مخصصًا لسجل التسويات؛ راجع تبويب «الحركات» لعرض الحركات المسجّلة
          (بما فيها التسوية، نوعها «تسوية»).
        </p>
      )}
      <AdjustmentMovementDialog
        open={open}
        locations={locations}
        items={items}
        units={units}
        onClose={() => setOpen(false)}
        onSaved={() => { setOpen(false); onSaved(); }}
      />
    </div>
  );
}

function OverviewTab({
  locations,
  branchNames,
  locationId,
  onLocationChange,
  unitsById,
  reloadSignal,
}: {
  locations: InventoryLocation[];
  branchNames: Map<string, string>;
  locationId: string;
  onLocationChange: (id: string) => void;
  unitsById: Map<string, InventoryUnit>;
  reloadSignal: number;
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
    // reloadSignal: يفرض إعادة الجلب فور نجاح عملية كتابة من تبويب آخر (مثل استلام مشتريات)
  }, [load, reloadSignal]);

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
