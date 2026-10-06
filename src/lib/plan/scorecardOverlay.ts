import { prisma } from "@/lib/db";
import { overlayKpisWithMetrics, type KpiForOverlay } from "./effectiveValue";

export type { KpiForOverlay } from "./effectiveValue";

// Punto único para el valor efectivo de un KPI: la portada, el catálogo y el
// detalle llaman a esta función, así el mismo KPI y mes dan el mismo número.
// Resuelve la métrica por scorecardMetricId y, si no hay, por nombre (sourceKey).
export async function overlayScorecardActuals<T extends KpiForOverlay>(kpis: T[]): Promise<T[]> {
  const candidates = kpis.filter((k) => k.sourceType === "SCORECARD");
  const ids = Array.from(new Set(candidates.map((k) => k.scorecardMetricId).filter((v): v is string => !!v)));
  const names = Array.from(new Set(candidates.map((k) => k.sourceKey).filter((v): v is string => !!v)));
  if (ids.length === 0 && names.length === 0) return kpis;

  const metrics = await prisma.scorecardMetric.findMany({
    where: {
      OR: [...(ids.length ? [{ id: { in: ids } }] : []), ...(names.length ? [{ name: { in: names } }] : [])],
    },
    include: { entries: { orderBy: { periodStart: "desc" } } },
  });

  return overlayKpisWithMetrics(kpis, metrics);
}
