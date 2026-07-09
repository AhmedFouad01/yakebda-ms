import { FormEvent, useState } from "react";
import { api } from "../lib/api";
import { t, fmtTime } from "../lib/t";
import { useList } from "./hooks";

export function Hardware() {
  const { data, error, reload } = useList("/hardware-endpoints");
  const branches = useList<any>("/branches");
  const devices = useList<any>("/devices");
  const [form, setForm] = useState({ name: "", kind: "receipt_printer", connection: "usb", branch: "", device: "" });
  const [err, setErr] = useState("");

  async function add(e: FormEvent) {
    e.preventDefault();
    try {
      await api("/hardware-endpoints", {
        method: "POST",
        body: {
          name: form.name,
          kind: form.kind,
          connection: form.connection,
          branch_id: form.branch,
          device_id: form.device || undefined,
          protocol: "escpos",
        },
      });
      setForm({ name: "", kind: "receipt_printer", connection: "usb", branch: "", device: "" });
      setErr("");
      reload();
    } catch (ex: any) { setErr(ex.message); }
  }
  const set = (k: string) => (e: any) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <>
      <div className="page-head"><h1>{t.hardware.title}</h1></div>
      {(err || error) && <div className="error-note">{err || error}</div>}
      <form className="form-row" onSubmit={add}>
        <div className="field"><label>{t.common.name}</label><input value={form.name} onChange={set("name")} required /></div>
        <div className="field"><label>{t.hardware.kind}</label>
          <select value={form.kind} onChange={set("kind")}>
            {Object.entries(t.hardware.kinds).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div className="field"><label>{t.hardware.connection}</label>
          <select value={form.connection} onChange={set("connection")}>
            <option value="usb">USB</option><option value="lan">LAN</option>
            <option value="bluetooth">Bluetooth</option><option value="windows_driver">Windows Driver</option>
          </select>
        </div>
        <div className="field"><label>{t.devices.branch}</label>
          <select value={form.branch} onChange={set("branch")} required>
            <option value="">—</option>
            {branches.data.map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
        <div className="field"><label>{t.hardware.device}</label>
          <select value={form.device} onChange={set("device")}>
            <option value="">—</option>
            {devices.data.map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
        <button className="btn">{t.hardware.add}</button>
      </form>
      <div className="panel">
        <table>
          <thead><tr><th>{t.common.name}</th><th>{t.hardware.kind}</th><th>{t.hardware.connection}</th><th>{t.devices.lastSeen}</th></tr></thead>
          <tbody>
            {data.map((h: any) => (
              <tr key={h.id}>
                <td>{h.name}</td>
                <td>{t.hardware.kinds[h.kind] ?? h.kind}</td>
                <td dir="ltr">{h.connection}</td>
                <td>{fmtTime(h.last_seen_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {data.length === 0 && <div className="empty">{t.common.empty}</div>}
      </div>
    </>
  );
}
