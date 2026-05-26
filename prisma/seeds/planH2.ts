import "dotenv/config";
import { prisma } from "../../src/lib/db";

type KPISeed = {
  name: string;
  slug: string;
  category: "REVENUE" | "RETENTION" | "GROWTH" | "EFFICIENCY";
  baseline: number;
  target: number;
  unit: "USD" | "PCT" | "count";
  direction: "ABOVE" | "BELOW";
  displayOrder: number;
  sourceType: "MANUAL" | "CHARTMOGUL" | "HUBSPOT" | "POSTHOG";
  sourceKey: string | null;
  ownerRole: "ceo" | "sales" | "cs" | "product" | "engineering";
  entries: { period: string; projected: number }[];
};

const PLAN: {
  name: string;
  type: "ANNUAL" | "SEMESTRAL";
  startDate: string;
  endDate: string;
  status: "DRAFT" | "ACTIVE" | "CLOSED";
} = {
  name: "H2 2026",
  type: "SEMESTRAL",
  startDate: "2026-07-01",
  endDate: "2026-12-31",
  status: "ACTIVE",
};

const KPIS: KPISeed[] = [
  {
    name: "MRR",
    slug: "mrr",
    category: "REVENUE",
    baseline: 61144,
    target: 121000,
    unit: "USD",
    direction: "ABOVE",
    displayOrder: 1,
    sourceType: "CHARTMOGUL",
    sourceKey: "mrr",
    ownerRole: "ceo",
    entries: [
      { period: "2026-05-01", projected: 61144 },
      { period: "2026-06-01", projected: 61144 },
      { period: "2026-07-01", projected: 69972 },
      { period: "2026-08-01", projected: 74130 },
      { period: "2026-09-01", projected: 82640 },
      { period: "2026-10-01", projected: 88868 },
      { period: "2026-11-01", projected: 100082 },
      { period: "2026-12-01", projected: 108451 },
    ],
  },
  {
    name: "NDR",
    slug: "ndr",
    category: "RETENTION",
    baseline: 0.9349,
    target: 0.985,
    unit: "PCT",
    direction: "ABOVE",
    displayOrder: 2,
    sourceType: "CHARTMOGUL",
    sourceKey: "ndr",
    ownerRole: "ceo",
    entries: [
      { period: "2026-05-01", projected: 0.9349 },
      { period: "2026-06-01", projected: 0.9349 },
      { period: "2026-07-01", projected: 0.9421 },
      { period: "2026-08-01", projected: 0.9453 },
      { period: "2026-09-01", projected: 0.9554 },
      { period: "2026-10-01", projected: 0.9587 },
      { period: "2026-11-01", projected: 0.9679 },
      { period: "2026-12-01", projected: 0.9707 },
    ],
  },
  {
    name: "CCR",
    slug: "ccr",
    category: "RETENTION",
    baseline: 0.0689,
    target: 0.027,
    unit: "PCT",
    direction: "BELOW",
    displayOrder: 3,
    sourceType: "CHARTMOGUL",
    sourceKey: "ccr",
    ownerRole: "cs",
    entries: [
      { period: "2026-05-01", projected: 0.0689 },
      { period: "2026-06-01", projected: 0.0689 },
      { period: "2026-07-01", projected: 0.06325 },
      { period: "2026-08-01", projected: 0.0576 },
      { period: "2026-09-01", projected: 0.05195 },
      { period: "2026-10-01", projected: 0.0463 },
      { period: "2026-11-01", projected: 0.04065 },
      { period: "2026-12-01", projected: 0.035 },
    ],
  },
  {
    name: "New Biz MRR",
    slug: "new_biz_mrr",
    category: "GROWTH",
    baseline: 6328,
    target: 13560,
    unit: "USD",
    direction: "ABOVE",
    displayOrder: 4,
    sourceType: "CHARTMOGUL",
    sourceKey: "new_biz_mrr",
    ownerRole: "sales",
    entries: [
      { period: "2026-05-01", projected: 6328 },
      { period: "2026-06-01", projected: 6328 },
      { period: "2026-07-01", projected: 7157 },
      { period: "2026-08-01", projected: 7985 },
      { period: "2026-09-01", projected: 8814 },
      { period: "2026-10-01", projected: 9643 },
      { period: "2026-11-01", projected: 10471 },
      { period: "2026-12-01", projected: 11300 },
    ],
  },
  {
    name: "Expansion MRR",
    slug: "expansion_mrr",
    category: "GROWTH",
    baseline: 234,
    target: 1200,
    unit: "USD",
    direction: "ABOVE",
    displayOrder: 5,
    sourceType: "CHARTMOGUL",
    sourceKey: "expansion_mrr",
    ownerRole: "cs",
    entries: [
      { period: "2026-05-01", projected: 234 },
      { period: "2026-06-01", projected: 234 },
      { period: "2026-07-01", projected: 338 },
      { period: "2026-08-01", projected: 443 },
      { period: "2026-09-01", projected: 547 },
      { period: "2026-10-01", projected: 651 },
      { period: "2026-11-01", projected: 756 },
      { period: "2026-12-01", projected: 860 },
    ],
  },
  {
    name: "ASP",
    slug: "asp",
    category: "GROWTH",
    baseline: 452,
    target: 452,
    unit: "USD",
    direction: "ABOVE",
    displayOrder: 6,
    sourceType: "CHARTMOGUL",
    sourceKey: "asp",
    ownerRole: "sales",
    entries: [
      { period: "2026-05-01", projected: 452 },
      { period: "2026-06-01", projected: 452 },
      { period: "2026-07-01", projected: 452 },
      { period: "2026-08-01", projected: 452 },
      { period: "2026-09-01", projected: 452 },
      { period: "2026-10-01", projected: 452 },
      { period: "2026-11-01", projected: 452 },
      { period: "2026-12-01", projected: 452 },
    ],
  },
];

export async function seedPlanH2() {
  const plan = await prisma.plan.upsert({
    where: { name: PLAN.name },
    update: {
      type: PLAN.type,
      startDate: new Date(PLAN.startDate),
      endDate: new Date(PLAN.endDate),
      status: PLAN.status,
    },
    create: {
      name: PLAN.name,
      type: PLAN.type,
      startDate: new Date(PLAN.startDate),
      endDate: new Date(PLAN.endDate),
      status: PLAN.status,
    },
  });

  await prisma.quarter.updateMany({
    where: {
      planId: null,
      OR: [
        { year: 2026, quarter: 3 },
        { year: 2026, quarter: 4 },
      ],
    },
    data: { planId: plan.id },
  });

  for (const kpi of KPIS) {
    const owner = await prisma.user.findFirst({ where: { role: kpi.ownerRole } });
    if (!owner) {
      console.warn(`[seed:planH2] No user found with role=${kpi.ownerRole}; skipping ${kpi.slug}`);
      continue;
    }

    const created = await prisma.planKPI.upsert({
      where: { planId_slug: { planId: plan.id, slug: kpi.slug } },
      update: {
        name: kpi.name,
        category: kpi.category,
        baseline: kpi.baseline,
        target: kpi.target,
        unit: kpi.unit,
        direction: kpi.direction,
        ownerId: owner.id,
        sourceType: kpi.sourceType,
        sourceKey: kpi.sourceKey,
        displayOrder: kpi.displayOrder,
      },
      create: {
        planId: plan.id,
        name: kpi.name,
        slug: kpi.slug,
        category: kpi.category,
        baseline: kpi.baseline,
        target: kpi.target,
        unit: kpi.unit,
        direction: kpi.direction,
        ownerId: owner.id,
        sourceType: kpi.sourceType,
        sourceKey: kpi.sourceKey,
        displayOrder: kpi.displayOrder,
      },
    });

    for (const entry of kpi.entries) {
      await prisma.planKPIEntry.upsert({
        where: { kpiId_period: { kpiId: created.id, period: new Date(entry.period) } },
        update: { projected: entry.projected },
        create: {
          kpiId: created.id,
          period: new Date(entry.period),
          projected: entry.projected,
        },
      });
    }
  }

  console.log(`[seed:planH2] Plan "${plan.name}" seeded with ${KPIS.length} KPIs.`);
  return plan;
}

const isDirectRun =
  typeof process !== "undefined" &&
  process.argv[1] &&
  process.argv[1].endsWith("planH2.ts");

if (isDirectRun) {
  seedPlanH2()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
