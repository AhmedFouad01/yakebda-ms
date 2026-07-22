import { FormEvent, useState } from "react";
import { api } from "../lib/api";
import { t, fmtTime } from "../lib/t";
import { useList } from "./hooks";
import { clientKindLabel } from "../lib/labels";

export function ApiClients() {
  const { data, error, reload } = useList("/api-clients");
  const [form, setForm] = useState({ name: "", kind: "bridge" });
  const [err, setErr] = useState("");
  const [newToken, setNewToken] = useState("");

  async function add(e: FormEvent) {
    e.preventDefault();
    try {
      await api("/api-clients", { method: "POST", body: form });
      setForm({ name: "", kind: "bridge" });
      setErr("");
      reload();
    } catch (ex: any) { setErr(ex.message); }
  }

  async function issueToken(clientId: string, kind: string) {
    try {
      const scopes = kind === "bridge" ? ["bridge"] : ["orders.read"];
      const res = await api(`/api-clients/${clientId}/tokens`, {
        method: "POST",
        body: { name: "رمز جديد", scopes },
      });
      setNewToken(res.data.token);
      setErr("");
      reload();
    } catch (ex: any) { setErr(ex.message); }
  }

  return (
    <>
      <div className="page-head"><h1>{t.apiClients.title}</h1></div>
      {(err || error) && <div className="error-note">{err || error}</div>}
      {newToken && (
        <div className="ok-note">
          {t.apiClients.tokenOnce} <code className="token">{newToken}</code>
        </div>
      )}
      <form className="form-row" onSubmit={add}>
        <div className="field"><label>{t.common.name}</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></div>
        <div className="field"><label>{t.apiClients.kind}</label>
          <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
            {Object.entries(t.apiClients.kinds).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <button className="btn">{t.apiClients.add}</button>
      </form>
      <div className="panel">
        <table>
          <thead><tr><th>{t.common.name}</th><th>{t.apiClients.kind}</th><th>الرموز</th><th>{t.common.createdAt}</th><th></th></tr></thead>
          <tbody>
            {data.map((c: any) => (
              <tr key={c.id}>
                <td>{c.name}</td>
                <td>{clientKindLabel(c.kind)}</td>
                <td dir="ltr">{(c.tokens ?? []).filter((tk: any) => !tk.revoked_at).map((tk: any) => `${tk.prefix}…`).join(" ، ") || "—"}</td>
                <td>{fmtTime(c.created_at)}</td>
                <td><button type="button" className="btn secondary" onClick={() => issueToken(c.id, c.kind)}>{t.apiClients.newToken}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        {data.length === 0 && <div className="empty">{t.common.empty}</div>}
      </div>
    </>
  );
}
