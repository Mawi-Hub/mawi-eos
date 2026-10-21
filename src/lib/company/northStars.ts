// Las métricas norte del plan activo (MRR, NDR, CCR): último dato del
// scorecard contra lo que el plan pide para el mes en curso.

import { prisma } from "@/lib/db";
import { formatMetricValue } from "@/lib/metrics/format";
import { calculateStatus } from "@/lib/utils";

export type NorthStar = {
  slug: string;
  name: string;
  valueText: string | null;
  planText: string | null;
  periodLabel: string | null;
  signal: "on_track" | "riesgo" | "off_track" | null;
  // Últimos 6 meses (valor real), para una tendencia simple.
  trend: Array<{ label: string; value: number }>;
};

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

export async function northStars(now = new Date()): Promise<NorthStar[]> {
  const plan = await prisma.plan.findFirst({ where: { status: "ACTIVE" }, orderBy: { startDate: "desc" } });
  if (!plan) return [];
  const kpis = await prisma.planKPI.findMany({
    where: { planId: plan.id, area: "NORTH_STAR" },
    include: {
      entries: true,
      scorecardMetric: { include: { entries: { orderBy: { periodStart: "desc" }, take: 6 } } },
    },
    orderBy: { displayOrder: "asc" },
  });
  const month = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);

  return kpis.map((k) => {
    const metric = k.scorecardMetric;
    const latest = metric?.entries.find((e) => e.actualValue !== null) ?? null;
    const planEntry = k.entries.find((e) => e.period.getTime() === month) ?? null;
    const isPct = k.unit === "PCT";
    const projected = planEntry ? (isPct ? planEntry.projected * 100 : planEntry.projected) : null;
    const unit = metric?.unit ?? (isPct ? "%" : k.unit);
    const direction = k.direction === "BELOW" ? "below" : "above";
    const signal =
      latest?.actualValue != null && projected != null
        ? (calculateStatus(latest.actualValue, projected, direction) as NorthStar["signal"])
        : null;
    const label = (d: Date) => `${MONTHS[d.getUTCMonth()]} ${String(d.getUTCFullYear()).slice(2)}`;
    return {
      slug: k.slug,
      name: k.name,
      valueText: latest ? latest.actualDisplay ?? formatMetricValue(latest.actualValue, unit) : null,
      planText: projected != null ? formatMetricValue(projected, unit) : null,
      periodLabel: latest ? label(latest.periodStart) : null,
      signal,
      trend: (metric?.entries ?? [])
        .filter((e) => e.actualValue !== null)
        .slice(0, 6)
        .reverse()
        .map((e) => ({ label: label(e.periodStart), value: e.actualValue as number })),
    };
  });
}
