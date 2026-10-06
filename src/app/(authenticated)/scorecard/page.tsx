import Link from "next/link";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { isSelectionEnabled, companyMetricNames } from "@/lib/report/config";
import { getQuarterSelection } from "@/lib/selection/quarterSelection";
import type { SelectionMetricView } from "@/lib/selection/types";
import { formatMetricValue } from "@/lib/metrics/format";
import { isActionableState, resolveDataState } from "@/lib/metrics/dataState";
import { quarterLabel, resolveQuarter, sortQuarters } from "@/lib/plan/quarterPick";
import { DataStateBadge, SelectionMetricValue, SignalBadge } from "@/components/plan/SelectionMetric";
import { ScorecardEntryForm } from "./entry-form";
import { ScorecardSyncButton } from "./sync-button";
import { ScorecardCatalogTable, SOURCE_META, normalizeSource } from "./catalog-table";

export default async function ScorecardPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const session = await auth();
  const sp = await searchParams;

  const activePlan = await prisma.plan.findFirst({
    where: { status: "ACTIVE" },
    orderBy: { startDate: "desc" },
    select: { id: true },
  });
  const activeQuarter = await prisma.quarter.findFirst({ where: { isActive: true } });
  const isCeo = session?.user?.role === "ceo";

  if (!isSelectionEnabled()) {
    // Modo legado: todas las métricas activas, como siempre.
    const metrics = await prisma.scorecardMetric.findMany({
      where: { isActive: true },
      include: { owner: true, entries: { orderBy: { periodStart: "desc" }, take: 1 } },
      orderBy: { sortOrder: "asc" },
    });
    return (
      <div className="space-y-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Scorecard</h1>
            <p className="mt-1 text-sm text-gray-500">
              {activeQuarter ? `Q${activeQuarter.quarter} ${activeQuarter.year}` : "Sin trimestre activo"}
            </p>
          </div>
          {isCeo && <ScorecardSyncButton planId={activePlan?.id ?? null} />}
        </div>
        <ScorecardCatalogTable metrics={metrics} userId={session?.user?.id} activeQuarterId={activeQuarter?.id ?? null} />
      </div>
    );
  }

  // Modo selección: una sola tabla, agrupada por área, con lo que eligió el trimestre.
  const planQuarters = activePlan
    ? await prisma.quarter.findMany({
        where: { planId: activePlan.id },
        select: { id: true, year: true, quarter: true, isActive: true, startDate: true },
      })
    : [];
  const candidates = [...planQuarters];
  if (activeQuarter && !candidates.some((q) => q.id === activeQuarter.id)) {
    candidates.push({
      id: activeQuarter.id,
      year: activeQuarter.year,
      quarter: activeQuarter.quarter,
      isActive: activeQuarter.isActive,
      startDate: activeQuarter.startDate,
    });
  }
  const quarter = resolveQuarter(candidates, sp.q);
  const viewingActive = !!quarter && quarter.id === activeQuarter?.id;

  const selection = quarter ? await getQuarterSelection(quarter.id) : null;

  const groups: { areaId: string; areaName: string; rows: SelectionMetricView[] }[] = [];
  for (const row of selection?.rows ?? []) {
    let g = groups.find((x) => x.areaId === row.areaId);
    if (!g) {
      g = { areaId: row.areaId, areaName: row.areaName, rows: [] };
      groups.push(g);
    }
    g.rows.push(row);
  }

  // Contexto de empresa: bloque aparte, solo con los nombres autorizados.
  const companyNames = companyMetricNames();
  const companyMetrics = companyNames.length
    ? await prisma.scorecardMetric.findMany({
        where: { name: { in: companyNames } },
        include: { entries: { orderBy: { periodStart: "desc" }, take: 1 } },
      })
    : [];
  const now = new Date();

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Scorecard</h1>
          <p className="mt-1 text-sm text-gray-500">{quarter ? quarterLabel(quarter) : "Sin trimestre activo"}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {isCeo && (
            <Link href="/scorecard/catalog" className="text-xs font-medium text-mawi-700 hover:underline">
              Catálogo administrativo de métricas
            </Link>
          )}
          {isCeo && <ScorecardSyncButton planId={activePlan?.id ?? null} />}
        </div>
      </div>

      {candidates.length > 1 && (
        <nav className="flex flex-wrap gap-2 text-sm" aria-label="Trimestre">
          {sortQuarters(candidates).map((q) => (
            <Link
              key={q.id}
              href={`/scorecard?q=${q.id}`}
              className={`rounded-md px-3 py-1.5 ${
                q.id === quarter?.id ? "bg-mawi-100 font-medium text-mawi-800" : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              {quarterLabel(q)}
              {q.isActive ? " (activo)" : ""}
            </Link>
          ))}
        </nav>
      )}

      {quarter && selection && !selection.hasSelection && (
        <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-600">
          Legado sin selección registrada para Q{quarter.quarter}.
        </div>
      )}

      {groups.map((group) => (
        <div key={group.areaId}>
          <h2 className="mb-3 text-lg font-semibold text-gray-900">{group.areaName}</h2>
          <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  {["Métrica", "Owner", "Valor", "Meta", "Semáforo", "Período", "Origen", "Acciones"].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {group.rows.map((row) => {
                  const source = row.metric ? SOURCE_META[normalizeSource(row.metric.dataSource)] : null;
                  const isManual = row.metric ? normalizeSource(row.metric.dataSource) === "manual" : false;
                  const isOwner = !!row.metric && session?.user?.id === row.metric.ownerId;
                  return (
                    <tr key={row.selectionId} className={row.pendingConfig ? "bg-gray-50 text-gray-400" : "hover:bg-gray-50"}>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">
                        <span className={row.pendingConfig ? "text-gray-500" : undefined}>{row.label}</span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">{row.reportOwnerName ?? "—"}</td>
                      <td className="px-4 py-3">
                        <SelectionMetricValue view={row} />
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">{row.pendingConfig ? "—" : row.targetText ?? "Meta por confirmar"}</td>
                      <td className="px-4 py-3">
                        <SignalBadge signal={row.signal} />
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">{row.pendingConfig ? "—" : row.periodLabel}</td>
                      <td className="px-4 py-3">
                        {source ? (
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${source.className}`}>
                            {source.label}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {isManual && isOwner && viewingActive && quarter && row.metric && !row.pendingConfig ? (
                          <ScorecardEntryForm
                            metricId={row.metric.id}
                            metricName={row.label}
                            quarterId={quarter.id}
                            unit={row.metric.unit}
                            prompt={row.definition?.description ?? null}
                            targetNumeric={row.metric.targetNumeric}
                            targetDirection={row.metric.targetDirection}
                          />
                        ) : row.metric && !isManual ? (
                          <span className="text-[11px] text-gray-400">Auto</span>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {companyMetrics.length > 0 && (
        <div>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">Contexto de empresa</h2>
          <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
            <table className="min-w-full divide-y divide-gray-200">
              <tbody className="divide-y divide-gray-100">
                {companyMetrics.map((m) => {
                  const entry = m.entries[0] ?? null;
                  const state = resolveDataState(entry, { frequency: m.frequency, now, autoSynced: m.dataSource !== "manual" });
                  return (
                    <tr key={m.id}>
                      <td className="px-4 py-2 text-sm text-gray-900">{m.name}</td>
                      <td className="px-4 py-2 text-sm">
                        {isActionableState(state) && entry ? (
                          <span className="font-semibold text-gray-900">
                            {entry.actualDisplay ?? formatMetricValue(entry.actualValue, m.unit) ?? "—"}
                          </span>
                        ) : (
                          <DataStateBadge state={state} />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
