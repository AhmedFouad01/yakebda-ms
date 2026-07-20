import { useEffect, useMemo, useRef, useState } from "react";
import { Modal } from "../../../components/ui/overlays";
import { Badge, Button, EmptyState, ErrorState, FormField, LoadingState, NumberInput, TextInput } from "../../../components/ui/primitives";
import { fetchInventoryLevels, fieldErrorsOf, fmtQuantity, recordInventoryStockCount } from "../inventoryApi";
import type { InventoryLevelRow, InventoryLocation, InventoryUnit, StockCountRecord } from "../inventoryTypes";
import { InventoryLocationSelect } from "./InventoryLocationSelect";

/**
 * B6 — stock count sheet over POST /inventory/stock-counts ONLY.
 *
 * Server contract (recordStockCount): ONE item per request — there is no
 * count-session/list endpoint. The sheet below is therefore N independent
 * requests, each in its OWN server transaction: some rows may commit while
 * others fail, and committed rows are never rolled back. The review phase
 * states this explicitly instead of implying cross-item atomicity.
 *
 * The difference column in entry/review is a VISUAL PREVIEW only
 * (counted − displayed balance). It is never sent: the contract accepts
 * counted_quantity alone; the server recomputes expected from the live
 * movement sum at execution time, creates the count_adjustment movement
 * itself (valued at moving average), and its returned
 * expected/difference are what the results phase displays.
 *
 * counted_quantity is in the item's BASE unit — the contract has no unit_id.
 * Empty input ≠ zero: empty rows are never sent and never touched; an
 * explicit "0" asserts a zero shelf and wipes the balance via a negative
 * adjustment.
 *
 * Counting a zero-balance item into a positive quantity is rejected
 * server-side ("التكلفة مطلوبة لأول رصيد وارد" — no cost basis for the
 * positive movement); such rows are flagged and excluded up front, with
 * purchase receipts (B1) as the directed path for opening balances.
 *
 * Idempotency: one key per row, assigned when review is first entered and
 * kept for the dialog's lifetime; a failed row retries with the SAME key,
 * so a network failure after a server commit replays safely (200) instead
 * of double-adjusting. Keys reset when the location changes (nothing has
 * been sent yet at that point) and on reopen.
 */

type Phase = "entry" | "review" | "execute";
type RowStatus = "pending" | "sending" | "success" | "failed";

interface ExecRow {
  itemId: string;
  name: string;
  unitLabel: string;
  system: string; // displayed balance at entry time — preview only
  counted: string; // raw input, sent verbatim as counted_quantity
  idempotencyKey: string;
  status: RowStatus;
  result?: StockCountRecord;
  error?: string;
}

interface DialogProps {
  open: boolean;
  onClose: () => void;
  /** يُستدعى بعد أول نجاح (كلي أو جزئي) لإعادة تحميل الأرصدة — لا يغلق الحوار. */
  onSaved: () => void;
  locations: InventoryLocation[];
  branchNames: Map<string, string>;
  unitsById: Map<string, InventoryUnit>;
}

function diffPreview(counted: string, system: string): number | null {
  if (counted.trim() === "") return null;
  const c = Number(counted);
  if (!Number.isFinite(c)) return null;
  return c - Number(system);
}

function fmtSignedQuantity(n: number): string {
  return n > 0 ? `+${fmtQuantity(n)}` : fmtQuantity(n);
}

function DiffBadge({ diff }: { diff: number }) {
  if (diff === 0) return <Badge>مطابق</Badge>;
  return <Badge tone={diff > 0 ? "success" : "danger"}>{fmtSignedQuantity(diff)}</Badge>;
}

function rowErrorMessage(e: unknown): string {
  const fields = fieldErrorsOf(e);
  // خطأ الرصيد الافتتاحي من الخادم (حارس الواجهة يمنعه مسبقًا، لكن الرصيد قد
  // يكون تغيّر إلى صفر بين فتح الشاشة والتنفيذ) — نعيد توجيهه بدل رسالة خام.
  if (fields.unit_cost) return "رصيد افتتاحي — التكلفة مطلوبة لأول رصيد وارد؛ استخدم «استلام مشتريات» لهذا الصنف.";
  const first = Object.values(fields)[0];
  if (first) return first;
  return (e as Error)?.message || "تعذر تنفيذ الجرد لهذا الصنف";
}

export function StockCountDialog({ open, onClose, onSaved, locations, branchNames, unitsById }: DialogProps) {
  const [phase, setPhase] = useState<Phase>("entry");
  const [locationId, setLocationId] = useState("");
  const [search, setSearch] = useState("");
  const [reason, setReason] = useState("");
  // item_id → قيمة الإدخال الخام؛ الغياب/الفراغ = «لم يُعد» (لا يُرسل شيء)
  const [inputs, setInputs] = useState<Record<string, string>>({});
  // item_id → مفتاح idempotency ثابت لعمر الحوار — انظر تعليق الرأس
  const keysRef = useRef<Map<string, string>>(new Map());
  const [execRows, setExecRows] = useState<ExecRow[]>([]);
  const [running, setRunning] = useState(false);
  const startedRef = useRef(false);

  const [levelsState, setLevelsState] = useState<"loading" | "error" | "ready">("loading");
  const [levelsError, setLevelsError] = useState("");
  const [levels, setLevels] = useState<InventoryLevelRow[]>([]);

  async function loadLevels() {
    setLevelsState("loading");
    setLevelsError("");
    try {
      const res = await fetchInventoryLevels();
      setLevels(res.data);
      setLevelsState("ready");
    } catch (e: any) {
      setLevelsError(e.message ?? "تعذر تحميل الأرصدة");
      setLevelsState("error");
    }
  }

  useEffect(() => {
    if (open) {
      setPhase("entry");
      setLocationId("");
      setSearch("");
      setReason("");
      setInputs({});
      keysRef.current = new Map();
      setExecRows([]);
      setRunning(false);
      startedRef.current = false;
      loadLevels();
    }
  }, [open]);

  const locationRows = useMemo(
    () => levels.filter((r) => locationId && r.location_id === locationId),
    [levels, locationId]
  );

  const visibleRows = useMemo(() => {
    const q = search.trim();
    return locationRows.filter((r) => !q || r.name_ar.includes(q));
  }, [locationRows, search]);

  // تصنيف الصفوف المُدخلة: صالحة للإرسال / غير صالحة / مستبعدة (رصيد افتتاحي)
  const classified = useMemo(() => {
    const countable: InventoryLevelRow[] = [];
    const excluded: InventoryLevelRow[] = [];
    let invalid = 0;
    for (const r of locationRows) {
      const raw = inputs[r.item_id];
      if (raw === undefined || raw.trim() === "") continue;
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0) {
        invalid += 1;
        continue;
      }
      if (Number(r.quantity_on_hand) === 0 && n > 0) excluded.push(r);
      else countable.push(r);
    }
    return { countable, excluded, invalid };
  }, [locationRows, inputs]);

  const reasonValid = reason.trim().length > 0 && reason.trim().length <= 500;
  const canReview = classified.countable.length > 0 && classified.invalid === 0 && reasonValid;

  function unitLabelOf(row: InventoryLevelRow): string {
    const u = unitsById.get(row.base_unit_id);
    return u ? `${u.name_ar} (${u.symbol})` : "الوحدة الأساسية";
  }

  function enterReview() {
    // المفاتيح تُمنح هنا (أول دخول للمراجعة) وتبقى ثابتة — تعديل القيم والعودة
    // للمراجعة لا يغيّرها: لم يُرسل شيء بعد، والقيمة المرسَلة تُجمَّد عند التنفيذ.
    for (const r of classified.countable) {
      if (!keysRef.current.has(r.item_id)) keysRef.current.set(r.item_id, crypto.randomUUID());
    }
    setPhase("review");
  }

  async function execute() {
    if (startedRef.current) return; // منع التنفيذ المزدوج
    startedRef.current = true;
    const rows: ExecRow[] = classified.countable.map((r) => ({
      itemId: r.item_id,
      name: r.name_ar,
      unitLabel: unitLabelOf(r),
      system: r.quantity_on_hand,
      counted: inputs[r.item_id].trim(),
      idempotencyKey: keysRef.current.get(r.item_id)!,
      status: "pending",
    }));
    setExecRows(rows);
    setPhase("execute");
    setRunning(true);
    let anySuccess = false;
    // إرسال تسلسلي متعمد: ترتيب حتمي، وتجنّب إغراق الخادم بطلبات كتابة متوازية
    for (const row of rows) {
      setExecRows((prev) => prev.map((x) => (x.itemId === row.itemId ? { ...x, status: "sending" } : x)));
      try {
        const res = await recordInventoryStockCount({
          location_id: locationId,
          item_id: row.itemId,
          counted_quantity: row.counted,
          reason: reason.trim(),
          idempotency_key: row.idempotencyKey,
        });
        anySuccess = true;
        setExecRows((prev) =>
          prev.map((x) => (x.itemId === row.itemId ? { ...x, status: "success", result: res.data, error: undefined } : x))
        );
      } catch (e: unknown) {
        setExecRows((prev) =>
          prev.map((x) => (x.itemId === row.itemId ? { ...x, status: "failed", error: rowErrorMessage(e) } : x))
        );
      }
    }
    setRunning(false);
    if (anySuccess) onSaved(); // الصفوف الناجحة التزمت فعلًا — حدّث الأرصدة حتى مع فشل جزئي
  }

  async function retryRow(itemId: string) {
    if (running) return;
    const row = execRows.find((x) => x.itemId === itemId);
    if (!row || row.status !== "failed") return;
    setRunning(true);
    setExecRows((prev) => prev.map((x) => (x.itemId === itemId ? { ...x, status: "sending", error: undefined } : x)));
    try {
      // نفس المفتاح عمدًا: لو كان الفشل شبكيًا والخادم نفّذ فعلًا، نستقبل replay آمنًا
      const res = await recordInventoryStockCount({
        location_id: locationId,
        item_id: row.itemId,
        counted_quantity: row.counted,
        reason: reason.trim(),
        idempotency_key: row.idempotencyKey,
      });
      setExecRows((prev) =>
        prev.map((x) => (x.itemId === itemId ? { ...x, status: "success", result: res.data, error: undefined } : x))
      );
      onSaved();
    } catch (e: unknown) {
      setExecRows((prev) => prev.map((x) => (x.itemId === itemId ? { ...x, status: "failed", error: rowErrorMessage(e) } : x)));
    } finally {
      setRunning(false);
    }
  }

  function close() {
    if (running) return; // لا إغلاق أثناء الإرسال — النتائج الجزئية يجب أن تُرى
    onClose();
  }

  const doneCount = execRows.filter((x) => x.status === "success").length;
  const failedCount = execRows.filter((x) => x.status === "failed").length;

  return (
    <Modal
      open={open}
      onClose={close}
      wide
      title={
        phase === "entry" ? "جرد مخزني — إدخال العد" : phase === "review" ? "جرد مخزني — مراجعة الفروقات" : "جرد مخزني — النتائج"
      }
      footer={
        phase === "entry" ? (
          <>
            <Button variant="primary" disabled={!canReview} onClick={enterReview}>
              مراجعة الفروقات ({classified.countable.length})
            </Button>
            <Button onClick={close}>إلغاء</Button>
          </>
        ) : phase === "review" ? (
          <>
            <Button variant="primary" onClick={execute}>
              تنفيذ الجرد ({classified.countable.length})
            </Button>
            <Button onClick={() => setPhase("entry")}>رجوع للتعديل</Button>
          </>
        ) : (
          <Button onClick={close} disabled={running}>
            {running ? "جارٍ التنفيذ…" : "إغلاق"}
          </Button>
        )
      }
    >
      {phase === "entry" && (
        <>
          <InventoryLocationSelect
            locations={locations}
            value={locationId}
            onChange={(id) => {
              // تغيير الموقع يلغي ورقة العد الحالية بالكامل (الأرصدة والمفاتيح مرتبطة بالموقع)
              setLocationId(id);
              setInputs({});
              keysRef.current = new Map();
            }}
            branchNames={branchNames}
          />
          {!locationId && <EmptyState message="اختر موقعًا مخزنيًا لبدء ورقة العد" />}
          {locationId && levelsState === "loading" && <LoadingState label="جارٍ تحميل أرصدة الموقع…" />}
          {locationId && levelsState === "error" && <ErrorState message={levelsError} onRetry={loadLevels} />}
          {locationId && levelsState === "ready" && !locationRows.length && (
            <EmptyState message="لا أصناف لها أرصدة مسجلة في هذا الموقع — الرصيد الافتتاحي يبدأ من «استلام مشتريات»" />
          )}
          {locationId && levelsState === "ready" && locationRows.length > 0 && (
            <>
              <FormField label="السبب (مشترك لكل الأصناف المعدودة)" hint="مطلوب — مثل «جرد دوري يوليو»، حتى 500 حرف">
                <TextInput value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
              </FormField>
              <FormField label="بحث">
                <TextInput placeholder="ابحث باسم الصنف…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="بحث في أصناف ورقة العد" />
              </FormField>
              <p className="muted">
                اترك الحقل فارغًا للأصناف غير المعدودة — لن تُرسل ولن تُمس. إدخال «0» يعني أن العد الفعلي صفر وسيُصفّر الرصيد.
                الفرق المعروض تقديري للمساعدة فقط؛ الفرق النهائي يحسبه الخادم لحظة التنفيذ.
              </p>
              <table className="crm-table inv-table" dir="rtl">
                <thead>
                  <tr>
                    <th scope="col">الصنف</th>
                    <th scope="col">الوحدة الأساسية</th>
                    <th scope="col">رصيد النظام</th>
                    <th scope="col">الكمية المعدودة</th>
                    <th scope="col">الفرق (تقديري)</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((r) => {
                    const raw = inputs[r.item_id] ?? "";
                    const n = Number(raw);
                    const invalidInput = raw.trim() !== "" && (!Number.isFinite(n) || n < 0);
                    const openingBlocked = raw.trim() !== "" && !invalidInput && Number(r.quantity_on_hand) === 0 && n > 0;
                    const diff = invalidInput ? null : diffPreview(raw, r.quantity_on_hand);
                    return (
                      <tr key={r.item_id}>
                        <td>{r.name_ar}</td>
                        <td className="muted">{unitLabelOf(r)}</td>
                        <td className="mono inv-num">{fmtQuantity(r.quantity_on_hand)}</td>
                        <td>
                          <NumberInput
                            value={raw}
                            onChange={(e) => setInputs((prev) => ({ ...prev, [r.item_id]: e.target.value }))}
                            min="0"
                            step="any"
                            dir="ltr"
                            placeholder="لم يُعد"
                            aria-label={`الكمية المعدودة — ${r.name_ar}`}
                          />
                          {invalidInput && <div className="alert" role="alert">قيمة غير صالحة — رقم صفر أو أكبر</div>}
                          {openingBlocked && (
                            <div className="alert" role="alert">
                              سيُرفض: رصيد النظام صفر ولا توجد تكلفة أساس — الرصيد الافتتاحي يُسجَّل من «استلام مشتريات». هذا الصف مستبعد من الإرسال.
                            </div>
                          )}
                        </td>
                        <td>{diff === null ? <span className="muted">—</span> : <DiffBadge diff={diff} />}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {search.trim() !== "" && classified.countable.length > 0 && (
                <p className="muted">زر المراجعة يشمل كل الصفوف المعدودة في الموقع، بما فيها المخفية بالبحث الحالي.</p>
              )}
            </>
          )}
        </>
      )}

      {phase === "review" && (
        <>
          <p>
            سيُرسل <strong>{classified.countable.length}</strong> صنفًا — منها{" "}
            <strong>{classified.countable.filter((r) => (diffPreview(inputs[r.item_id], r.quantity_on_hand) ?? 0) !== 0).length}</strong> بفرق و
            <strong>{classified.countable.filter((r) => (diffPreview(inputs[r.item_id], r.quantity_on_hand) ?? 0) === 0).length}</strong> مطابق.
            السبب: «{reason.trim()}»
          </p>
          <table className="crm-table inv-table" dir="rtl">
            <thead>
              <tr>
                <th scope="col">الصنف</th>
                <th scope="col">رصيد النظام</th>
                <th scope="col">المعدود</th>
                <th scope="col">الفرق (تقديري)</th>
              </tr>
            </thead>
            <tbody>
              {classified.countable.map((r) => (
                <tr key={r.item_id}>
                  <td>{r.name_ar}</td>
                  <td className="mono inv-num">{fmtQuantity(r.quantity_on_hand)}</td>
                  <td className="mono inv-num">{fmtQuantity(inputs[r.item_id])}</td>
                  <td><DiffBadge diff={diffPreview(inputs[r.item_id], r.quantity_on_hand) ?? 0} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          {classified.excluded.length > 0 && (
            <div className="alert" role="alert">
              مستبعد من الإرسال (رصيد افتتاحي يتطلب «استلام مشتريات»): {classified.excluded.map((r) => r.name_ar).join("، ")}
            </div>
          )}
          <p className="muted">
            تسويات الفروقات ستُقيَّم بمتوسط التكلفة المتحرك وتولّد قيودًا مالية معلّقة. كل صنف يُنفَّذ في معاملة مستقلة على
            الخادم: قد ينجح بعض الأصناف ويفشل بعضها، ولا تراجع عن الناجح. الفرق النهائي لكل صنف يحسبه الخادم لحظة التنفيذ.
          </p>
        </>
      )}

      {phase === "execute" && (
        <>
          <p>
            {running
              ? `جارٍ التنفيذ… (${doneCount + failedCount} من ${execRows.length})`
              : failedCount === 0
                ? `اكتمل الجرد: ${doneCount} من ${execRows.length} بنجاح.`
                : `اكتمل الجرد جزئيًا: ${doneCount} نجح، ${failedCount} فشل — الصفوف الناجحة التزمت ولا تُعاد؛ يمكن إعادة محاولة الفاشلة فقط.`}
          </p>
          <table className="crm-table inv-table" dir="rtl">
            <thead>
              <tr>
                <th scope="col">الصنف</th>
                <th scope="col">المعدود</th>
                <th scope="col">الحالة</th>
                <th scope="col">نتيجة الخادم</th>
              </tr>
            </thead>
            <tbody>
              {execRows.map((row) => (
                <tr key={row.itemId}>
                  <td>{row.name}</td>
                  <td className="mono inv-num">{fmtQuantity(row.counted)}</td>
                  <td>
                    {row.status === "pending" && <Badge>بانتظار</Badge>}
                    {row.status === "sending" && <Badge tone="info">جارٍ الإرسال…</Badge>}
                    {row.status === "success" && <Badge tone="success">تم</Badge>}
                    {row.status === "failed" && <Badge tone="danger">فشل</Badge>}
                  </td>
                  <td>
                    {row.status === "success" && row.result && (
                      <>
                        {/* الأرقام السلطوية من رد الخادم — لا من معاينة الواجهة */}
                        الفرق: <DiffBadge diff={Number(row.result.difference_quantity)} />{" "}
                        {row.result.movement_id ? <span className="muted">أُنشئت حركة تسوية جرد</span> : <span className="muted">مطابق — بلا حركة</span>}
                        {row.result.idempotent_replay && <span className="muted"> (مسجّل مسبقًا — إعادة آمنة)</span>}
                      </>
                    )}
                    {row.status === "failed" && (
                      <>
                        <span className="muted">{row.error}</span>{" "}
                        <Button onClick={() => retryRow(row.itemId)} disabled={running}>إعادة المحاولة</Button>
                      </>
                    )}
                    {(row.status === "pending" || row.status === "sending") && <span className="muted">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </Modal>
  );
}
