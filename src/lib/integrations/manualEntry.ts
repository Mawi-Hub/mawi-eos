// Escritura de valores manuales de scorecard desde los check-ins por Slack.
// Mismo camino de código y mismas convenciones de período que el flujo
// original de KPIs (y que /api/scorecard): lo comparten el flujo anterior y
// el check-in v2 para no divergir.

import { prisma } from "@/lib/db";
import { calculateStatus } from "@/lib/utils";

export function mondayOfWeek(now: Date): Date {
  const d = new Date(now);
  const day = d.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + mondayOffset);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function currentPeriod(frequency: string, now = new Date()): { start: Date; end: Date } {
  if (frequency === "weekly" || frequency === "daily") {
    const start = mondayOfWeek(now);
    return { start, end: new Date(start.getTime() + 6 * 24 * 60 * 60 * 1000) };
  }
  // monthly / biweekly → calendar month, igual que el entry manual.
  return {
    start: new Date(now.getFullYear(), now.getMonth(), 1),
    end: new Date(now.getFullYear(), now.getMonth() + 1, 0),
  };
}

export async function quarterIdForDate(d: Date): Promise<string | null> {
  const quarter = await prisma.quarter.findFirst({
    where: { startDate: { lte: d }, endDate: { gte: d } },
  });
  return quarter?.id ?? null;
}

export type ManualEntryMetric = {
  id: string;
  frequency: string;
  targetNumeric: number | null;
  targetDirection: string;
};

// Upsert del ScorecardEntry del período vigente. Devuelve false si no hay un
// trimestre que cubra el período (no se escribe nada).
export async function saveManualEntry(
  metric: ManualEntryMetric,
  value: number,
  display: string | null,
  enteredById: string,
  now = new Date(),
): Promise<boolean> {
  const { start, end } = currentPeriod(metric.frequency, now);
  const quarterId = await quarterIdForDate(start);
  if (!quarterId) return false;

  const status = calculateStatus(value, metric.targetNumeric, metric.targetDirection);
  const notes = `Slack check-in ${now.toISOString().split("T")[0]}`;
  await prisma.scorecardEntry.upsert({
    where: { metricId_periodStart: { metricId: metric.id, periodStart: start } },
    update: {
      actualValue: value,
      actualDisplay: display,
      expectedValue: metric.targetNumeric,
      status,
      notes,
      enteredById,
    },
    create: {
      metricId: metric.id,
      quarterId,
      periodStart: start,
      periodEnd: end,
      actualValue: value,
      actualDisplay: display,
      expectedValue: metric.targetNumeric,
      status,
      notes,
      enteredById,
    },
  });
  return true;
}
