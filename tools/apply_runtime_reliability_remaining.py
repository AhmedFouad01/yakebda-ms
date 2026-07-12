from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected one match, found {count}")
    return text.replace(old, new, 1)


# 1) Auto-print receipt when payment is captured during order creation.
pricing_path = Path("apps/api/src/modules/orderPricing.ts")
pricing = pricing_path.read_text(encoding="utf-8")
if "Runtime reliability: auto-print receipt" not in pricing:
    pricing = replace_once(
        pricing,
        'import { renderKitchenTicketPayload } from "../lib/receipt";',
        'import { renderKitchenTicketPayload, renderReceiptPayload } from "../lib/receipt";',
        "pricing receipt import",
    )
    marker = '''        res.status(201).json({
          data: await loadFullOrder(db, accountId, orderId),'''
    block = '''        // Runtime reliability: auto-print receipt for payments captured during order creation.
        if (paymentId && settings.auto_print_on_payment && settings.receipt_printing_enabled) {
          try {
            const endpoint = await db("hardware_endpoints")
              .where({ branch_id: branch.id, kind: "receipt_printer", is_active: true })
              .first();
            if (endpoint) {
              const full = await loadFullOrder(db, accountId, orderId);
              await db("print_jobs").insert({
                id: newId(),
                branch_id: branch.id,
                endpoint_id: endpoint.id,
                device_id: endpoint.device_id ?? null,
                type: "receipt",
                payload: JSON.stringify(
                  renderReceiptPayload(full!, {
                    footer: settings.receipt_footer,
                    paperWidthMm: settings.paper_width_mm,
                    copies: settings.receipt_copies,
                    taxDisplay: settings.receipt_tax_display,
                  })
                ),
                status: "pending",
                created_by: req.user!.id,
              });
            }
          } catch {
            // Printing failure must never roll back a paid order.
          }
        }

        res.status(201).json({
          data: await loadFullOrder(db, accountId, orderId),'''
    pricing = replace_once(pricing, marker, block, "auto print insertion")
    pricing_path.write_text(pricing, encoding="utf-8")


# 2) Regression coverage for create-order payment auto-print.
test_path = Path("apps/api/tests/order-pricing.test.ts")
tests = test_path.read_text(encoding="utf-8")
if "queues a receipt when create-order captures payment" not in tests:
    insert_at = tests.rfind("\n});")
    if insert_at < 0:
        raise SystemExit("order pricing test suite closing marker not found")
    test = r'''

  it("queues a receipt when create-order captures payment and auto-print is enabled", async () => {
    const settingsResponse = await request(app)
      .patch(`/api/v1/settings?branch_id=${branchId}`)
      .set(auth())
      .send({ auto_print_on_payment: true, receipt_printing_enabled: true });
    expect(settingsResponse.status).toBe(200);

    await db("hardware_endpoints").insert({
      id: newId(),
      branch_id: branchId,
      name: "طابعة إيصال اختبارية",
      kind: "receipt_printer",
      connection: "windows_driver",
      protocol: "windows_driver",
      address: "TEST-RECEIPT",
      is_active: true,
    });

    const [{ count: before }] = await db("print_jobs").where({ type: "receipt" }).count("id as count");
    const created = await request(app)
      .post("/api/v1/orders")
      .set(auth())
      .send(payload({ discount: 0, payment_method: "card" }));
    const [{ count: after }] = await db("print_jobs").where({ type: "receipt" }).count("id as count");

    expect(created.status).toBe(201);
    expect(Number(after)).toBe(Number(before) + 1);
    const job = await db("print_jobs").where({ type: "receipt" }).orderBy("created_at", "desc").first();
    expect(job.status).toBe("pending");
    expect(JSON.parse(job.payload).order_no).toBe(created.body.data.order_no);
  });
'''
    tests = tests[:insert_at] + test + tests[insert_at:]
    test_path.write_text(tests, encoding="utf-8")


# 3) POS bootstrap deduplication and order-history feedback.
pos_path = Path("apps/admin/src/pages/Pos.tsx")
pos = pos_path.read_text(encoding="utf-8")
if "historyOrderBusy" not in pos:
    pos = replace_once(
        pos,
        '''  const [history, setHistory] = useState<ShiftOrderSummary[]>([]);
  const [historyOrder, setHistoryOrder] = useState<FullOrder | null>(null);''',
        '''  const [history, setHistory] = useState<ShiftOrderSummary[]>([]);
  const [historyOrder, setHistoryOrder] = useState<FullOrder | null>(null);
  const [historyOrderBusy, setHistoryOrderBusy] = useState(false);
  const [historyOrderError, setHistoryOrderError] = useState("");''',
        "history detail states",
    )

    pos = replace_once(
        pos,
        '''  useEffect(() => {
    api<{ data: Branch[] }>("/branches").then((response) => {
      setBranches(response.data);
      if (!branchId && response.data.length) setBranchId(response.data[0].id);
    });
    if (can("customers.lookup") || can("customers.manage")) {
      api<{ data: typeof customers }>("/customers/lookup")
        .then((response) => setCustomers(response.data))
        .catch(() => {});
    }
  }, [branchId, can]);''',
        '''  useEffect(() => {
    let cancelled = false;
    api<{ data: Branch[] }>("/branches")
      .then((response) => {
        if (cancelled) return;
        setBranches(response.data);
        setBranchId((current) => current || response.data[0]?.id || "");
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!can("customers.lookup") && !can("customers.manage")) {
      setCustomers([]);
      return;
    }
    let cancelled = false;
    api<{ data: typeof customers }>("/customers/lookup")
      .then((response) => {
        if (!cancelled) setCustomers(response.data);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [can]);''',
        "POS bootstrap effects",
    )

    pos = replace_once(
        pos,
        '''  async function openHistoryOrder(id: string) {
    const response = await api<{ data: FullOrder }>(`/orders/${id}`);
    setHistoryOpen(false);
    setHistoryOrder(response.data);
  }''',
        '''  async function openHistoryOrder(id: string) {
    if (historyOrderBusy) return;
    setHistoryOrderBusy(true);
    setHistoryOrderError("");
    try {
      const response = await api<{ data: FullOrder }>(`/orders/${id}`);
      setHistoryOpen(false);
      setHistoryOrder(response.data);
    } catch (e: any) {
      setHistoryOrderError(e.message);
    } finally {
      setHistoryOrderBusy(false);
    }
  }''',
        "history detail error handling",
    )

    pos = replace_once(
        pos,
        '''        {historyBusy && <div className="posx-history-empty">جارٍ تحميل الطلبات…</div>}
        {!historyBusy && historyError && <div className="alert dark-alert">{historyError}</div>}''',
        '''        {historyBusy && <div className="posx-history-empty">جارٍ تحميل الطلبات…</div>}
        {!historyBusy && historyError && <div className="alert dark-alert">{historyError}</div>}
        {historyOrderBusy && <div className="posx-history-empty">جارٍ تحميل تفاصيل الطلب…</div>}
        {!historyOrderBusy && historyOrderError && <div className="alert dark-alert">{historyOrderError}</div>}''',
        "history detail feedback",
    )

    pos = replace_once(
        pos,
        '''              <button key={order.id} className="posx-history-card" onClick={() => openHistoryOrder(order.id)}>''',
        '''              <button key={order.id} className="posx-history-card" disabled={historyOrderBusy} onClick={() => openHistoryOrder(order.id)}>''',
        "history card loading guard",
    )
    pos_path.write_text(pos, encoding="utf-8")

print("Runtime reliability source patch applied successfully.")
