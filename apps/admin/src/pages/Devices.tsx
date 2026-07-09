import { FormEvent, useState } from "react";
import { api } from "../lib/api";
import { t, fmtTime } from "../lib/t";
import { useList } from "./hooks";

export function Devices() {
  const { data, error, reload } = useList("/devices");
  const branches = useList<any>("/branches");
  const [form, setForm] = useState({ name: "", type: "pos", branch: "" });
  const [err, setErr] = useState("");

  async function add(e: FormEvent) {
    e.preventDefault();
    try {
      await api("/devices", {
        method: "POST",
        body: { name: form.name, type: form.type, branch_id: form.branch, platform: "windows" },
      });
      setForm({ name: "", type: "pos", branch: "" });
      setErr("");
      reload();
    } catch (ex: any) { setErr(ex.message); }
  }

  return (
    <>
      <div className="page-head"><h1>{t.devices.title}</h1></div>
      {(err || error) && <div className="error-note">{err || error}</div>}
      <form className="form-row" onSubmit={add}>
        <div className="field"><label>{t.common.name}</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></div>
        <div className="field"><label>{t.devices.type}</label>
          <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
            {Object.entries(t.devices.types).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div className="field"><label>{t.devices.branch}</label>
          <select value={form.branch} onChange={(e) => setForm({ ...form, branch: e.target.value })} required>
            <option value="">—</option>
            {branches.data.map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
        <button className="btn">{t.devices.add}</button>
      </form>
      <div className="panel">
        <table>
          <thead><tr><th>{t.common.name}</th><th>{t.devices.type}</th><th>الحالة</th><th>{t.devices.lastSeen}</th></tr></thead>
          <tbody>
            {data.map((d: any) => (
              <tr key={d.id}>
                <td>{d.name}</td>
                <td>{t.devices.types[d.type] ?? d.type}</td>
                <td><span className={`stub ${d.status === "online" ? "on" : "off"}`}>{d.status === "online" ? "متصل" : "غير متصل"}</span></td>
                <td>{fmtTime(d.last_seen_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {data.length === 0 && <div className="empty">{t.common.empty}</div>}
      </div>
    </>
  );
}
