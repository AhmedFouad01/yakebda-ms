import { FormEvent, useState } from "react";
import { api } from "../lib/api";
import { t, fmtTime } from "../lib/t";
import { useList } from "./hooks";

export function Branches() {
  const { data, error, reload } = useList("/branches");
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [err, setErr] = useState("");

  async function add(e: FormEvent) {
    e.preventDefault();
    try {
      await api("/branches", { method: "POST", body: { name, address } });
      setName(""); setAddress(""); setErr("");
      reload();
    } catch (ex: any) { setErr(ex.message); }
  }

  return (
    <>
      <div className="page-head"><h1>{t.branches.title}</h1></div>
      {(err || error) && <div className="error-note">{err || error}</div>}
      <form className="form-row" onSubmit={add}>
        <div className="field"><label>{t.common.name}</label><input value={name} onChange={(e) => setName(e.target.value)} required /></div>
        <div className="field"><label>{t.branches.address}</label><input value={address} onChange={(e) => setAddress(e.target.value)} /></div>
        <button className="btn">{t.branches.add}</button>
      </form>
      <div className="panel">
        <table>
          <thead><tr><th>{t.common.name}</th><th>{t.branches.address}</th><th>{t.branches.timezone}</th><th>{t.common.createdAt}</th></tr></thead>
          <tbody>
            {data.map((b: any) => (
              <tr key={b.id}><td>{b.name}</td><td>{b.address ?? "—"}</td><td dir="ltr">{b.timezone}</td><td>{fmtTime(b.created_at)}</td></tr>
            ))}
          </tbody>
        </table>
        {data.length === 0 && <div className="empty">{t.common.empty}</div>}
      </div>
    </>
  );
}
