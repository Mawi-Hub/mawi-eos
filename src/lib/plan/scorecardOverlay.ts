import { prisma } from "@/lib/db";

type EntryShape = { period: Date | string; projected: number; actual: number | null };

export type KpiForOverlay = {
  sourceType: string;
  sourceKey: string | null;
  unit: string;
  entries: EntryShape[];
};

function convertScorecardToPlanValue(
  rawValue: number,
  planUnit: string,
  scorecardUnit: string
): number {
  if (planUnit === "PCT" && scorecardUnit === "%") return rawValue / 100;
  return rawValue;
}

function monthStart(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

export async function overlayScorecardActuals<T extends KpiForOverlay>(
  kpis: T[]
): Promise<T[]> {
  const sourceKeys = Array.from(
    new Set(
      kpis
        .filter((k) => k.sourceType === "SCORECARD" && k.sourceKey)
        .map((k) => k.sourceKey as string)
    )
  );
  if (sourceKeys.length === 0) return kpis;

  const metrics = await prisma.scorecardMetric.findMany({
    where: { name: { in: sourceKeys } },
    include: {
      entries: { orderBy: { periodStart: "desc" } },
    },
  });
  const metricByName = new Map(metrics.map((m) => [m.name, m]));

  return kpis.map((kpi) => {
    if (kpi.sourceType !== "SCORECARD" || !kpi.sourceKey) return kpi;
    const metric = metricByName.get(kpi.sourceKey);
    if (!metric) return kpi;

    const overlayed = kpi.entries.map((entry) => {
      const periodDate =
        entry.period instanceof Date ? entry.period : new Date(entry.period);
      const start = monthStart(periodDate);
      const end = new Date(
        Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1)
      );

      const match = metric.entries.find(
        (e) =>
          e.periodStart >= start &&
          e.periodStart < end &&
          e.actualValue !== null
      );
      if (!match || match.actualValue === null) return entry;

      return {
        ...entry,
        actual: convertScorecardToPlanValue(match.actualValue, kpi.unit, metric.unit ?? ""),
      };
    });

    return { ...kpi, entries: overlayed };
  });
}
