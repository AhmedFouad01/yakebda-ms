import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { t } from "../lib/t";
import { useList } from "./hooks";
import { Drawer, toast } from "../components/ui/overlays";
import { PageHeader, Tabs, FormField, TextInput, Select, ToggleSwitch, EmptyState } from "../components/ui/primitives";
import { useMe } from "../lib/me";

interface Role { id: string; key: string; name_ar: string; is_system?: boolean; permissions: string[] }
interface Permission { key: string; name_ar: string; group: string }
interface User { id: string; name: string; email?: string | null; branch_id?: string | null; is_active: boolean; created_at: string; updated_at?: string; roles: Array<{ key: string; name_ar: string }> }
interface Branch { id: string; name: string }

const PERM_GROUP_AR: Record<string, string> = {
  dashboard: "لوحة التحكم", pos: "نقطة البيع", orders: "الطلبات", menu: "المنيو", kitchen: "المطبخ",
  customers: "العملاء", delivery: "التوصيل", shifts: "الورديات", reports: "التقارير", settings: "الإعدادات",
  users: "المستخدمون", roles: "الأدوار", devices: "الأجهزة", printing: "الطباعة", audit: "سجل العمليات",
  hardware: "الهاردوير", api: "عملاء API", integrations: "التكاملات",
};

export function Users() {
  const { can } = useMe();
  const [tab, setTab] = useState("users");
  return (
    <div dir="rtl">
      <PageHeader title={t.users.title} subtitle="المستخدمون والأدوار والصلاحيات" />
      <Tabs tabs={[["users", "المستخدمون"], ["roles", "الأدوار والصلاحيات"]]} active={tab} onChange={setTab} />
      {tab === "users" && <UsersTab canManage={can("users.manage")} />}
      {tab === "roles" && <RolesTab canManage={can("roles.manage")} />}
    </div>
  );
}

function UsersTab({ canManage }: { canManage: boolean }) {
  const { data, error, reload } = useList<User>("/users");
  const roles = useList<Role>("/roles");
  const branches = useList<Branch>("/branches");
  const [editing, setEditing] = useState<User | null>(null);
  const [adding, setAdding] = useState(false);

  return (
    <>
      {error && <div className="alert">{error}</div>}
      {canManage && <div className="menu-toolbar-actions" style={{ marginBottom: 12 }}><button className="primary" onClick={() => setAdding(true)}>+ مستخدم جديد</button></div>}
      {!data.length ? <EmptyState message="لا مستخدمين" /> : (
        <div className="panel">
          <table className="crm-table">
            <thead><tr><th>الاسم</th><th>البريد</th><th>الأدوار</th><th>الفرع</th><th>الحالة</th><th>إجراءات</th></tr></thead>
            <tbody>
              {data.map((u) => (
                <tr key={u.id}>
                  <td><b>{u.name}</b></td>
                  <td dir="ltr" className="mono">{u.email ?? "—"}</td>
                  <td>{(u.roles ?? []).map((r) => r.name_ar).join("، ") || "—"}</td>
                  <td className="muted">{branches.data.find((b) => b.id === u.branch_id)?.name ?? "—"}</td>
                  <td><span className={`menu-status ${u.is_active ? "on" : "off"}`}>{u.is_active ? "نشط" : "متوقف"}</span></td>
                  <td>{canManage && <button className="sm primary" onClick={() => setEditing(u)}>تعديل</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {(adding || editing) && (
        <UserEditor user={editing} roles={roles.data} branches={branches.data}
          onClose={() => { setAdding(false); setEditing(null); }}
          onSaved={() => { setAdding(false); setEditing(null); reload(); }} />
      )}
    </>
  );
}

function UserEditor({ user, roles, branches, onClose, onSaved }: { user: User | null; roles: Role[]; branches: Branch[]; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [branchId, setBranchId] = useState(user?.branch_id ?? "");
  const [isActive, setIsActive] = useState(user?.is_active ?? true);
  const [roleKeys, setRoleKeys] = useState<string[]>(user?.roles.map((r) => r.key) ?? ["cashier"]);
  const [password, setPassword] = useState("");
  const [pin, setPin] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  function toggleRole(key: string) {
    setRoleKeys((cur) => (cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key]));
  }

  async function save() {
    setBusy(true);
    try {
      if (user) {
        const body: Record<string, unknown> = { name, email: email || null, branch_id: branchId || null, is_active: isActive, role_keys: roleKeys };
        if (password) body.password = password;
        if (pin) body.pin = pin;
        await api(`/users/${user.id}`, { method: "PATCH", body });
      } else {
        await api("/users", { method: "POST", body: { name, email: email || undefined, password: password || undefined, pin: pin || undefined, role_keys: roleKeys, branch_id: branchId || undefined } });
      }
      toast(user ? "تم تحديث المستخدم" : "تمت إضافة المستخدم");
      onSaved();
    } catch (e: any) { setErr(e.message); setBusy(false); }
  }

  return (
    <Drawer open title={user ? `تعديل: ${user.name}` : "مستخدم جديد"} onClose={onClose}
      footer={<><button className="primary" onClick={save} disabled={busy || !name || !roleKeys.length}>{user ? "حفظ" : "إضافة"}</button><button onClick={onClose}>إلغاء</button></>}>
      {err && <div className="alert">{err}</div>}
      <div className="stack">
        <FormField label="الاسم"><TextInput value={name} onChange={(e) => setName(e.target.value)} /></FormField>
        <FormField label="البريد الإلكتروني"><TextInput dir="ltr" type="email" value={email ?? ""} onChange={(e) => setEmail(e.target.value)} /></FormField>
        <FormField label="الفرع">
          <Select value={branchId ?? ""} onChange={(e) => setBranchId(e.target.value)}>
            <option value="">—</option>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </Select>
        </FormField>
        <FormField label="الأدوار">
          <div className="perm-chips">
            {roles.map((r) => (
              <button type="button" key={r.key} className={roleKeys.includes(r.key) ? "active" : ""} onClick={() => toggleRole(r.key)}>{r.name_ar}</button>
            ))}
          </div>
        </FormField>
        <FormField label={user ? "إعادة تعيين كلمة السر (اتركه فارغًا للإبقاء)" : "كلمة السر (للإدارة)"}><TextInput dir="ltr" type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></FormField>
        <FormField label={user ? "إعادة تعيين PIN (اتركه فارغًا للإبقاء)" : "رمز PIN (للكاشير)"}><TextInput dir="ltr" value={pin} onChange={(e) => setPin(e.target.value)} /></FormField>
        {user && <ToggleSwitch checked={isActive} onChange={setIsActive} label="نشط" />}
      </div>
    </Drawer>
  );
}

function RolesTab({ canManage }: { canManage: boolean }) {
  const { data: roles, error, reload } = useList<Role>("/roles");
  const perms = useList<Permission>("/roles/permissions");
  const [selected, setSelected] = useState<string>("");
  const [draft, setDraft] = useState<Set<string>>(new Set());
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [dupOpen, setDupOpen] = useState(false);

  const role = roles.find((r) => r.id === selected);

  useEffect(() => { if (!selected && roles.length) setSelected(roles[0].id); }, [roles]);
  useEffect(() => { if (role) { setDraft(new Set(role.permissions)); setDirty(false); } }, [selected, roles]);

  const grouped = useMemo(() => {
    const g: Record<string, Permission[]> = {};
    for (const p of perms.data) (g[p.group] ??= []).push(p);
    return g;
  }, [perms.data]);

  function toggle(key: string) {
    if (!canManage) return;
    setDraft((cur) => { const n = new Set(cur); n.has(key) ? n.delete(key) : n.add(key); return n; });
    setDirty(true);
  }
  function toggleGroup(keys: string[], on: boolean) {
    if (!canManage) return;
    setDraft((cur) => { const n = new Set(cur); keys.forEach((k) => (on ? n.add(k) : n.delete(k))); return n; });
    setDirty(true);
  }

  async function save() {
    if (!role) return;
    setBusy(true);
    try {
      await api(`/roles/${role.id}`, { method: "PATCH", body: { permissions: [...draft] } });
      setMsg("تم حفظ الصلاحيات"); setErr(""); setDirty(false); reload();
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  }

  return (
    <>
      {(error || err) && <div className="alert">{error || err}</div>}
      {msg && <div className="ok">{msg}</div>}
      <div className="rbac-layout">
        <aside className="rbac-roles">
          <div className="rbac-roles-head">الأدوار {canManage && <button className="sm" onClick={() => setDupOpen(true)} disabled={!role}>+ تكرار</button>}</div>
          {roles.map((r) => (
            <button key={r.id} className={`rbac-role${r.id === selected ? " active" : ""}`} onClick={() => setSelected(r.id)}>
              <span>{r.name_ar}</span>
              {r.is_system ? <span className="rbac-sys">نظام</span> : null}
              <span className="rbac-count">{r.permissions.length}</span>
            </button>
          ))}
        </aside>

        <section className="rbac-matrix">
          {!role ? <div className="muted">اختر دورًا</div> : (
            <>
              <div className="rbac-matrix-head">
                <h3>صلاحيات: {role.name_ar}</h3>
                {role.key === "owner" && <span className="muted">دور المالك يملك كل الصلاحيات دائمًا</span>}
              </div>
              {Object.entries(grouped).map(([group, list]) => {
                const keys = list.map((p) => p.key);
                const allOn = keys.every((k) => draft.has(k));
                return (
                  <div key={group} className="rbac-group">
                    <div className="rbac-group-head">
                      <span>{PERM_GROUP_AR[group] ?? group}</span>
                      {canManage && <button className="sm" onClick={() => toggleGroup(keys, !allOn)}>{allOn ? "إلغاء الكل" : "تحديد الكل"}</button>}
                    </div>
                    <div className="rbac-perms">
                      {list.map((p) => (
                        <label key={p.key} className={`rbac-perm${draft.has(p.key) ? " on" : ""}${!canManage ? " ro" : ""}`}>
                          <ToggleSwitch checked={draft.has(p.key)} onChange={() => toggle(p.key)} disabled={!canManage} />
                          <span>{p.name_ar}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
              {canManage && (
                <div className="rbac-save">
                  <button className="primary" onClick={save} disabled={busy || !dirty}>حفظ الصلاحيات</button>
                  {dirty && <span className="muted">تغييرات غير محفوظة</span>}
                </div>
              )}
            </>
          )}
        </section>
      </div>

      {dupOpen && role && <DuplicateRole role={role} onClose={() => setDupOpen(false)} onDone={() => { setDupOpen(false); reload(); }} />}
    </>
  );
}

function DuplicateRole({ role, onClose, onDone }: { role: Role; onClose: () => void; onDone: () => void }) {
  const [key, setKey] = useState(`${role.key}_copy`);
  const [nameAr, setNameAr] = useState(`${role.name_ar} (نسخة)`);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  async function run() {
    setBusy(true);
    try { await api(`/roles/${role.id}/duplicate`, { method: "POST", body: { key, name_ar: nameAr } }); toast("تم تكرار الدور"); onDone(); }
    catch (e: any) { setErr(e.message); setBusy(false); }
  }
  return (
    <Drawer open title="تكرار الدور" onClose={onClose}
      footer={<><button className="primary" onClick={run} disabled={busy || !key || !nameAr}>تكرار</button><button onClick={onClose}>إلغاء</button></>}>
      {err && <div className="alert">{err}</div>}
      <div className="stack">
        <FormField label="مفتاح الدور (إنجليزي)"><TextInput dir="ltr" value={key} onChange={(e) => setKey(e.target.value)} /></FormField>
        <FormField label="اسم الدور"><TextInput value={nameAr} onChange={(e) => setNameAr(e.target.value)} /></FormField>
      </div>
    </Drawer>
  );
}
