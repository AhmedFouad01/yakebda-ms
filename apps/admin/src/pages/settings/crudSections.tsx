import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, apiAllPages } from "../../lib/api";
import { toast } from "../../components/ui/overlays";
import { Button, SectionCard, ToggleSwitch, TextInput, NumberInput, Select } from "../../components/ui/primitives";
import { useMe } from "../../lib/me";
import { roleLabel } from "../../lib/labels";

/**
 * YKMS-02F — أقسام CRUD في الإعدادات (فروع/منيو/محطات/أوقات/مناطق/سائقون/أدوار).
 * منقولة من Settings 02E إلى نظام uif — ToggleSwitch بدل checkboxes، toast للحفظ.
 */

export function BranchesSection({ editable }: { editable: boolean }) {
  const [rows, setRows] = useState<Array<{
    id: string; name: string; address?: string; phone?: string; is_active: boolean;
    accepts_takeaway: boolean; accepts_delivery: boolean; dine_in_enabled: boolean;
  }>>([]);
  const [error, setError] = useState("");
  

  const load = () => api<{ data: typeof rows }>("/branches").then((r) => setRows(r.data)).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  async function patch(id: string, body: Record<string, unknown>) {
    try {
      await api(`/branches/${id}`, { method: "PATCH", body });
      toast("تم الحفظ ✓");
      setError("");
      load();
    } catch (e: any) { setError(e.message); }
  }

  return (
    <SectionCard title="الفروع">
      {error && <div className="alert">{error}</div>}
      
      <table>
        <thead>
          <tr><th>الفرع</th><th>الهاتف</th><th>نشط</th><th>تيك أواي</th><th>دليفري</th><th>الصالة</th></tr>
        </thead>
        <tbody>
          {rows.map((b) => (
            <tr key={b.id}>
              <td>{b.name}<div className="muted">{b.address}</div></td>
              <td>
                <TextInput disabled={!editable} dir="ltr" defaultValue={b.phone ?? ""} style={{ width: 140 }}
                  onBlur={(e) => e.target.value !== (b.phone ?? "") && patch(b.id, { phone: e.target.value || null })} />
              </td>
              {(["is_active", "accepts_takeaway", "accepts_delivery"] as const).map((k) => (
                <td key={k}>
                  <ToggleSwitch checked={b[k]} disabled={!editable} onChange={(v) => patch(b.id, { [k]: v })} />
                </td>
              ))}
              <td><span className="stub">مقفولة حاليًا</span></td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="muted">أسعار وإتاحة منيو الفرع من صفحة «المنيو». الصالة/الطاولات مخفية بقرار تشغيلي.</div>
    </SectionCard>
  );
}

/* ——— المنيو: أعلام تشغيلية على الأصناف + صورة مربعة ——— */
export function MenuSection({ editable }: { editable: boolean }) {
  const [tab, setTab] = useState<"products" | "info">("products");
  const [stations, setStations] = useState<Array<{ id: string; name_ar: string }>>([]);
  const [rows, setRows] = useState<Array<{
    id: string; name_ar: string; image_url?: string | null; pos_visible: boolean;
    kitchen_printable: boolean; discountable: boolean; prep_station_id?: string | null; prep_time_minutes: number;
  }>>([]);
  const [error, setError] = useState("");
  

  const load = () =>
    Promise.all([
      apiAllPages<(typeof rows)[number]>("/products").then((r) => setRows(r.data)),
      api<{ data: typeof stations }>("/prep-stations").then((r) => setStations(r.data)),
    ]).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  async function patch(id: string, body: Record<string, unknown>) {
    try {
      await api(`/products/${id}`, { method: "PATCH", body });
      toast("تم الحفظ ✓"); setError(""); load();
    } catch (e: any) { setError(e.message); }
  }

  return (
    <SectionCard title="المنيو — أعلام التشغيل">
      <div className="seg" style={{ marginBottom: 10 }}>
        <button className={tab === "products" ? "active" : ""} onClick={() => setTab("products")}>الأصناف</button>
        <button className={tab === "info" ? "active" : ""} onClick={() => setTab("info")}>الأقسام والأحجام والإضافات</button>
      </div>
      {error && <div className="alert">{error}</div>}
      
      {tab === "info" && (
        <div className="muted">
          إدارة الأقسام والأصناف والأحجام (لقمة/هامر فينو وسياحي — كبسولة/رغيف) والإضافات الحقيقية (طحينة/باربيكيو/شيدر/بطاطس)
          تتم من صفحة <Link to="/menu">المنيو</Link> ومدير الأصناف داخل POS — بلا أصناف أو إضافات مخترعة.
          <div className="set-sub">معيار الصور: مربعة 1:1 — 800×800 — JPG/WebP — أقل من 400KB.</div>
        </div>
      )}
      {tab === "products" && (
        <table className="settings-menu-table">
          <thead>
            <tr><th>الصنف</th><th>الصورة (مربعة)</th><th>يظهر في POS</th><th>يُطبع للمطبخ</th><th>قابل للخصم</th><th>محطة التحضير</th><th>تحضير (د)</th></tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id}>
                <td>{p.name_ar}</td>
                <td>
                  <div className="set-img">
                    {p.image_url ? <img src={p.image_url} alt={p.name_ar} /> : <span>—</span>}
                    <input disabled={!editable} dir="ltr" placeholder="https://…" defaultValue={p.image_url ?? ""}
                      onBlur={(e) => e.target.value !== (p.image_url ?? "") && patch(p.id, { image_url: e.target.value || null })} />
                  </div>
                </td>
                {(["pos_visible", "kitchen_printable", "discountable"] as const).map((k) => (
                  <td key={k}>
                    <ToggleSwitch checked={p[k]} disabled={!editable} onChange={(v) => patch(p.id, { [k]: v })} />
                  </td>
                ))}
                <td>
                  <Select disabled={!editable} value={p.prep_station_id ?? ""} onChange={(e) => patch(p.id, { prep_station_id: e.target.value || null })}>
                    <option value="">حسب القسم</option>
                    {stations.map((st) => <option key={st.id} value={st.id}>{st.name_ar}</option>)}
                  </Select>
                </td>
                <td>
                  <input type="number" min={0} disabled={!editable} defaultValue={p.prep_time_minutes}
                    onBlur={(e) => Number(e.target.value) !== p.prep_time_minutes && patch(p.id, { prep_time_minutes: Number(e.target.value) })} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </SectionCard>
  );
}

/* ——— محطات التحضير ——— */
export function StationsSection({ editable }: { editable: boolean }) {
  const [rows, setRows] = useState<Array<{ id: string; name_ar: string; is_active: boolean }>>([]);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const load = () => api<{ data: typeof rows }>("/prep-stations").then((r) => setRows(r.data)).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);
  return (
    <SectionCard title="محطات التحضير">
      {error && <div className="alert">{error}</div>}
      {editable && (
        <div className="form-row">
          <TextInput placeholder="اسم المحطة" value={name} onChange={(e) => setName(e.target.value)} />
          <Button variant="primary" disabled={!name}
            onClick={async () => { try { await api("/prep-stations", { method: "POST", body: { name_ar: name, sort_order: rows.length } }); setName(""); load(); } catch (e: any) { setError(e.message); } }}>
            إضافة محطة
          </Button>
        </div>
      )}
      <div className="seg wrap">
        {rows.map((st) => (
          <Button key={st.id} variant={st.is_active ? "primary" : "secondary"} disabled={!editable}
            onClick={async () => { await api(`/prep-stations/${st.id}`, { method: "PATCH", body: { is_active: !st.is_active } }); load(); }}>
            {st.name_ar}
          </Button>
        ))}
      </div>
      <div className="muted">توجيه الأقسام للمحطات من «أوقات التحضير» أدناه، وتخصيص صنف بعينه من قسم «المنيو».</div>
    </SectionCard>
  );
}

/* ——— أوقات التحضير الافتراضية بالقسم + توجيه المحطة ——— */
export function PrepTimesSection({ editable }: { editable: boolean }) {
  const [cats, setCats] = useState<Array<{ id: string; name_ar: string; default_prep_time_minutes: number; default_prep_station_id?: string | null }>>([]);
  const [stations, setStations] = useState<Array<{ id: string; name_ar: string }>>([]);
  const [error, setError] = useState("");
  const load = () =>
    Promise.all([
      api<{ data: typeof cats }>("/categories").then((r) => setCats(r.data)),
      api<{ data: typeof stations }>("/prep-stations").then((r) => setStations(r.data)),
    ]).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);
  async function patch(id: string, body: Record<string, unknown>) {
    try { await api(`/categories/${id}`, { method: "PATCH", body }); setError(""); load(); }
    catch (e: any) { setError(e.message); }
  }
  return (
    <SectionCard title="أوقات التحضير وتوجيه المحطات (حسب القسم)">
      {error && <div className="alert">{error}</div>}
      <table>
        <thead><tr><th>القسم</th><th>المحطة الافتراضية</th><th>تحضير افتراضي (د)</th></tr></thead>
        <tbody>
          {cats.map((c) => (
            <tr key={c.id}>
              <td>{c.name_ar}</td>
              <td>
                <Select disabled={!editable} value={c.default_prep_station_id ?? ""} onChange={(e) => patch(c.id, { default_prep_station_id: e.target.value || null })}>
                  <option value="">—</option>
                  {stations.map((st) => <option key={st.id} value={st.id}>{st.name_ar}</option>)}
                </Select>
              </td>
              <td>
                <NumberInput min={0} disabled={!editable} defaultValue={c.default_prep_time_minutes} style={{ width: 80 }}
                  onBlur={(e) => Number(e.target.value) !== c.default_prep_time_minutes && patch(c.id, { default_prep_time_minutes: Number(e.target.value) })} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </SectionCard>
  );
}

/* ——— مناطق التوصيل ——— */
export function ZonesSection({ editable }: { editable: boolean }) {
  const [rows, setRows] = useState<Array<{ id: string; name_ar: string; fee: string | number; min_order: string | number; is_active: boolean }>>([]);
  const [form, setForm] = useState({ name_ar: "", fee: 0, min_order: 0 });
  const [error, setError] = useState("");
  const load = () => api<{ data: typeof rows }>("/delivery-zones").then((r) => setRows(r.data)).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);
  return (
    <SectionCard title="مناطق التوصيل">
      {error && <div className="alert">{error}</div>}
      {editable && (
        <div className="form-row">
          <TextInput placeholder="اسم المنطقة" value={form.name_ar} onChange={(e) => setForm({ ...form, name_ar: e.target.value })} />
          <NumberInput min={0} placeholder="رسوم" value={form.fee || ""} onChange={(e) => setForm({ ...form, fee: Number(e.target.value) })} />
          <NumberInput min={0} placeholder="حد أدنى" value={form.min_order || ""} onChange={(e) => setForm({ ...form, min_order: Number(e.target.value) })} />
          <Button variant="primary" disabled={!form.name_ar}
            onClick={async () => { try { await api("/delivery-zones", { method: "POST", body: form }); setForm({ name_ar: "", fee: 0, min_order: 0 }); load(); } catch (e: any) { setError(e.message); } }}>
            إضافة منطقة
          </Button>
        </div>
      )}
      <table>
        <thead><tr><th>المنطقة</th><th>الرسوم</th><th>الحد الأدنى</th><th>نشطة</th></tr></thead>
        <tbody>
          {rows.map((z) => (
            <tr key={z.id}>
              <td>{z.name_ar}</td>
              <td>{Number(z.fee).toFixed(2)}</td>
              <td>{Number(z.min_order).toFixed(2)}</td>
              <td>
                <ToggleSwitch checked={z.is_active} disabled={!editable}
                  onChange={async (v) => { await api(`/delivery-zones/${z.id}`, { method: "PATCH", body: { is_active: v } }); load(); }} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </SectionCard>
  );
}

/* ——— السائقون ——— */
export function DriversSection({ editable }: { editable: boolean }) {
  const { can } = useMe();
  const manage = editable && can("drivers.manage");
  const [rows, setRows] = useState<Array<{ id: string; name: string; phone?: string | null; is_active: boolean }>>([]);
  const [form, setForm] = useState({ name: "", phone: "" });
  const [error, setError] = useState("");
  const load = () => api<{ data: typeof rows }>("/drivers").then((r) => setRows(r.data)).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);
  return (
    <SectionCard title="السائقون">
      {error && <div className="alert">{error}</div>}
      {manage && (
        <div className="form-row">
          <TextInput placeholder="اسم السائق" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <TextInput placeholder="الهاتف" dir="ltr" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <Button variant="primary" disabled={!form.name}
            onClick={async () => { try { await api("/drivers", { method: "POST", body: { name: form.name, phone: form.phone || null } }); setForm({ name: "", phone: "" }); load(); } catch (e: any) { setError(e.message); } }}>
            إضافة سائق
          </Button>
        </div>
      )}
      <table>
        <thead><tr><th>السائق</th><th>الهاتف</th><th>نشط</th></tr></thead>
        <tbody>
          {rows.map((d) => (
            <tr key={d.id}>
              <td>{d.name}</td>
              <td dir="ltr">{d.phone}</td>
              <td>
                <ToggleSwitch checked={d.is_active} disabled={!manage}
                  onChange={async (v) => { await api(`/drivers/${d.id}`, { method: "PATCH", body: { is_active: v } }); load(); }} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="muted">تعيين السائق على طلب دليفري من صفحة «الطلبات». تقرير تسوية السائق — لاحقًا.</div>
    </SectionCard>
  );
}

/* ——— المستخدمون والصلاحيات: مصفوفة قراءة ——— */
export function RolesSection() {
  const [roles, setRoles] = useState<Array<{ id: string; key: string; name_ar: string; permissions?: Array<{ key: string; name_ar: string; group: string }> }>>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    api<{ data: typeof roles }>("/roles").then((r) => setRoles(r.data)).catch((e) => setError(e.message));
  }, []);
  return (
    <SectionCard title="المستخدمون والصلاحيات">
      {error && <div className="alert">{error}</div>}
      <div className="muted">إدارة المستخدمين من صفحة <Link to="/users">المستخدمين</Link>. الخريطة أدناه للقراءة — تحرير الأدوار endpoint لاحقًا.</div>
      {roles.map((role) => {
        const count = (role.permissions ?? []).length;
        const isFull = role.key === "owner" || role.key === "admin";
        return (
          <div key={role.id} className="set-role">
            {/* UX-LANG-01: مفتاح الدور التقني لا يُعرض — الاسم العربي وحده. */}
            <strong>{roleLabel(role.key, role.name_ar)}</strong>
            <div className="set-perms">
              {/* العدّاد نص حقيقي — لا يُصنع من CSS counters (عناصر display:none لا تُحتسب) */}
              {isFull
                ? <span className="stub on">كل الصلاحيات</span>
                : count > 0
                  ? <span className="stub" title={(role.permissions ?? []).map((p) => p.name_ar).join("، ")}>{count} صلاحية</span>
                  : <span className="muted">بلا صلاحيات</span>}
            </div>
          </div>
        );
      })}
    </SectionCard>
  );
}
