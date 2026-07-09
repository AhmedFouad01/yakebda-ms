import { FormEvent, useState } from "react";
import { api } from "../lib/api";
import { t } from "../lib/t";
import { useList } from "./hooks";

export function Users() {
  const { data, error, reload } = useList("/users");
  const roles = useList<any>("/roles");
  const branches = useList<any>("/branches");
  const [form, setForm] = useState({ name: "", email: "", password: "", pin: "", role: "cashier", branch: "" });
  const [err, setErr] = useState("");

  async function add(e: FormEvent) {
    e.preventDefault();
    try {
      await api("/users", {
        method: "POST",
        body: {
          name: form.name,
          email: form.email || undefined,
          password: form.password || undefined,
          pin: form.pin || undefined,
          role_keys: [form.role],
          branch_id: form.branch || undefined,
        },
      });
      setForm({ name: "", email: "", password: "", pin: "", role: "cashier", branch: "" });
      setErr("");
      reload();
    } catch (ex: any) { setErr(ex.message); }
  }

  const set = (k: string) => (e: any) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <>
      <div className="page-head"><h1>{t.users.title}</h1></div>
      {(err || error) && <div className="error-note">{err || error}</div>}
      <form className="form-row" onSubmit={add}>
        <div className="field"><label>{t.common.name}</label><input value={form.name} onChange={set("name")} required /></div>
        <div className="field"><label>{t.users.email}</label><input dir="ltr" type="email" value={form.email} onChange={set("email")} /></div>
        <div className="field"><label>{t.users.password}</label><input dir="ltr" type="password" value={form.password} onChange={set("password")} /></div>
        <div className="field"><label>{t.users.pin}</label><input dir="ltr" value={form.pin} onChange={set("pin")} /></div>
        <div className="field"><label>{t.users.role}</label>
          <select value={form.role} onChange={set("role")}>
            {roles.data.map((r: any) => <option key={r.key} value={r.key}>{r.name_ar}</option>)}
          </select>
        </div>
        <div className="field"><label>{t.devices.branch}</label>
          <select value={form.branch} onChange={set("branch")}>
            <option value="">—</option>
            {branches.data.map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
        <button className="btn">{t.users.add}</button>
      </form>
      <div className="panel">
        <table>
          <thead><tr><th>{t.common.name}</th><th>{t.users.email}</th><th>{t.users.roles}</th><th>الحالة</th></tr></thead>
          <tbody>
            {data.map((u: any) => (
              <tr key={u.id}>
                <td>{u.name}</td>
                <td dir="ltr">{u.email ?? "—"}</td>
                <td>{(u.roles ?? []).map((r: any) => r.name_ar).join("، ") || "—"}</td>
                <td><span className={`stub ${u.is_active ? "on" : "off"}`}>{u.is_active ? t.common.active : t.common.inactive}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
        {data.length === 0 && <div className="empty">{t.common.empty}</div>}
      </div>
    </>
  );
}
