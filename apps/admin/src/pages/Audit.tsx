import { t, fmtTime } from "../lib/t";
import { useList } from "./hooks";

export function Audit() {
  const { data, error } = useList("/audit-logs");
  return (
    <>
      <div className="page-head"><h1>{t.audit.title}</h1></div>
      {error && <div className="error-note">{error}</div>}
      <div className="panel">
        <table>
          <thead>
            <tr><th>{t.audit.action}</th><th>{t.audit.user}</th><th>{t.audit.branch}</th><th>{t.audit.device}</th><th>{t.audit.time}</th></tr>
          </thead>
          <tbody>
            {data.map((a: any) => (
              <tr key={a.id}>
                <td dir="ltr" style={{ textAlign: "right" }}>{a.action}</td>
                <td>{a.user_name ?? "—"}</td>
                <td>{a.branch_name ?? "—"}</td>
                <td>{a.device_name ?? "—"}</td>
                <td>{fmtTime(a.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {data.length === 0 && <div className="empty">{t.common.empty}</div>}
      </div>
    </>
  );
}
