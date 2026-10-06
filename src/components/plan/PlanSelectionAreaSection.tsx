import Link from "next/link";
import type { SelectionMetricView } from "@/lib/selection/types";
import { SelectionMetricValue, SignalBadge } from "./SelectionMetric";

type Item = { id: string; title: string; description?: string | null; ownerName?: string | null };

export type SelectionAreaProps = {
  planId: string;
  name: string;
  subtitle?: string;
  ownerName: string | null;
  // null = el trimestre no tiene selección: no se listan métricas.
  rows: SelectionMetricView[] | null;
  principalRock: { title: string; ownerName: string; progress: number; status: string } | null;
  actions: (Item & { expectedImpact?: string | null })[];
  risks: Item[];
};

// Sección de un área de reporte en el Plan H2 (modo selección). Acciones y
// riesgos se muestran siempre; las métricas son solo las del trimestre.
export function PlanSelectionAreaSection({ planId, name, subtitle, ownerName, rows, principalRock, actions, risks }: SelectionAreaProps) {
  return (
    <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
      <header className="bg-gradient-to-br from-mawi-700 to-mawi-500 px-6 py-5 text-white">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            {subtitle && <div className="text-[11px] font-semibold uppercase tracking-[0.18em] opacity-80">{subtitle}</div>}
            <h2 className="mt-1 text-2xl font-bold">{name}</h2>
            <p className="mt-1 text-xs opacity-90">Owner · {ownerName ?? "Por confirmar"}</p>
          </div>
          {principalRock && (
            <div className="rounded-lg bg-white/15 px-3 py-2 text-xs font-medium">
              <div className="text-[10px] font-semibold uppercase tracking-wider opacity-80">Rock principal</div>
              <div className="text-sm font-semibold">{principalRock.title}</div>
              <div className="opacity-80">
                {principalRock.ownerName} · {principalRock.progress}%
              </div>
            </div>
          )}
        </div>
      </header>

      {rows !== null && (
        <div className="border-b border-gray-100 px-6 py-5">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Métricas del trimestre</h3>
          {rows.length === 0 ? (
            <p className="text-sm text-gray-500">Sin métricas seleccionadas para esta área.</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {rows.map((row) => {
                const inner = (
                  <div className={`flex flex-wrap items-center justify-between gap-3 py-2.5 ${row.pendingConfig ? "text-gray-400" : ""}`}>
                    <div className="min-w-0">
                      <div className={`text-sm font-medium ${row.pendingConfig ? "text-gray-500" : "text-gray-900"}`}>{row.label}</div>
                      <div className="text-xs text-gray-500">
                        {row.reportOwnerName ?? "Sin owner"}
                        {!row.pendingConfig && ` · ${row.periodLabel}`}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <SelectionMetricValue view={row} />
                      {!row.pendingConfig && (
                        <span className="text-xs text-gray-500">/ {row.targetText ?? "Meta por confirmar"}</span>
                      )}
                      <SignalBadge signal={row.signal} />
                    </div>
                  </div>
                );
                return (
                  <li key={row.selectionId}>
                    {row.planKpiId ? (
                      <Link href={`/plan/${planId}/kpis/${row.planKpiId}`} className="block hover:bg-gray-50">
                        {inner}
                      </Link>
                    ) : (
                      inner
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 p-6 md:grid-cols-2">
        <div>
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Acciones</h3>
          {actions.length === 0 ? (
            <p className="text-sm text-gray-400">Sin acciones registradas.</p>
          ) : (
            <ol className="space-y-3">
              {actions.map((action, idx) => (
                <li key={action.id} className="flex gap-3">
                  <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-mawi-100 text-xs font-semibold text-mawi-800">
                    {idx + 1}
                  </span>
                  <div>
                    <div className="text-sm font-medium text-gray-900">{action.title}</div>
                    {action.expectedImpact && <div className="mt-0.5 text-xs text-gray-500">{action.expectedImpact}</div>}
                    {action.ownerName && <div className="mt-0.5 text-xs text-gray-400">{action.ownerName}</div>}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
        <div>
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Riesgos</h3>
          {risks.length === 0 ? (
            <p className="text-sm text-gray-400">Sin riesgos registrados.</p>
          ) : (
            <ul className="space-y-3">
              {risks.map((risk) => (
                <li key={risk.id} className="rounded-lg border border-amber-200 bg-amber-50/60 p-3">
                  <div className="text-sm font-medium text-amber-900">{risk.title}</div>
                  {risk.description && <div className="mt-1 text-xs text-amber-800/80">{risk.description}</div>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
