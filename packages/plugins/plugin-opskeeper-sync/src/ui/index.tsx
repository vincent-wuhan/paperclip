import { usePluginAction, usePluginData, type PluginWidgetProps } from "@paperclipai/plugin-sdk/ui";
import type { MirrorState } from "../types.js";

function formatDate(value: string | null): string {
  return value ? new Date(value).toLocaleString() : "never";
}

export function OpsKeeperDashboardWidget({ context }: PluginWidgetProps) {
  const companyId = context.companyId ?? "";
  const { data, loading, error, refresh } = usePluginData<MirrorState>("opskeeper-incidents", { companyId });
  const resync = usePluginAction("opskeeper-resync");

  if (!companyId) return <div>OpsKeeper mirror is unavailable outside a company workspace.</div>;
  if (loading) return <div>Loading OpsKeeper incidents…</div>;
  if (error) return <div>OpsKeeper mirror error: {error.message}</div>;

  const incidents = data?.incidents ?? [];
  return (
    <section style={{ display: "grid", gap: "0.75rem" }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem" }}>
        <strong>OpsKeeper incidents</strong>
        <button onClick={() => void resync({ companyId }).then(refresh)}>Resync</button>
      </header>
      {data?.stale ? (
        <div role="status">
          OpsKeeper data is stale since {formatDate(data.lastSuccessAt)}. Last error: {data.lastError ?? "unknown"}.
        </div>
      ) : (
        <div>Last successful sync: {formatDate(data?.lastSuccessAt ?? null)}</div>
      )}
      {incidents.length === 0 ? (
        <div>No incidents are mirrored yet.</div>
      ) : (
        <table>
          <thead>
            <tr><th>Severity</th><th>Title</th><th>State</th><th>Updated</th><th /></tr>
          </thead>
          <tbody>
            {incidents.map((incident) => (
              <tr key={incident.id}>
                <td>{incident.severity}</td>
                <td>{incident.title}</td>
                <td>{incident.state}</td>
                <td>{formatDate(incident.updatedAt ?? incident.openedAt)}</td>
                <td><a href={incident.opskeeperUrl} target="_blank" rel="noreferrer">Open</a></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
