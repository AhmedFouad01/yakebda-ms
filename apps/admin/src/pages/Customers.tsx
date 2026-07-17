import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CustomerListItem, CustomerListRow, CustomerOrderSummary, CustomerSortField, PaginationResponse, SortDirection } from "@ykms/contracts";
import { api, apiAllPages } from "../lib/api";
import { t } from "../lib/t";
import { Drawer, toast } from "../components/ui/overlays";
import { PageHeader, FormField, TextInput, TextArea, Select, ToggleSwitch, Tabs, SectionCard, EmptyState } from "../components/ui/primitives";
import { useMe } from "../lib/me";

type Customer = CustomerListItem;
type CustomerForm = Omit<
  Customer,
  "id" | "account_id" | "addresses" | "loyalty_points" | "loyalty_tier" | "created_at" | "updated_at"
>;

interface Analytics {
  total_orders: number; completed_orders: number; cancelled_orders: number; total_spend: number;
  avg_order_value: number | null; first_order_at: string | null; last_order_at: string | null;
  days_since_last_order: number | null; favourite_product: string | null;
  preferred_order_type_actual: string | null;
  recent_items: Array<{ name_ar: string; variant_name_ar?: string | null; qty: number; created_at: string }>;
}

const NA = "غير متاح";
const money = (v: number | null | undefined) => (v == null ? NA : `${Number(v).toFixed(2)} ج.م`);
const dateAr = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString("ar-EG", { day: "numeric", month: "long", year: "numeric" }) : NA);

/** ADR-006 — sortable header definitions (order = column order). */
const SORT_COLUMNS: Array<{ field: CustomerSortField; label: string }> = [
  { field: "name", label: "الاسم" },
  { field: "phone", label: "الهاتف" },
  { field: "orders_count", label: "عدد الطلبات" },
  { field: "last_order_at", label: "آخر طلب" },
  { field: "total_spent", label: "إجمالي الإنفاق" },
  { field: "avg_order", label: "متوسط الطلب" },
  { field: "branch", label: "الفرع" },
  { field: "status", label: "الحالة" },
  { field: "created_at", label: "تاريخ الإنشاء" },
];

const PAGE_LIMIT = 50;

export function Customers() {
  const { can } = useMe();
  const canManage = can("customers.manage");
  const [rows, setRows] = useState<CustomerListRow[]>([]);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<CustomerSortField>("created_at");
  const [direction, setDirection] = useState<SortDirection>("desc");
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<Customer | null>(null);
  const [adding, setAdding] = useState(false);
  const [profileId, setProfileId] = useState<string | null>(null);
  const requestSeq = useRef(0);

  const pageUrl = useCallback((cursor: string | null) => {
    const params = new URLSearchParams();
    params.set("sort", sort);
    params.set("direction", direction);
    params.set("limit", String(PAGE_LIMIT));
    if (search.trim()) params.set("search", search.trim());
    if (cursor) params.set("cursor", cursor);
    return `/customers?${params.toString()}`;
  }, [sort, direction, search]);

  // Server-side sorting only: sort/direction/search changes reset the cursor and refetch page 1.
  const loadFirst = useCallback(async () => {
    const seq = ++requestSeq.current;
    setLoading(true);
    setError("");
    try {
      const res = await api<PaginationResponse<CustomerListRow>>(pageUrl(null));
      if (seq !== requestSeq.current) return; // stale response
      setRows(res.data);
      setNextCursor(res.next_cursor);
      setHasMore(res.has_more);
    } catch (e: any) {
      if (seq === requestSeq.current) setError(e.message);
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }, [pageUrl]);

  async function loadMore() {
    if (!nextCursor) return;
    const seq = ++requestSeq.current;
    setLoading(true);
    try {
      const res = await api<PaginationResponse<CustomerListRow>>(pageUrl(nextCursor));
      if (seq !== requestSeq.current) return;
      setRows((prev) => [...prev, ...res.data]);
      setNextCursor(res.next_cursor);
      setHasMore(res.has_more);
    } catch (e: any) {
      if (seq === requestSeq.current) setError(e.message);
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }

  useEffect(() => {
    const id = setTimeout(() => { loadFirst(); }, 250);
    return () => clearTimeout(id);
  }, [loadFirst]);

  function toggleSort(field: CustomerSortField) {
    if (field === sort) {
      setDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSort(field);
      setDirection(field === "name" || field === "phone" || field === "branch" ? "asc" : "desc");
    }
  }

  const ariaSort = (field: CustomerSortField): "ascending" | "descending" | undefined =>
    field === sort ? (direction === "asc" ? "ascending" : "descending") : undefined;

  return (
    <div dir="rtl">
      <PageHeader title={t.customers.title} subtitle="قاعدة عملاء وتحليلات الطلبات"
        actions={canManage ? <button className="primary" onClick={() => setAdding(true)}>+ عميل جديد</button> : undefined} />
      {error && <div className="alert" role="alert">{error}</div>}

      <div className="crm-search">
        <input placeholder="ابحث بالاسم أو الهاتف…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <span className="muted" aria-live="polite">{loading ? "جارٍ التحميل…" : `${rows.length} عميل${hasMore ? "+" : ""}`}</span>
      </div>

      {!rows.length && !loading ? (
        <EmptyState message={search ? "لا نتائج مطابقة للبحث" : "لا عملاء بعد"}
          action={canManage && !search ? <button className="primary" onClick={() => setAdding(true)}>إضافة أول عميل</button> : undefined} />
      ) : (
        <div className="panel">
          <table className="crm-table crm-table-rich" aria-busy={loading}>
            <thead>
              <tr>
                {SORT_COLUMNS.map(({ field, label }) => (
                  <th key={field} aria-sort={ariaSort(field)}>
                    <button type="button" className="crm-sort-btn" onClick={() => toggleSort(field)}
                      aria-label={`ترتيب حسب ${label}`}>
                      <span>{label}</span>
                      <span className="crm-sort-icon" aria-hidden="true">
                        {field === sort ? (direction === "asc" ? "▲" : "▼") : "↕"}
                      </span>
                    </button>
                  </th>
                ))}
                <th>إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id}>
                  <td>
                    <button className="crm-name" onClick={() => setProfileId(c.id)}>{c.name}</button>
                    {c.is_vip && <span className="crm-badge vip">VIP</span>}
                    {c.email && <div className="muted mono">{c.email}</div>}
                  </td>
                  <td className="mono">{c.phone || "—"}{c.alt_phone ? ` / ${c.alt_phone}` : ""}</td>
                  <td className="mono crm-num">{c.orders_count}</td>
                  <td className="muted">{c.last_order_at ? dateAr(c.last_order_at) : "—"}</td>
                  <td className="mono crm-num">{money(c.total_spent)}</td>
                  <td className="mono crm-num">{c.avg_order == null ? "—" : money(c.avg_order)}</td>
                  <td>{c.branch_name ?? "—"}</td>
                  <td>{c.is_blocked ? <span className="crm-badge blocked">محظور</span> : <span className="muted">نشط</span>}</td>
                  <td className="muted">{dateAr(c.created_at)}</td>
                  <td>
                    <div className="menu-row-actions">
                      <button className="sm" onClick={() => setProfileId(c.id)}>الملف</button>
                      {canManage && <button className="sm primary" onClick={() => setEditing(c)}>تعديل</button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {hasMore && (
            <div className="crm-load-more">
              <button type="button" onClick={loadMore} disabled={loading}>
                {loading ? "جارٍ التحميل…" : "تحميل المزيد"}
              </button>
            </div>
          )}
        </div>
      )}

      {(adding || editing) && (
        <CustomerEditor customer={editing} onClose={() => { setAdding(false); setEditing(null); }}
          onSaved={() => { setAdding(false); setEditing(null); loadFirst(); }} />
      )}
      {profileId && <CustomerProfile id={profileId} canManage={canManage} onClose={() => setProfileId(null)}
        onEdit={(c) => { setProfileId(null); setEditing(c); }} />}
    </div>
  );
}

const emptyForm: CustomerForm = { name: "", phone: "", alt_phone: "", email: "", address: "", birthday: "", gender: "", preferred_language: "ar", preferred_order_type: "", preferred_payment_method: "", marketing_opt_in: false, sms_opt_in: false, whatsapp_opt_in: false, is_blocked: false, block_reason: "", is_vip: false, tags: "", allergy_note: "", delivery_instructions: "", notes: "" };

function CustomerEditor({ customer, onClose, onSaved }: { customer: Customer | null; onClose: () => void; onSaved: () => void }) {
  const [tab, setTab] = useState("identity");
  const [form, setForm] = useState<CustomerForm>(customer ? { ...emptyForm, ...customer } : emptyForm);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof CustomerForm>(k: K, v: CustomerForm[K]) => setForm((f) => ({ ...f, [k]: v }));

  async function save() {
    setBusy(true);
    try {
      const body: Record<string, unknown> = {
        name: form.name, phone: form.phone || null, alt_phone: form.alt_phone || null, email: form.email || null,
        address: form.address || null, birthday: form.birthday || null, gender: form.gender || null,
        preferred_language: form.preferred_language || null,
        preferred_order_type: form.preferred_order_type || null, preferred_payment_method: form.preferred_payment_method || null,
        marketing_opt_in: !!form.marketing_opt_in, sms_opt_in: !!form.sms_opt_in, whatsapp_opt_in: !!form.whatsapp_opt_in,
        is_blocked: !!form.is_blocked, block_reason: form.block_reason || null,
        is_vip: !!form.is_vip, tags: form.tags || null,
        allergy_note: form.allergy_note || null, delivery_instructions: form.delivery_instructions || null, notes: form.notes || null,
      };
      if (customer) await api(`/customers/${customer.id}`, { method: "PATCH", body });
      else await api("/customers", { method: "POST", body });
      toast(customer ? "تم تحديث العميل" : "تمت إضافة العميل");
      onSaved();
    } catch (e: any) { setErr(e.message); setBusy(false); }
  }

  return (
    <Drawer open title={customer ? `تعديل: ${customer.name}` : "عميل جديد"} onClose={onClose} wide
      footer={<><button className="primary" onClick={save} disabled={busy || !form.name}>{customer ? "حفظ" : "إضافة"}</button><button onClick={onClose}>إلغاء</button></>}>
      {err && <div className="alert">{err}</div>}
      <Tabs tabs={[["identity", "الهوية"], ["prefs", "التفضيلات"], ["ops", "التشغيل"], ["marketing", "التسويق"]]} active={tab} onChange={setTab} />

      {tab === "identity" && (
        <div className="stack">
          <FormField label="الاسم"><TextInput value={form.name} onChange={(e) => set("name", e.target.value)} /></FormField>
          <FormField label="الهاتف"><TextInput dir="ltr" value={form.phone ?? ""} onChange={(e) => set("phone", e.target.value)} /></FormField>
          <FormField label="هاتف بديل"><TextInput dir="ltr" value={form.alt_phone ?? ""} onChange={(e) => set("alt_phone", e.target.value)} /></FormField>
          <FormField label="البريد الإلكتروني"><TextInput dir="ltr" value={form.email ?? ""} onChange={(e) => set("email", e.target.value)} /></FormField>
          <FormField label="العنوان"><TextArea value={form.address ?? ""} onChange={(e) => set("address", e.target.value)} /></FormField>
          <FormField label="تاريخ الميلاد"><TextInput type="date" dir="ltr" value={form.birthday ?? ""} onChange={(e) => set("birthday", e.target.value)} /></FormField>
        </div>
      )}

      {tab === "prefs" && (
        <div className="stack">
          <FormField label="نوع الطلب المفضّل">
            <Select value={form.preferred_order_type ?? ""} onChange={(e) => set("preferred_order_type", e.target.value)}>
              <option value="">—</option><option value="takeaway">تيك أواي</option><option value="delivery">دليفري</option>
            </Select>
          </FormField>
          <FormField label="طريقة الدفع المفضّلة">
            <Select value={form.preferred_payment_method ?? ""} onChange={(e) => set("preferred_payment_method", e.target.value)}>
              <option value="">—</option><option value="cash">نقدي</option><option value="card">بطاقة</option><option value="wallet">محفظة</option>
            </Select>
          </FormField>
          <FormField label="اللغة المفضّلة">
            <Select value={form.preferred_language ?? "ar"} onChange={(e) => set("preferred_language", e.target.value)}>
              <option value="ar">العربية</option><option value="en">English</option>
            </Select>
          </FormField>
          <FormField label="ملاحظة حساسية/طعام"><TextArea value={form.allergy_note ?? ""} onChange={(e) => set("allergy_note", e.target.value)} /></FormField>
          <FormField label="تعليمات التوصيل"><TextArea value={form.delivery_instructions ?? ""} onChange={(e) => set("delivery_instructions", e.target.value)} /></FormField>
        </div>
      )}

      {tab === "ops" && (
        <div className="stack">
          <ToggleSwitch checked={!!form.is_vip} onChange={(v) => set("is_vip", v)} label="عميل مميّز (VIP)" />
          <FormField label="وسوم (مفصولة بفواصل)"><TextInput value={form.tags ?? ""} onChange={(e) => set("tags", e.target.value)} placeholder="دائم، شركة، …" /></FormField>
          <ToggleSwitch checked={!!form.is_blocked} onChange={(v) => set("is_blocked", v)} label="محظور" />
          {form.is_blocked && <FormField label="سبب الحظر"><TextArea value={form.block_reason ?? ""} onChange={(e) => set("block_reason", e.target.value)} /></FormField>}
          <FormField label="ملاحظات داخلية"><TextArea value={form.notes ?? ""} onChange={(e) => set("notes", e.target.value)} /></FormField>
        </div>
      )}

      {tab === "marketing" && (
        <div className="stack">
          <p className="muted">موافقات التسويق (أساس لوحدة تسويق مستقبلية — لا إرسال فعلي الآن).</p>
          <ToggleSwitch checked={!!form.marketing_opt_in} onChange={(v) => set("marketing_opt_in", v)} label="موافقة التسويق العامة" />
          <ToggleSwitch checked={!!form.sms_opt_in} onChange={(v) => set("sms_opt_in", v)} label="رسائل SMS" />
          <ToggleSwitch checked={!!form.whatsapp_opt_in} onChange={(v) => set("whatsapp_opt_in", v)} label="واتساب" />
        </div>
      )}
    </Drawer>
  );
}

function CustomerProfile({ id, canManage, onClose, onEdit }: { id: string; canManage: boolean; onClose: () => void; onEdit: (c: Customer) => void }) {
  const [data, setData] = useState<(Customer & { analytics: Analytics }) | null>(null);
  const [orders, setOrders] = useState<CustomerOrderSummary[]>([]);
  const [tab, setTab] = useState("overview");
  const [err, setErr] = useState("");

  useEffect(() => {
    api<{ data: Customer & { analytics: Analytics } }>(`/customers/${id}`).then((r) => setData(r.data)).catch((e) => setErr(e.message));
    apiAllPages<(typeof orders)[number]>(`/customers/${id}/orders`, 50).then((r) => setOrders(r.data)).catch(() => {});
  }, [id]);

  const a = data?.analytics;
  const addresses = useMemo(() => {
    if (!data?.addresses) return [];
    try { return typeof data.addresses === "string" ? JSON.parse(data.addresses) : data.addresses; } catch { return []; }
  }, [data]);

  return (
    <Drawer open title={data?.name ?? "ملف العميل"} onClose={onClose} wide
      footer={canManage && data ? <button className="primary" onClick={() => onEdit(data)}>تعديل</button> : undefined}>
      {err && <div className="alert">{err}</div>}
      {!data ? <div className="muted">جارٍ التحميل…</div> : (
        <>
          <div className="crm-profile-head">
            <div className="crm-profile-badges">
              {data.is_vip && <span className="crm-badge vip">VIP</span>}
              {data.is_blocked && <span className="crm-badge blocked">محظور</span>}
              {data.tags && data.tags.split(",").filter(Boolean).map((tg) => <span key={tg} className="crm-badge">{tg.trim()}</span>)}
            </div>
          </div>

          <Tabs tabs={[["overview", "نظرة عامة"], ["orders", "الطلبات"], ["addresses", "العناوين"], ["analytics", "التحليلات"]]} active={tab} onChange={setTab} />

          {tab === "overview" && (
            <div className="stack">
              <SectionCard title="الاتصال">
                <Row label="الهاتف" value={data.phone} mono />
                <Row label="هاتف بديل" value={data.alt_phone} mono />
                <Row label="البريد" value={data.email} mono />
                <Row label="العنوان" value={data.address} />
                <Row label="تاريخ الميلاد" value={dateAr(data.birthday)} />
              </SectionCard>
              {(data.allergy_note || data.delivery_instructions || data.notes) && (
                <SectionCard title="ملاحظات">
                  <Row label="حساسية/طعام" value={data.allergy_note} />
                  <Row label="تعليمات التوصيل" value={data.delivery_instructions} />
                  <Row label="ملاحظات داخلية" value={data.notes} />
                </SectionCard>
              )}
            </div>
          )}

          {tab === "orders" && (
            orders.length ? (
              <table className="crm-table">
                <thead><tr><th>رقم</th><th>النوع</th><th>الحالة</th><th>الإجمالي</th><th>التاريخ</th></tr></thead>
                <tbody>
                  {orders.map((o) => (
                    <tr key={o.id}>
                      <td className="mono">{o.order_prefix ?? ""}{o.order_no}</td>
                      <td>{t.orders.types[o.order_type] ?? o.order_type}</td>
                      <td><span className={`stub st-${o.status}`}>{t.orders.statuses[o.status] ?? o.status}</span></td>
                      <td className="mono">{Number(o.total).toFixed(2)}</td>
                      <td className="muted">{dateAr(o.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <div className="muted">لا طلبات</div>
          )}

          {tab === "addresses" && (
            addresses.length ? (
              <div className="stack">
                {addresses.map((ad: { label?: string | null; area?: string | null; landmark?: string | null; is_default?: boolean }, i: number) => (
                  <SectionCard key={i} title={`${ad.label || "عنوان"}${ad.is_default ? " (افتراضي)" : ""}`}>
                    <Row label="المنطقة" value={ad.area} />
                    <Row label="علامة مميزة" value={ad.landmark} />
                  </SectionCard>
                ))}
              </div>
            ) : <div className="muted">لا عناوين محفوظة (العنوان الأساسي في النظرة العامة)</div>
          )}

          {tab === "analytics" && a && (
            <div className="stack">
              <div className="crm-kpis">
                <div className="crm-kpi"><b>{a.total_orders}</b><span>إجمالي الطلبات</span></div>
                <div className="crm-kpi"><b>{a.completed_orders}</b><span>مكتملة</span></div>
                <div className="crm-kpi"><b>{a.cancelled_orders}</b><span>ملغاة</span></div>
                <div className="crm-kpi"><b>{money(a.total_spend)}</b><span>إجمالي الإنفاق</span></div>
                <div className="crm-kpi"><b>{money(a.avg_order_value)}</b><span>متوسط الطلب</span></div>
                <div className="crm-kpi"><b>{a.days_since_last_order ?? NA}</b><span>يوم منذ آخر طلب</span></div>
              </div>
              <SectionCard title="السلوك">
                <Row label="أول طلب" value={dateAr(a.first_order_at)} />
                <Row label="آخر طلب" value={dateAr(a.last_order_at)} />
                <Row label="الصنف المفضّل" value={a.favourite_product} />
                <Row label="نوع الطلب الأكثر" value={a.preferred_order_type_actual ? (t.orders.types[a.preferred_order_type_actual] ?? a.preferred_order_type_actual) : NA} />
              </SectionCard>
              {a.recent_items.length > 0 && (
                <SectionCard title="آخر الأصناف المطلوبة">
                  <div className="crm-recent">
                    {a.recent_items.map((it, i) => (
                      <span key={i} className="crm-recent-item">{it.qty}× {it.name_ar}{it.variant_name_ar ? ` (${it.variant_name_ar})` : ""}</span>
                    ))}
                  </div>
                </SectionCard>
              )}
              <p className="muted crm-loyalty-note">نقاط الولاء والمكافآت: بنية جاهزة — تُفعَّل مع وحدة الولاء لاحقًا.</p>
            </div>
          )}
        </>
      )}
    </Drawer>
  );
}

function Row({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  const empty = value == null || value === "" || value === NA;
  return (
    <div className="od-row">
      <span className="od-row-label">{label}</span>
      <span className={`od-row-value${empty ? " na" : ""}${mono ? " mono" : ""}`}>{empty ? NA : value}</span>
    </div>
  );
}
