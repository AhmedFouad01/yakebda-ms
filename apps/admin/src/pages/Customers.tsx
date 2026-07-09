import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { t } from "../lib/t";

interface Customer {
  id: string;
  name: string;
  phone?: string | null;
  address?: string | null;
  notes?: string | null;
  created_at: string;
}

export function Customers() {
  const [rows, setRows] = useState<Customer[]>([]);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({ name: "", phone: "", address: "", notes: "" });
  const [editing, setEditing] = useState<Customer | null>(null);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  async function load() {
    const res = await api<{ data: Customer[] }>(`/customers${search ? `?search=${encodeURIComponent(search)}` : ""}`);
    setRows(res.data);
  }
  useEffect(() => {
    const id = setTimeout(() => load().catch((e) => setError(e.message)), 250);
    return () => clearTimeout(id);
  }, [search]);

  async function save() {
    try {
      if (editing) {
        await api(`/customers/${editing.id}`, { method: "PATCH", body: form });
      } else {
        await api("/customers", { method: "POST", body: form });
      }
      setForm({ name: "", phone: "", address: "", notes: "" });
      setEditing(null);
      setMsg(t.common.save + " ✓");
      setError("");
      await load();
    } catch (e: any) {
      setError(e.message);
    }
  }

  function startEdit(c: Customer) {
    setEditing(c);
    setForm({ name: c.name, phone: c.phone ?? "", address: c.address ?? "", notes: c.notes ?? "" });
  }

  return (
    <div dir="rtl">
      <h2>{t.customers.title}</h2>
      {error && <div className="alert">{error}</div>}
      {msg && <div className="ok">{msg}</div>}
      <div className="form-row">
        <input placeholder={t.common.name} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <input placeholder={t.customers.phone} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        <input placeholder={t.customers.address} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
        <input placeholder={t.customers.notes} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        <button className="primary" onClick={save} disabled={!form.name}>
          {editing ? t.common.save : t.customers.add}
        </button>
        {editing && (
          <button
            onClick={() => {
              setEditing(null);
              setForm({ name: "", phone: "", address: "", notes: "" });
            }}
          >
            {t.common.cancel}
          </button>
        )}
      </div>
      <div className="filters">
        <input placeholder={t.customers.search} value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      <table>
        <thead>
          <tr>
            <th>{t.common.name}</th>
            <th>{t.customers.phone}</th>
            <th>{t.customers.address}</th>
            <th>{t.customers.notes}</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.id}>
              <td>{c.name}</td>
              <td>{c.phone}</td>
              <td>{c.address}</td>
              <td>{c.notes}</td>
              <td><button onClick={() => startEdit(c)}>{t.common.edit}</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
