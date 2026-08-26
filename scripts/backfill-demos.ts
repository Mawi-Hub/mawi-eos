// Backfill de "Demos agendadas / semana" desde HubSpot al Scorecard.
// Mismo cálculo que /api/sync/hubspot; útil para el llenado inicial o para
// re-sincronizar sin pasar por el dashboard. Uso: npx tsx scripts/backfill-demos.ts
import "dotenv/config";
import { config as dotenvConfig } from "dotenv";

import { prisma } from "../src/lib/db";
import { searchDemoMeetings } from "../src/lib/integrations/hubspot";
import { calculateStatus } from "../src/lib/utils";

// HUBSPOT_API_KEY vive en .env.local (dotenv/config solo carga .env).
dotenvConfig({ path: ".env.local" });

const DEMOS_METRIC_NAME = "Demos agendadas / semana";
const WEEKS_BACK = 8;

function mondayUTC(d: Date): Date {
  const day = d.getUTCDay();
  const offset = day === 0 ? -6 : 1 - day;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + offset));
}

async function main() {
  const metric = await prisma.scorecardMetric.findFirst({
    where: { name: DEMOS_METRIC_NAME },
  });
  if (!metric) {
    throw new Error(`Métrica "${DEMOS_METRIC_NAME}" no existe; corré el seed de planH2 primero.`);
  }

  const firstWeek = mondayUTC(new Date(Date.now() - WEEKS_BACK * 7 * 24 * 60 * 60 * 1000));
  const meetings = await searchDemoMeetings(firstWeek.toISOString().split("T")[0]);
  console.log(`${meetings.length} demos encontradas en HubSpot desde ${firstWeek.toISOString().split("T")[0]}`);

  const countsByWeek = new Map<number, number>();
  for (const meeting of meetings) {
    if (!meeting.hs_createdate) continue;
    const weekMs = mondayUTC(new Date(meeting.hs_createdate)).getTime();
    countsByWeek.set(weekMs, (countsByWeek.get(weekMs) ?? 0) + 1);
  }

  const quarters = await prisma.quarter.findMany();
  for (const [weekMs, count] of [...countsByWeek].sort(([a], [b]) => a - b)) {
    const periodStart = new Date(weekMs);
    const quarter = quarters.find((q) => periodStart >= q.startDate && periodStart <= q.endDate);
    const week = periodStart.toISOString().split("T")[0];
    if (!quarter) {
      console.warn(`Semana ${week}: sin quarter en la DB, saltada (${count} demos)`);
      continue;
    }
    const status = calculateStatus(count, metric.targetNumeric, metric.targetDirection);
    await prisma.scorecardEntry.upsert({
      where: { metricId_periodStart: { metricId: metric.id, periodStart } },
      update: {
        actualValue: count,
        actualDisplay: null,
        autoSynced: true,
        status,
        notes: `HubSpot backfill ${new Date().toISOString().split("T")[0]}`,
      },
      create: {
        metricId: metric.id,
        quarterId: quarter.id,
        periodStart,
        periodEnd: new Date(weekMs + 6 * 24 * 60 * 60 * 1000),
        actualValue: count,
        autoSynced: true,
        status,
        notes: `HubSpot backfill ${new Date().toISOString().split("T")[0]}`,
      },
    });
    console.log(`Semana ${week}: ${count} demos (${status})`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
