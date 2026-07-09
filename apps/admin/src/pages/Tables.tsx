import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { t } from "../lib/t";

interface TableRow {
  id: string;
  branch_id: string;
  branch_name: string;
  name_ar: string;
  seats: number;
  status: string;
}

export function Tables() {
  const nav = useNavigate();
  const [rows, setRows] = useState<TableRow[]>([]);
  const [branches, setBranches] = useState<Array<{ id: string; name: string }>>([]);
  const [branchId, setBranchId] = useState("");
  const [name, setName] = useState("");
  const [seats, setSeats] = useState(4);
  const [error, setError] = useState("");

  async function load() {
    const res = await api<{ data: TableRow[] }>("/tables");
    setRows(res.data);
  }
  useEffect(() => {
    load().catch((e) => setError(e.message));
    api<{ data: typeof branches }>("/branches").then((r) => {
      setBranches(r.data);
      if (r.data.length) setBranchId(r.data[0].id);
    });
  }, []);

  async function add() {
    try {
      await api("/tables", { method: "POST", body: { branch_id: branchId, name_ar: name, seats } });
      setName("");
      await load();
      setError("");
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function setStatus(id: string, status: string) {
    try {
      await api(`/tables/${id}`, { method: "PATCH", body: { status } });
      await load();
    } catch (e: any) {
      setError(e.message);
    }
  }

  return (
    <div dir="rtl">
      <h2>{t.tables.title}</h2>
      {error && <div className="alert">{error}</div>}
      <div className="form-row">
        <select value={branchId} onChange={(e) => setBranchId(e.target.value)}>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
        <input placeholder={t.common.name} value={name} onChange={(e) => setName(e.target.value)} />
        <input type="number" min={1} value={seats} onChange={(e) => setSeats(Number(e.target.value))} title={t.tables.seats} />
        <button className="primary" onClick={add} disabled={!name}>{t.tables.add}</button>
      </div>
      <div className="tables-grid">
        {rows.map((x) => (
          <div key={x.id} className={`table-card tb-${x.status}`}>
            <div className="table-name">{x.name_ar}</div>
            <div className="muted">{x.branch_name} — {x.seats} {t.tables.seats}</div>
            <select value={x.status} onChange={(e) => setStatus(x.id, e.target.value)}>
              {Object.entries(t.tables.statuses).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
            <button className="primary wide" onClick={() => nav(`/pos?branch=${x.branch_id}&table=${x.id}`)}>
              {t.tables.startOrder}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
