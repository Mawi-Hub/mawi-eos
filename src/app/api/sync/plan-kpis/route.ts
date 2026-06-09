import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  getMRRMetrics,
  getCustomerChurnRate,
  getMRRChurnRate,
  getASPMetric,
  parseMRREntries,
  parseCustomerChurnEntries,
  parseMRRChurnRateEntries,
  parseASPEntries,
  type MRRBreakdown,
} from "@/lib/integrations/chartmogul";

// Maps Plan KPI slug (and conceptual ChartMogul metric) to the Scorecard
// metric name that holds its actuals. PCT slugs need *100 to match the
// scorecard's integer-percent convention.
const CHARTMOGUL_SCORECARD_METRICS: { slug: string; name: string; isPct: boolean }[] = [
  { slug: "mrr", name: "MRR", isPct: false },
  { slug: "ndr", name: "NDR", isPct: true },
  { slug: "ccr", name: "CCR", isPct: true },
  { slug: "new_biz_mrr", name: "New Biz MRR", isPct: false },
  { slug: "expansion_mrr", name: "Expansion MRR", isPct: false },
  { slug: "asp", name: "ASP (Ticket promedio)", isPct: false },
];

function firstOfMonthUTC(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

function lastOfMonthUTC(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
}

function shiftMonths(d: Date, months: number): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1));
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function periodFromCMDate(cmDate: string): Date {
  return firstOfMonthUTC(new Date(cmDate));
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "ceo") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as { planId?: string };
  if (!body.planId) {
    return NextResponse.json({ error: "planId required" }, { status: 400 });
  }

  const plan = await prisma.plan.findUnique({
    where: { id: body.planId },
    include: { kpis: { include: { entries: true } } },
  });
  if (!plan) {
    return NextResponse.json({ error: "Plan not found" }, { status: 404 });
  }

  // Sync range: the earliest plan entry up to current month. Plan entries are
  // the source of truth for "which months matter for this plan."
  const today = new Date();
  const currentMonth = firstOfMonthUTC(today);
  const allEntryPeriods = plan.kpis
    .flatMap((k) => k.entries.map((e) => firstOfMonthUTC(e.period).getTime()))
    .filter((t) => t <= currentMonth.getTime());

  if (allEntryPeriods.length === 0) {
    return NextResponse.json({
      updated: 0,
      skipped: 0,
      errors: [],
      note: "No past entries to sync (plan starts in the future)",
    });
  }

  const earliest = new Date(Math.min(...allEntryPeriods));
  const fetchStart = shiftMonths(earliest, -1);
  const fetchEnd = shiftMonths(currentMonth, 1);
  const fetchEndLast = new Date(fetchEnd.getTime() - 24 * 60 * 60 * 1000);

  if (fetchStart.getTime() >= fetchEndLast.getTime()) {
    return NextResponse.json({
      updated: 0,
      skipped: 0,
      errors: [],
      note: "Fetch range collapsed; nothing to sync yet",
    });
  }

  // Pull from ChartMogul.
  let mrrBreakdown: MRRBreakdown[] = [];
  const ndrByMonth = new Map<number, number>();
  const aspByMonth = new Map<number, number>();
  const churnByMonth = new Map<number, number>();
  const errors: string[] = [];

  try {
    mrrBreakdown = parseMRREntries(await getMRRMetrics(ymd(fetchStart), ymd(fetchEndLast)));
  } catch (e) {
    errors.push(`mrr: ${(e as Error).message}`);
  }
  try {
    for (const r of parseMRRChurnRateEntries(await getMRRChurnRate(ymd(fetchStart), ymd(fetchEndLast)))) {
      ndrByMonth.set(periodFromCMDate(r.date).getTime(), 1 - r.mrrChurnRate);
    }
  } catch (e) {
    errors.push(`ndr: ${(e as Error).message}`);
  }
  try {
    for (const r of parseASPEntries(await getASPMetric(ymd(fetchStart), ymd(fetchEndLast)))) {
      aspByMonth.set(periodFromCMDate(r.date).getTime(), r.asp);
    }
  } catch (e) {
    errors.push(`asp: ${(e as Error).message}`);
  }
  try {
    for (const r of parseCustomerChurnEntries(await getCustomerChurnRate(ymd(fetchStart), ymd(fetchEndLast)))) {
      churnByMonth.set(periodFromCMDate(r.date).getTime(), r.customerChurnRate);
    }
  } catch (e) {
    errors.push(`ccr: ${(e as Error).message}`);
  }

  const mrrByMonth = new Map<number, MRRBreakdown>();
  for (const m of mrrBreakdown) mrrByMonth.set(periodFromCMDate(m.date).getTime(), m);

  function rawValueFor(slug: string, periodMs: number): number | null {
    const m = mrrByMonth.get(periodMs);
    switch (slug) {
      case "mrr":
        return m?.mrr ?? null;
      case "new_biz_mrr":
        return m?.mrrNewBusiness ?? null;
      case "expansion_mrr":
        return m?.mrrExpansion ?? null;
      case "ndr":
        return ndrByMonth.get(periodMs) ?? null;
      case "ccr":
        return churnByMonth.get(periodMs) ?? null;
      case "asp":
        return aspByMonth.get(periodMs) ?? null;
      default:
        return null;
    }
  }

  // Resolve target Scorecard metrics by name + cache Quarter lookup.
  const metricNames = CHARTMOGUL_SCORECARD_METRICS.map((m) => m.name);
  const scorecardMetrics = await prisma.scorecardMetric.findMany({
    where: { name: { in: metricNames } },
  });
  const metricByName = new Map(scorecardMetrics.map((m) => [m.name, m]));

  const quarters = await prisma.quarter.findMany();
  function findQuarterForDate(d: Date): string | undefined {
    return quarters.find((q) => d >= q.startDate && d <= q.endDate)?.id;
  }

  // Unique set of monthly periods we want to write.
  const monthlyPeriods = Array.from(new Set(allEntryPeriods)).sort();

  let updated = 0;
  let skipped = 0;

  for (const m of CHARTMOGUL_SCORECARD_METRICS) {
    const metric = metricByName.get(m.name);
    if (!metric) {
      errors.push(`missing scorecard metric: ${m.name}`);
      continue;
    }
    for (const periodMs of monthlyPeriods) {
      const periodStart = new Date(periodMs);
      const quarterId = findQuarterForDate(periodStart);
      if (!quarterId) {
        skipped++;
        continue;
      }
      const raw = rawValueFor(m.slug, periodMs);
      if (raw === null || Number.isNaN(raw)) {
        skipped++;
        continue;
      }
      const value = m.isPct ? raw * 100 : raw;
      const periodEnd = lastOfMonthUTC(periodStart);

      await prisma.scorecardEntry.upsert({
        where: { metricId_periodStart: { metricId: metric.id, periodStart } },
        update: {
          actualValue: value,
          actualDisplay: null,
          autoSynced: true,
          status: "on_track",
          notes: `ChartMogul sync ${ymd(today)}`,
        },
        create: {
          metricId: metric.id,
          quarterId,
          periodStart,
          periodEnd,
          actualValue: value,
          autoSynced: true,
          status: "on_track",
          notes: `ChartMogul sync ${ymd(today)}`,
        },
      });
      updated++;
    }
  }

  await prisma.apiSyncCache.upsert({
    where: { source_dataKey: { source: "chartmogul", dataKey: `plan:${plan.id}` } },
    update: {
      data: { updated, skipped, errors, ranAt: today.toISOString() },
      syncedAt: today,
    },
    create: {
      source: "chartmogul",
      dataKey: `plan:${plan.id}`,
      data: { updated, skipped, errors, ranAt: today.toISOString() },
      syncedAt: today,
    },
  });

  return NextResponse.json({ updated, skipped, errors });
}
