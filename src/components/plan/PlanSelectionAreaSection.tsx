import Link from "next/link";
import type { SelectionMetricView } from "@/lib/selection/types";
import { formatKPIValueFull } from "@/lib/plan/calculations";
import { MiniTrend, type TrendEntry } from "./MiniTrend";
import { PendingConfigBadge, SelectionMetricValue, SignalBadge } from "./SelectionMetric";

type Item = { id: string; title: string; description?: string | null; ownerName?: string | null };

export type RowTrend = {
  kpiId: string;
  unit: string;
  target: number;
  entries: TrendEntry[];
  // Esperado del plan para el mes en curso.
  expectedNow: number | null;
  expectedLabel: string | null;
};

export type SelectionAreaProps = {
  planId: string;
  name: string;
  subtitle?: string;
  ownerName: string | null;
  // null = el trimestre no tiene selección: no se listan métricas.
  rows: SelectionMetricView[] | null;
  trends?: Record<string, RowTrend>;
  principalRock: { title: string; ownerName: string; progress: number; status: string } | null;
  actions: (Item & { expectedImpact?: string | null })[];
  risks: Item[];
};

const ROCK_STATUS: Record<string, string> = { on_track: "bg-emerald-500", riesgo: "bg-amber-500", off_track: "bg-red-500", done: "bg-emerald-600" };

// Sección compacta de un área en el Plan H2: encabezado de una línea, tabla de
// métricas con esperado vs real y mini-gráfica, y acciones/riesgos plegados.
export function PlanSelectionAreaSection({ planId, name, subtitle, ownerName, rows, trends = {}, principalRock, actions, risks }: SelectionAreaProps) {
  return (
    <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-gray-100 bg-gray-50/70 px-4 py-3">
        <div className="flex items-baseline gap-2">
          <h2 className="text-base font-bold text-gray-900">{name}</h2>
          <span className="text-xs text-gray-500">{subtitle ?? `Owner · ${ownerName ?? "por confirmar"}`}</span>
        </div>
        {principalRock && (
          <div className="flex min-w-[16rem] items-center gap-3 text-xs">
            <div className="min-w-0 flex-1">
              <div className="truncate text-gray-500">
                <span className="font-semibold uppercase tracking-wide">Rock</span> · {principalRock.title}
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-gray-200">
                <div className={`h-full ${ROCK_STATUS[principalRock.status] ?? "bg-gray-400"}`} style={{ width: `${Math.min(100, Math.max(0, principalRock.progress))}%` }} />
              </div>
            </div>
            <span className="font-semibold text-gray-700">{principalRock.progress}%</span>
          </div>
        )}
      </header>

      {rows !== null &&
        (rows.length === 0 ? (
          <p className="px-4 py-3 text-sm text-gray-500">Sin métricas seleccionadas para esta área.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] font-medium uppercase tracking-wide text-gray-400">
                  <th className="px-4 py-2">Métrica</th>
                  <th className="px-3 py-2">Real</th>
                  <th className="px-3 py-2">Esperado</th>
                  <th className="px-3 py-2">Meta</th>
                  <th className="px-3 py-2">Tendencia</th>
                  <th className="px-3 py-2">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((row) => {
                  const trend = trends[row.selectionId];
                  const nameCell = (
                    <>
                      <div className={`font-medium ${row.pendingConfig ? "text-gray-500" : "text-gray-900"}`}>{row.label}</div>
                      <div className="text-xs text-gray-400">
                        {row.reportOwnerName ?? "Sin owner"}
                        {!row.pendingConfig && ` · ${row.periodLabel}`}
                      </div>
                    </>
                  );
                  return (
                    <tr key={row.selectionId} className={row.pendingConfig ? "bg-gray-50/60" : "hover:bg-gray-50"}>
                      <td className="px-4 py-2.5">
                        {trend || row.planKpiId ? (
                          <Link href={`/plan/${planId}/kpis/${trend?.kpiId ?? row.planKpiId}`} className="block hover:underline">
                            {nameCell}
                          </Link>
                        ) : (
                          nameCell
                        )}
                      </td>
                      {row.pendingConfig ? (
                        <td colSpan={4} className="px-3 py-2.5 text-xs text-gray-400">
                          <PendingConfigBadge view={row} />
                        </td>
                      ) : (
                        <>
                          <td className="px-3 py-2.5">
                            <SelectionMetricValue view={row} />
                          </td>
                          <td className="px-3 py-2.5 text-gray-600">
                            {trend?.expectedNow != null ? (
                              <>
                                {formatKPIValueFull(trend.expectedNow, trend.unit)}
                                {trend.expectedLabel && <div className="text-[11px] text-gray-400">{trend.expectedLabel}</div>}
                              </>
                            ) : (
                              <span className="text-gray-300">—</span>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-gray-600">
                            {row.targetText ?? (trend ? <span title="Meta del plan; aún sin confirmar para el scorecard">{formatKPIValueFull(trend.target, trend.unit)}<span className="ml-1 text-[11px] text-gray-400">plan</span></span> : <span className="text-gray-400">por confirmar</span>)}
                          </td>
                          <td className="px-3 py-1.5">{trend ? <MiniTrend entries={trend.entries} target={trend.target} unit={trend.unit} /> : <span className="text-xs text-gray-300">—</span>}</td>
                        </>
                      )}
                      <td className="px-3 py-2.5">{row.pendingConfig ? null : <SignalBadge signal={row.signal} />}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))}

      {(actions.length > 0 || risks.length > 0) && (
        <details className="border-t border-gray-100 px-4 py-2.5 text-sm">
          <summary className="cursor-pointer select-none text-xs font-medium text-gray-600">
            Acciones ({actions.length}) · Riesgos ({risks.length})
          </summary>
          <div className="mt-3 grid grid-cols-1 gap-5 md:grid-cols-2">
            <div>
              <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500">Acciones</h3>
              {actions.length === 0 ? (
                <p className="text-xs text-gray-400">Sin acciones registradas.</p>
              ) : (
                <ol className="space-y-2">
                  {actions.map((a, i) => (
                    <li key={a.id} className="flex gap-2">
                      <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-mawi-100 text-[11px] font-semibold text-mawi-800">{i + 1}</span>
                      <div className="text-sm text-gray-800">
                        {a.title}
                        {a.expectedImpact && <div className="text-xs text-gray-500">{a.expectedImpact}</div>}
                        {a.ownerName && <div className="text-xs text-gray-400">{a.ownerName}</div>}
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </div>
            <div>
              <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500">Riesgos</h3>
              {risks.length === 0 ? (
                <p className="text-xs text-gray-400">Sin riesgos registrados.</p>
              ) : (
                <ul className="space-y-2">
                  {risks.map((r) => (
                    <li key={r.id} className="rounded-md border border-amber-200 bg-amber-50/60 px-3 py-2">
                      <div className="text-sm font-medium text-amber-900">{r.title}</div>
                      {r.description && <div className="text-xs text-amber-800/80">{r.description}</div>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </details>
      )}
    </section>
  );
}
