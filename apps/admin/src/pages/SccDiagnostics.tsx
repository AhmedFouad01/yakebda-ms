import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";
import { fmtTime, t } from "../lib/t";

type Diagnostics = {
  enabled: boolean;
  enrolled: boolean;
  environment: string;
  productCode: string;
  branchCode: string;
  health: "healthy" | "degraded" | "unhealthy" | "unknown";
  lastHeartbeatAt: string | null;
  lastConnectionError: string | null;
  licenseState: string;
  pendingEvents: number;
  configVersion: number | null;
  updateChannel: string;
  backupStatus: string;
  deviceId: string | null;
  installationId: string | null;
  appVersion: string;
  sdkVersion: string;
};

const yesNo = (value: boolean) => value ? "نعم" : "لا";
const empty = (value: string | number | null) => value === null || value === "" ? "—" : String(value);

export function SccDiagnostics() {
  const [data, setData] = useState<Diagnostics | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError("");
    try {
      const response = await api<{ data: Diagnostics }>("/scc/diagnostics");
      setData(response.data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذّر قراءة حالة الاتصال.");
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function act(path: string, body?: unknown) {
    setBusy(true);
    setError("");
    try {
      const response = await api<{ data: Diagnostics }>(path, { method: "POST", body: body ?? {} });
      setData(response.data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذّر تنفيذ العملية.");
    } finally {
      setBusy(false);
    }
  }

  const rows: Array<[string, string | number]> = data ? [
    [t.scc.enabled, data.enabled ? "مفعّل" : "متوقف"],
    [t.scc.enrollment, yesNo(data.enrolled)],
    [t.scc.health, data.health],
    [t.scc.lastHeartbeat, data.lastHeartbeatAt ? fmtTime(data.lastHeartbeatAt) : "—"],
    [t.scc.lastError, empty(data.lastConnectionError)],
    [t.scc.license, data.licenseState],
    [t.scc.pending, data.pendingEvents],
    [t.scc.config, empty(data.configVersion)],
    [t.scc.channel, data.updateChannel],
    [t.scc.backup, data.backupStatus],
    [t.scc.device, empty(data.deviceId)],
    [t.scc.installation, empty(data.installationId)],
    [t.scc.versions, `${data.appVersion} / ${data.sdkVersion}`],
  ] : [];

  return (
    <>
      <div className="page-head"><h1>{t.scc.title}</h1></div>
      <div className="alert" role="note">{t.scc.pilotNotice}</div>
      {data && !["Valid", "ValidOffline"].includes(data.licenseState) && (
        <div className="error-note" role="status">حالة الترخيص تحتاج متابعة داخلية: {data.licenseState}</div>
      )}
      {error && <div className="error-note" role="alert">{error}</div>}
      <div className="form-row" aria-label="عمليات اتصال Systronic">
        <button type="button" className="secondary" disabled={busy} onClick={() => void load()}>{t.scc.refresh}</button>
        <button type="button" className="primary" disabled={busy || !data?.enabled} onClick={() => void act("/scc/heartbeat")}>{t.scc.heartbeat}</button>
        {data && (
          <button type="button" className={data.enabled ? "danger" : "primary"} disabled={busy} onClick={() => void act("/scc/enabled", { enabled: !data.enabled })}>
            {data.enabled ? t.scc.disable : t.scc.enable}
          </button>
        )}
      </div>
      <div className="panel">
        <table>
          <caption className="sr-only">{t.scc.title}</caption>
          <thead><tr><th>البيان</th><th>القيمة</th></tr></thead>
          <tbody>{rows.map(([label, value]) => <tr key={label}><td>{label}</td><td dir="ltr" style={{ textAlign: "right" }}>{value}</td></tr>)}</tbody>
        </table>
        {!data && !error && <div className="empty">جارٍ تحميل الحالة…</div>}
      </div>
      {data && <div className="empty" dir="ltr">{data.environment} · {data.productCode} · {data.branchCode}</div>}
    </>
  );
}
