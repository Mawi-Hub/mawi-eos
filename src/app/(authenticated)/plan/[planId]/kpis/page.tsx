import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { PlanKPICard } from "@/components/plan/PlanKPICard";
import type { KPIDirection } from "@/lib/plan/calculations";
import { overlayScorecardActuals } from "@/lib/plan/scorecardOverlay";
import { isSelectionEnabled } from "@/lib/report/config";
import { getQuarterSelection } from "@/lib/selection/quarterSelection";
import { resolveQuarter } from "@/lib/plan/quarterPick";
import { kpiInSelection } from "@/lib/plan/selectionMembership";

type Filter = "todas" | "principales" | "archivadas";

// Catálogo administrativo completo de KPIs del plan. No depende de la
// selección: todo KPI sigue accesible (y con su histórico) aunque ya no esté
// en el trimestre. "Archivadas" = fuera de la selección del trimestre actual.
export default async function PlanKPIsPage({
  params,
  searchParams,
}: {
  params: Promise<{ planId: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { planId } = await params;
  const sp = await searchParams;
  const selectionMode = isSelectionEnabled();
  const rawFilter = Array.isArray(sp.filter) ? sp.filter[0] : sp.filter;
  const filter: Filter = rawFilter === "principales" || (rawFilter === "archivadas" && selectionMode) ? rawFilter : "todas";

  const plan = await prisma.plan.findUnique({
    where: { id: planId },
    include: {
      quarters: true,
      kpis: {
        include: {
          entries: { orderBy: { period: "asc" } },
          owner: { select: { id: true, name: true } },
        },
        orderBy: { displayOrder: "asc" },
      },
    },
  });

  if (!plan) notFound();

  // Mismo valor efectivo que la portada y el detalle.
  const effective = await overlayScorecardActuals(
    plan.kpis.map((k) => ({
      sourceType: k.sourceType as string,
      sourceKey: k.sourceKey,
      scorecardMetricId: k.scorecardMetricId,
      unit: k.unit,
      entries: k.entries.map((e) => ({ period: e.period, projected: e.projected, actual: e.actual })),
    })),
  );

  let selectionRows: { planKpiId: string | null; scorecardMetricId: string | null }[] | null = null;
  if (selectionMode) {
    const quarter = resolveQuarter(plan.quarters, undefined);
    const selection = quarter ? await getQuarterSelection(quarter.id) : null;
    selectionRows = selection?.hasSelection ? selection.rows : null;
  }

  const items = plan.kpis.map((kpi, i) => ({
    kpi,
    entries: effective[i].entries,
    outOfQuarter: selectionRows !== null && !kpiInSelection(kpi, selectionRows),
  }));
  const visible = items.filter((it) =>
    filter === "principales" ? it.kpi.isPrincipal : filter === "archivadas" ? it.outOfQuarter : true,
  );

  const filters: { key: Filter; label: string }[] = [
    { key: "todas", label: "Todas" },
    { key: "principales", label: "Principales" },
    ...(selectionMode ? [{ key: "archivadas" as Filter, label: "Archivadas" }] : []),
  ];

  return (
    <div className="space-y-4">
      <nav className="flex flex-wrap gap-2 text-sm" aria-label="Filtro de KPIs">
        {filters.map((f) => (
          <Link
            key={f.key}
            href={f.key === "todas" ? `/plan/${planId}/kpis` : `/plan/${planId}/kpis?filter=${f.key}`}
            className={`rounded-md px-3 py-1.5 ${
              filter === f.key ? "bg-mawi-100 font-medium text-mawi-800" : "text-gray-600 hover:bg-gray-100"
            }`}
          >
            {f.label}
          </Link>
        ))}
      </nav>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {visible.map(({ kpi, entries, outOfQuarter }) => (
          <PlanKPICard
            key={kpi.id}
            planId={planId}
            kpiId={kpi.id}
            name={kpi.name}
            unit={kpi.unit}
            direction={kpi.direction as KPIDirection}
            target={kpi.target}
            ownerName={kpi.owner.name}
            entries={entries}
            badge={outOfQuarter ? "Fuera del trimestre actual" : undefined}
          />
        ))}
      </div>
      {visible.length === 0 && <p className="text-sm text-gray-500">No hay KPIs en este filtro.</p>}
    </div>
  );
}
