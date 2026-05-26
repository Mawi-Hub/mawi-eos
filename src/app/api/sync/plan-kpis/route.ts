import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  getMRRMetrics,
  getARPA,
  getCustomerChurnRate,
  parseMRREntries,
  parseARPAEntries,
  parseCustomerChurnEntries,
  computeMonthlyNDR,
  type MRRBreakdown,
} from "@/lib/integrations/chartmogul";

type SourceKey =
  | "mrr"
  | "ndr"
  | "ccr"
  | "new_biz_mrr"
  | "expansion_mrr"
  | "asp";

function firstOfMonthUTC(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
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

  const body = (await request.json().catch(() => ({}))) as {
    planId?: string;
    overwrite?: boolean;
  };
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

  const cmKpis = plan.kpis.filter((k) => k.sourceType === "CHARTMOGUL");
  if (cmKpis.length === 0) {
    return NextResponse.json({ updated: 0, skipped: 0, note: "No ChartMogul KPIs" });
  }

  const today = new Date();
  const currentMonth = firstOfMonthUTC(today);
  const planStart = firstOfMonthUTC(plan.startDate);
  const planEnd = firstOfMonthUTC(plan.endDate);
  const upTo = currentMonth.getTime() < planEnd.getTime() ? currentMonth : planEnd;

  const fetchStart = shiftMonths(planStart, -1);
  const fetchEnd = shiftMonths(upTo, 1);
  const fetchEndLast = new Date(fetchEnd.getTime() - 24 * 60 * 60 * 1000);

  let mrr: MRRBreakdown[] = [];
  let ndrByMonth = new Map<number, number>();
  let arpaByMonth = new Map<number, number>();
  let churnByMonth = new Map<number, number>();
  const errors: string[] = [];

  try {
    const raw = await getMRRMetrics(ymd(fetchStart), ymd(fetchEndLast));
    mrr = parseMRREntries(raw);
    for (const r of computeMonthlyNDR(mrr)) {
      if (r.ndr !== null) ndrByMonth.set(periodFromCMDate(r.date).getTime(), r.ndr);
    }
  } catch (e) {
    errors.push(`mrr: ${(e as Error).message}`);
  }

  try {
    const raw = await getARPA(ymd(fetchStart), ymd(fetchEndLast));
    for (const r of parseARPAEntries(raw)) {
      arpaByMonth.set(periodFromCMDate(r.date).getTime(), r.arpa);
    }
  } catch (e) {
    errors.push(`arpa: ${(e as Error).message}`);
  }

  try {
    const raw = await getCustomerChurnRate(ymd(fetchStart), ymd(fetchEndLast));
    for (const r of parseCustomerChurnEntries(raw)) {
      churnByMonth.set(periodFromCMDate(r.date).getTime(), r.customerChurnRate);
    }
  } catch (e) {
    errors.push(`ccr: ${(e as Error).message}`);
  }

  const mrrByMonth = new Map<number, MRRBreakdown>();
  for (const m of mrr) mrrByMonth.set(periodFromCMDate(m.date).getTime(), m);

  function valueFor(sourceKey: string | null, periodMs: number): number | null {
    if (!sourceKey) return null;
    const m = mrrByMonth.get(periodMs);
    switch (sourceKey as SourceKey) {
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
        return arpaByMonth.get(periodMs) ?? null;
      default:
        return null;
    }
  }

  let updated = 0;
  let skipped = 0;

  for (const kpi of cmKpis) {
    for (const entry of kpi.entries) {
      const periodMs = firstOfMonthUTC(entry.period).getTime();
      if (periodMs > upTo.getTime()) continue;
      if (entry.actual !== null && !body.overwrite) {
        skipped++;
        continue;
      }
      const value = valueFor(kpi.sourceKey, periodMs);
      if (value === null) {
        skipped++;
        continue;
      }
      await prisma.planKPIEntry.update({
        where: { id: entry.id },
        data: {
          actual: value,
          note: `ChartMogul sync ${ymd(today)}`,
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
