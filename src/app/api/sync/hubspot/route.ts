import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  searchDeals,
  searchContacts,
  searchDemoMeetings,
  searchDemoMeetingsInPeriod,
  calculatePipelineMetrics,
  PIPELINE_FORMULA_VERSION,
} from "@/lib/integrations/hubspot";
import { calculateStatus } from "@/lib/utils";
import { crMonthStart } from "@/lib/time/costaRica";

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
    // Mes a la fecha en hora Costa Rica. Los cierres se cuentan por fecha de
    // cierre (no de creación) y las citas por fecha de la cita; todo paginado.
    const now = new Date();
    const periodStart = crMonthStart(now);
    const period = { start: periodStart.toISOString(), end: now.toISOString() };
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

    const [wonDealsResult, contactsResult, demoMeetingsInPeriod] = await Promise.all([
      searchDeals([
        { propertyName: "dealstage", operator: "EQ", value: "closedwon" },
        { propertyName: "closedate", operator: "GTE", value: period.start },
        { propertyName: "closedate", operator: "LTE", value: period.end },
      ]),
      searchContacts([
        { propertyName: "createdate", operator: "GTE", value: thirtyDaysAgo },
        { propertyName: "lifecyclestage", operator: "EQ", value: "marketingqualifiedlead" },
      ]),
      searchDemoMeetingsInPeriod(period.start, period.end),
    ]);

    const wonDeals = wonDealsResult.results.map((d) => d.properties);
    const leads = contactsResult.results.map((c) => c.properties);

    const metrics = calculatePipelineMetrics({
      leads,
      wonDealsInPeriod: wonDeals,
      demoMeetings: demoMeetingsInPeriod,
      period,
    });

    await prisma.apiSyncCache.upsert({
      where: { source_dataKey: { source: "hubspot", dataKey: "pipeline_metrics" } },
      update: { data: metrics as object, syncedAt: new Date() },
      create: { source: "hubspot", dataKey: "pipeline_metrics", data: metrics as object, syncedAt: new Date() },
    });

    // Show rate y % de cierre → ScorecardEntry mensual SOLO con la bandera
    // HUBSPOT_WRITE_RATE_ENTRIES=1 (las definiciones siguen pendientes de
    // validar con Ventas). Sin meta confirmada el estado queda "pending";
    // denominador 0 se guarda como "sin muestra", nunca como 0%.
    if (process.env.HUBSPOT_WRITE_RATE_ENTRIES === "1") {
      const quarters = await prisma.quarter.findMany();
      const quarter = quarters.find((q) => periodStart >= q.startDate && periodStart <= q.endDate);
      const targets: Array<{ name: string; value: number | null; detail: { numerator: number; denominator: number } }> = [
        { name: "Show Rate", value: metrics.showRate, detail: metrics.showRateDetail },
        { name: "Close Rate", value: metrics.closeRate, detail: metrics.closeRateDetail },
      ];
      for (const t of targets) {
        const metric = await prisma.scorecardMetric.findFirst({ where: { name: t.name, dataSource: "hubspot" } });
        if (!metric || !quarter) continue;
        const data = {
          actualValue: t.value,
          actualDisplay: null,
          numerator: t.detail.numerator,
          denominator: t.detail.denominator,
          dataState: t.value === null ? "no_sample" : t.value === 0 ? "confirmed_zero" : null,
          formulaVersion: PIPELINE_FORMULA_VERSION,
          provenance: "HubSpot sync (definición pendiente de validar)",
          expectedValue: null,
          autoSynced: true,
          status: "pending",
          notes: `HubSpot sync ${now.toISOString().split("T")[0]}`,
        };
        await prisma.scorecardEntry.upsert({
          where: { metricId_periodStart: { metricId: metric.id, periodStart } },
          update: data,
          create: {
            ...data,
            metricId: metric.id,
            quarterId: quarter.id,
            periodStart,
            periodEnd: new Date(crMonthStart(new Date(periodStart.getTime() + 32 * 86_400_000)).getTime() - 1),
          },
        });
      }
    }

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
            expectedValue: demosMetric.targetNumeric,
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
            expectedValue: demosMetric.targetNumeric,
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
