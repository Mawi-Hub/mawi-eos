import Link from "next/link";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { isSelectionEnabled, companyMetricNames } from "@/lib/report/config";
import { getQuarterSelection } from "@/lib/selection/quarterSelection";
import type { SelectionMetricView } from "@/lib/selection/types";
import { formatMetricValue } from "@/lib/metrics/format";
import { isActionableState, resolveDataState } from "@/lib/metrics/dataState";
import { quarterLabel, resolveQuarter, sortQuarters } from "@/lib/plan/quarterPick";
import { DataStateBadge, PendingExplainer, SelectionMetricValue } from "@/components/plan/SelectionMetric";
import { LEADER_ROLES } from "@/lib/access";
import { QuickEntry } from "./quick-entry";
import { MetricSettings } from "./metric-settings";
import { ScorecardEntryForm } from "./entry-form";
import { ScorecardSyncButton } from "./sync-button";
import { ScorecardCatalogTable, SOURCE_META, normalizeSource } from "./catalog-table";

// Desde cuándo se trae la tendencia: dos trimestres antes del que se mira.
function historySince(start: Date | null | undefined): Date {
  const base = start ?? new Date(0);
  return new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() - 6, 1));
}

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
  const rows = selection?.rows ?? [];
  const userId = session?.user?.id;

  // Tendencia: últimos 6 períodos de cada métrica, en una sola consulta.
  const metricIds = [...new Set(rows.map((r) => r.metric?.id).filter((v): v is string => !!v))];
  const [history, leaders] = await Promise.all([
    metricIds.length
      ? prisma.scorecardEntry.findMany({
          where: { metricId: { in: metricIds }, actualValue: { not: null }, periodStart: { gte: historySince(quarter?.startDate) } },
          select: { metricId: true, periodStart: true, actualValue: true },
          orderBy: { periodStart: "desc" },
        })
      : Promise.resolve([]),
    isCeo ? prisma.user.findMany({ where: { role: { in: [...LEADER_ROLES] } }, select: { id: true, name: true }, orderBy: { name: "asc" } }) : Promise.resolve([]),
  ]);
  const trendBy = new Map<string, number[]>();
  for (const h of history) {
    const list = trendBy.get(h.metricId) ?? [];
    if (list.length < 6) list.push(h.actualValue as number);
    trendBy.set(h.metricId, list);
  }

  // Filtros rápidos.
  const filter = typeof sp.f === "string" ? sp.f : "all";
  const isRed = (r: SelectionMetricView) => r.signal === "off_track" || r.signal === "riesgo";
  const isMissing = (r: SelectionMetricView) => !r.pendingConfig && r.valueText === null;
  const isMine = (r: SelectionMetricView) => !!r.metric && r.metric.ownerId === userId;
  const visible = rows.filter((r) => (filter === "red" ? isRed(r) : filter === "missing" ? isMissing(r) : filter === "mine" ? isMine(r) : true));
  const counts = { all: rows.length, red: rows.filter(isRed).length, missing: rows.filter(isMissing).length, mine: rows.filter(isMine).length };
  const qParam = quarter ? `q=${quarter.id}&` : "";

  const groups: { areaId: string; areaName: string; rows: SelectionMetricView[] }[] = [];
  for (const row of visible) {
    let g = groups.find((x) => x.areaId === row.areaId);
    if (!g) {
      g = { areaId: row.areaId, areaName: row.areaName, rows: [] };
      groups.push(g);
    }
    g.rows.push(row);
  }

  // Contexto de empresa: solo los nombres autorizados.
  const companyNames = companyMetricNames();
  const companyMetrics = companyNames.length
    ? await prisma.scorecardMetric.findMany({
        where: { name: { in: companyNames } },
        include: { entries: { orderBy: { periodStart: "desc" }, take: 1 } },
      })
    : [];
  const now = new Date();

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Scorecard</h1>
          <p className="mt-1 text-sm text-gray-500">
            {quarter ? quarterLabel(quarter) : "Sin trimestre activo"} · {rows.length} métricas
            {isCeo ? " · ⚙ para cambiar cómo se calcula cada una" : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {isCeo && (
            <Link href="/scorecard/catalog" className="text-xs font-medium text-mawi-700 hover:underline">
              Catálogo de métricas
            </Link>
          )}
          {isCeo && <ScorecardSyncButton planId={activePlan?.id ?? null} />}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav className="flex flex-wrap rounded-lg border border-gray-200 bg-white p-0.5 text-xs font-medium" aria-label="Filtro">
          {(
            [
              ["all", "Todas"],
              ["red", "Fuera de meta"],
              ["missing", "Sin dato"],
              ["mine", "Mías"],
            ] as const
          ).map(([key, label]) => (
            <Link
              key={key}
              href={`/scorecard?${qParam}f=${key}`}
              className={`rounded-md px-3 py-1.5 ${filter === key ? "bg-mawi-100 text-mawi-800" : "text-gray-500 hover:text-gray-900"}`}
            >
              {label} <span className="text-gray-400">{counts[key]}</span>
            </Link>
          ))}
        </nav>
        {candidates.length > 1 && (
          <nav className="flex flex-wrap rounded-lg border border-gray-200 bg-white p-0.5 text-xs font-medium" aria-label="Trimestre">
            {sortQuarters(candidates).map((q) => (
              <Link
                key={q.id}
                href={`/scorecard?q=${q.id}&f=${filter}`}
                className={`rounded-md px-3 py-1.5 ${q.id === quarter?.id ? "bg-mawi-100 text-mawi-800" : "text-gray-500 hover:text-gray-900"}`}
              >
                {quarterLabel(q)}
                {q.isActive ? " · activo" : ""}
              </Link>
            ))}
          </nav>
        )}
      </div>

      {quarter && selection && !selection.hasSelection && (
        <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-600">
          Legado sin selección registrada para Q{quarter.quarter}.
        </div>
      )}

      {rows.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-left text-[11px] font-medium uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-3 py-2">Métrica</th>
                <th className="px-3 py-2 text-right">Valor</th>
                <th className="px-3 py-2 text-right">Meta</th>
                <th className="hidden px-3 py-2 md:table-cell">Tendencia</th>
                <th className="hidden px-3 py-2 lg:table-cell">Período</th>
                <th className="px-3 py-2">Cargar</th>
                {isCeo && <th className="w-8 px-2 py-2" aria-label="Configurar" />}
              </tr>
            </thead>
            {groups.length === 0 ? (
              <tbody>
                <tr>
                  <td colSpan={isCeo ? 7 : 6} className="px-3 py-8 text-center text-sm text-gray-500">Nada en este filtro. 🙌</td>
                </tr>
              </tbody>
            ) : (
              groups.map((group) => (
                <tbody key={group.areaId} className="divide-y divide-gray-100 border-t border-gray-200">
                  <tr className="bg-gray-50/60">
                    <th colSpan={isCeo ? 7 : 6} className="px-3 py-1.5 text-left text-xs font-semibold text-gray-700">{group.areaName}</th>
                  </tr>
                  {group.rows.map((row) => {
                    const src = row.metric ? normalizeSource(row.metric.dataSource) : null;
                    const source = src ? SOURCE_META[src] : null;
                    const canEnter = !!row.metric && src === "manual" && viewingActive && !row.pendingConfig && (isMine(row) || isCeo);
                    const trend = row.metric ? (trendBy.get(row.metric.id) ?? []).slice().reverse() : [];
                    const max = Math.max(...trend, 0);
                    const min = Math.min(...trend, max);
                    const dot = row.signal === "on_track" ? "bg-emerald-500" : row.signal === "riesgo" ? "bg-amber-500" : row.signal === "off_track" ? "bg-red-500" : "bg-gray-200";
                    const def = row.definition ?? {};
                    return (
                      <tr key={row.selectionId} className={row.pendingConfig ? "text-gray-400" : "hover:bg-gray-50"}>
                        <td className="min-w-[12rem] max-w-sm px-3 py-2">
                          <div className="flex items-start gap-2">
                            <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${dot}`} aria-hidden="true" />
                            <span className={`break-words font-medium ${row.pendingConfig ? "text-gray-500" : "text-gray-900"}`} title={def.description ?? undefined}>
                              {row.label}
                            </span>
                          </div>
                          <div className="ml-4 flex flex-wrap gap-x-2 text-[11px] text-gray-400">
                            {row.group && <span className="font-medium text-mawi-600">{row.group} ·</span>}
                            <span>{row.reportOwnerName ?? row.metric?.ownerName ?? "Sin responsable"}</span>
                            {source && <span>· {source.label}</span>}
                            {row.pendingConfig && <span>· por configurar</span>}
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-right">
                          {row.pendingConfig ? <span className="text-xs">—</span> : <SelectionMetricValue view={row} />}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-right text-xs text-gray-500">{row.pendingConfig ? "—" : row.targetText ?? "por confirmar"}</td>
                        <td className="hidden px-3 py-2 md:table-cell">
                          {trend.length > 1 ? (
                            <div className="flex h-6 w-20 items-end gap-0.5" aria-label="Tendencia">
                              {trend.map((t, i) => (
                                <div key={i} className="flex-1 rounded-sm bg-mawi-200" style={{ height: `${max === min ? 50 : 15 + ((t - min) / (max - min)) * 85}%` }} />
                              ))}
                            </div>
                          ) : (
                            <span className="text-[11px] text-gray-300">—</span>
                          )}
                        </td>
                        <td className="hidden whitespace-nowrap px-3 py-2 text-xs text-gray-500 lg:table-cell">{row.pendingConfig ? "—" : row.periodLabel}</td>
                        <td className="px-3 py-2">
                          {canEnter && quarter && row.metric ? (
                            <div className="flex items-center gap-1">
                              <QuickEntry metricId={row.metric.id} quarterId={quarter.id} unit={row.metric.unit} placeholder={row.metric.unit === "%" ? "%" : row.metric.unit === "$" ? "$" : "valor"} />
                              <ScorecardEntryForm
                                metricId={row.metric.id}
                                metricName={row.label}
                                quarterId={quarter.id}
                                unit={row.metric.unit}
                                prompt={def.description ?? null}
                                targetNumeric={row.metric.targetNumeric}
                                targetDirection={row.metric.targetDirection}
                                triggerLabel="Más"
                              />
                            </div>
                          ) : src && src !== "manual" ? (
                            <span className="text-[11px] text-gray-400">Automática</span>
                          ) : null}
                        </td>
                        {isCeo && (
                          <td className="px-2 py-2">
                            <MetricSettings
                              leaders={leaders}
                              value={{
                                selectionId: row.selectionId,
                                label: row.label,
                                group: row.group,
                                description: def.description ?? null,
                                numerator: def.numerator ?? null,
                                denominator: def.denominator ?? null,
                                unit: def.unit ?? row.metric?.unit ?? null,
                                frequency: def.frequency ?? row.metric?.frequency ?? "monthly",
                                direction: def.direction ?? row.metric?.targetDirection ?? "above",
                                aggregation: def.aggregation ?? row.metric?.aggregation ?? "last",
                                target: def.target ?? row.metric?.targetNumeric ?? null,
                                targetText: def.targetText ?? null,
                                targetConfirmed: def.targetConfirmed === true,
                                approved: row.approvalStatus === "approved",
                                notes: def.notes ?? null,
                                metric: row.metric ? { dataSource: row.metric.dataSource, ownerId: row.metric.ownerId } : null,
                              }}
                            />
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              ))
            )}
          </table>
        </div>
      )}

      {rows.some((r) => r.pendingConfig) && <PendingExplainer />}

      {companyMetrics.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {companyMetrics.map((m) => {
            const entry = m.entries[0] ?? null;
            const state = resolveDataState(entry, { frequency: m.frequency, now, autoSynced: m.dataSource !== "manual" });
            return (
              <div key={m.id} className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm">
                <span className="text-gray-500">{m.name}</span>{" "}
                {isActionableState(state) && entry ? (
                  <span className="font-semibold text-gray-900">{entry.actualDisplay ?? formatMetricValue(entry.actualValue, m.unit) ?? "—"}</span>
                ) : (
                  <DataStateBadge state={state} />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
