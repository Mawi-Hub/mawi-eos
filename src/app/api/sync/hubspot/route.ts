import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  searchDeals,
  searchContacts,
  searchDemoMeetings,
  calculatePipelineMetrics,
} from "@/lib/integrations/hubspot";
import { calculateStatus } from "@/lib/utils";

// Must match the Scorecard metric name seeded in prisma/seeds/planH2.ts.
const DEMOS_METRIC_NAME = "Demos agendadas / semana";
const DEMOS_WEEKS_BACK = 8;

// Monday 00:00 UTC of the week containing `d` — same week convention the
// manual scorecard entry route uses (server local time is UTC on Vercel).
function mondayUTC(d: Date): Date {
  const day = d.getUTCDay();
  const offset = day === 0 ? -6 : 1 - day;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + offset));
}

export async function POST() {
  const session = await auth();
  if (!session?.user || session.user.role !== "ceo") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

    const [dealsResult, contactsResult] = await Promise.all([
      searchDeals([
        { propertyName: "createdate", operator: "GTE", value: thirtyDaysAgo },
      ]),
      searchContacts([
        { propertyName: "createdate", operator: "GTE", value: thirtyDaysAgo },
        { propertyName: "lifecyclestage", operator: "EQ", value: "marketingqualifiedlead" },
      ]),
    ]);

    const deals = dealsResult.results?.map((d: { properties: Record<string, string> }) => d.properties) || [];
    const leads = contactsResult.results?.map((c: { properties: Record<string, string> }) => c.properties) || [];

    const metrics = calculatePipelineMetrics(leads, deals, { completed: 0, total: 0 });

    await prisma.apiSyncCache.upsert({
      where: { source_dataKey: { source: "hubspot", dataKey: "pipeline_metrics" } },
      update: { data: metrics as object, syncedAt: new Date() },
      create: { source: "hubspot", dataKey: "pipeline_metrics", data: metrics as object, syncedAt: new Date() },
    });

    // Demos agendadas / semana → ScorecardEntry, bucketed by booking week.
    // The current (partial) week is written too and refreshes on each sync.
    const demosByWeek: Record<string, number> = {};
    const demosMetric = await prisma.scorecardMetric.findFirst({
      where: { name: DEMOS_METRIC_NAME },
    });

    if (demosMetric) {
      const firstWeek = mondayUTC(new Date(Date.now() - DEMOS_WEEKS_BACK * 7 * 24 * 60 * 60 * 1000));
      const demoMeetings = await searchDemoMeetings(firstWeek.toISOString().split("T")[0]);

      const countsByWeek = new Map<number, number>();
      for (const meeting of demoMeetings) {
        if (!meeting.hs_createdate) continue;
        const weekMs = mondayUTC(new Date(meeting.hs_createdate)).getTime();
        countsByWeek.set(weekMs, (countsByWeek.get(weekMs) ?? 0) + 1);
      }

      const quarters = await prisma.quarter.findMany();
      for (const [weekMs, count] of countsByWeek) {
        const periodStart = new Date(weekMs);
        const quarter = quarters.find((q) => periodStart >= q.startDate && periodStart <= q.endDate);
        if (!quarter) continue;

        await prisma.scorecardEntry.upsert({
          where: { metricId_periodStart: { metricId: demosMetric.id, periodStart } },
          update: {
            actualValue: count,
            actualDisplay: null,
            autoSynced: true,
            status: calculateStatus(count, demosMetric.targetNumeric, demosMetric.targetDirection),
            notes: `HubSpot sync ${new Date().toISOString().split("T")[0]}`,
          },
          create: {
            metricId: demosMetric.id,
            quarterId: quarter.id,
            periodStart,
            periodEnd: new Date(weekMs + 6 * 24 * 60 * 60 * 1000),
            actualValue: count,
            autoSynced: true,
            status: calculateStatus(count, demosMetric.targetNumeric, demosMetric.targetDirection),
            notes: `HubSpot sync ${new Date().toISOString().split("T")[0]}`,
          },
        });
        demosByWeek[periodStart.toISOString().split("T")[0]] = count;
      }
    }

    return NextResponse.json({ success: true, metrics, demosByWeek });
  } catch (error) {
    console.error("HubSpot sync error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
