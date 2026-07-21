import { FormEvent, useState } from "react";
import { api } from "../lib/api";
import { t, fmtTime } from "../lib/t";
import { useList } from "./hooks";
import { Button, Select } from "../components/ui/primitives";
import { printStatusLabel } from "../lib/labels";

export function PrintJobs() {
  const { data, error, reload } = useList("/print-jobs");
  const endpoints = useList<any>("/hardware-endpoints");
  const [endpoint, setEndpoint] = useState("");
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");

  async function testPrint(e: FormEvent) {
    e.preventDefault();
    try {
      const res = await api("/print-jobs", {
        method: "POST",
        body: {
          endpoint_id: endpoint,
          type: "test",
          payload: { lines: ["YAKEBDA MS", "طباعة تجريبية", new Date().toLocaleString("ar-EG")] },
        },
      });
      setOk(res.message);
      setErr("");
      reload();
    } catch (ex: any) { setErr(ex.message); setOk(""); }
  }

  return (
    <div className="print-jobs-page">
      <div className="page-head"><h1>{t.printJobs.title}</h1></div>
      {(err || error) && <div className="error-note">{err || error}</div>}
      {ok && <div className="ok-note">{ok}</div>}
      <form className="form-row" onSubmit={testPrint}>
        <div className="field"><label>{t.printJobs.endpoint}</label>
          <Select value={endpoint} onChange={(e) => setEndpoint(e.target.value)} required>
            <option value="">—</option>
            {endpoints.data.map((h: any) => <option key={h.id} value={h.id}>{h.name}</option>)}
          </Select>
        </div>
        <Button variant="secondary" type="submit">{t.printJobs.test}</Button>
      </form>
      <div className="panel">
        <table>
          <thead><tr><th>{t.printJobs.type}</th><th>{t.printJobs.status}</th><th>محاولات</th><th>{t.common.createdAt}</th></tr></thead>
          <tbody>
            {data.map((j: any) => (
              <tr key={j.id}>
                <td>{j.type === "receipt" ? "إيصال عميل" : j.type === "kitchen_ticket" ? "تذكرة مطبخ" : "تجريبية"}</td>
                <td><span className={`stub ${j.status}`}>{printStatusLabel(j.status)}</span></td>
                <td>{j.attempts}</td>
                <td>{fmtTime(j.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {data.length === 0 && <div className="empty">{t.common.empty}</div>}
      </div>
    </div>
  );
}
