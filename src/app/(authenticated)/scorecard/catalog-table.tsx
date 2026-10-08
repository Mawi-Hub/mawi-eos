import { CATEGORIES, STATUS_CONFIG } from "@/lib/utils";
import { ScorecardEntryForm } from "./entry-form";

export type SourceKey = "chartmogul" | "hubspot" | "posthog" | "chat" | "manual";

export const SOURCE_META: Record<SourceKey, { label: string; className: string }> = {
  chartmogul: { label: "ChartMogul", className: "bg-emerald-100 text-emerald-800" },
  hubspot: { label: "HubSpot", className: "bg-orange-100 text-orange-800" },
  posthog: { label: "PostHog", className: "bg-purple-100 text-purple-800" },
  chat: { label: "Chat", className: "bg-sky-100 text-sky-800" },
  manual: { label: "Manual", className: "bg-gray-100 text-gray-700" },
};

export function normalizeSource(value: string | null): SourceKey {
  const lower = (value ?? "manual").toLowerCase();
  if (lower === "chartmogul" || lower === "hubspot" || lower === "posthog" || lower === "chat") {
    return lower;
  }
  return "manual";
}

export function formatActual(value: number | null | undefined, unit: string | null): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  const u = (unit ?? "").trim();
  if (u === "$") {
    return `$${value.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  }
  if (u === "%") {
    return `${value.toLocaleString("en-US", { maximumFractionDigits: 1 })}%`;
  }
  if (u === "ratio") {
    return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
  }
  if (u === "days") {
    return `${value.toLocaleString("en-US", { maximumFractionDigits: 0 })} d`;
  }
  if (u === "hours") {
    return `${value.toLocaleString("en-US", { maximumFractionDigits: 1 })} h`;
  }
  if (u === "months") {
    return `${value.toLocaleString("en-US", { maximumFractionDigits: 0 })} m`;
  }
  if (u === "boolean") {
    return value === 1 ? "Sí" : "No";
  }
  return value.toLocaleString("en-US", { maximumFractionDigits: 1 });
}

type CatalogMetric = {
  id: string;
  name: string;
  category: string;
  calculation: string | null;
  unit: string | null;
  ownerId: string;
  owner: { name: string };
  targetValue: string | null;
  targetNumeric: number | null;
  targetDirection: string;
  frequency: string;
  dataSource: string;
  entries: { status: string; actualDisplay: string | null; actualValue: number | null; updatedAt: Date }[];
};

// Tabla agrupada por categoría con todas las métricas activas. Es el catálogo
// administrativo: no depende de la selección trimestral.
export function ScorecardCatalogTable({
  metrics,
  userId,
  activeQuarterId,
}: {
  metrics: CatalogMetric[];
  userId: string | undefined;
  activeQuarterId: string | null;
}) {
  const grouped = Object.entries(CATEGORIES).map(([key, config]) => ({
    key,
    ...config,
    metrics: metrics.filter((m) => m.category === key),
  }));

  return (
    <>
      {grouped.map((group) => (
        <div key={group.key}>
          <div className="mb-4 flex items-center gap-2">
            <div className={`h-3 w-3 rounded-full ${group.color}`} />
            <h2 className="text-lg font-semibold text-gray-900">{group.label}</h2>
          </div>

          <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Métrica</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Owner</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Valor Actual</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Target</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Estado</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Frecuencia</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Origen</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Actualizado</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {group.metrics.map((metric) => {
                  const lastEntry = metric.entries[0];
                  const status = lastEntry?.status || "pending";
                  const statusConfig = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
                  const isOwner = userId === metric.ownerId;
                  const source = normalizeSource(metric.dataSource);
                  const sourceMeta = SOURCE_META[source];
                  const isManual = source === "manual";

                  return (
                    <tr key={metric.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="text-sm font-medium text-gray-900">{metric.name}</div>
                        <div className="text-xs text-gray-500">{metric.calculation}</div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">{metric.owner.name}</td>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">
                        {lastEntry?.actualDisplay ||
                          formatActual(lastEntry?.actualValue, metric.unit)}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">{metric.targetValue || "—"}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusConfig.className}`}>
                          {statusConfig.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs capitalize text-gray-500">{metric.frequency}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${sourceMeta.className}`}
                        >
                          {sourceMeta.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-400">
                        {lastEntry?.updatedAt
                          ? new Date(lastEntry.updatedAt).toLocaleDateString("es", { day: "numeric", month: "short" })
                          : "—"}
                      </td>
                      <td className="px-4 py-3">
                        {isManual ? (
                          isOwner && activeQuarterId && (
                            <ScorecardEntryForm
                              metricId={metric.id}
                              metricName={metric.name}
                              quarterId={activeQuarterId}
                              unit={metric.unit}
                              prompt={metric.calculation}
                              targetNumeric={metric.targetNumeric}
                              targetDirection={metric.targetDirection}
                            />
                          )
                        ) : (
                          <span className="text-[11px] text-gray-400">Auto</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </>
  );
}
