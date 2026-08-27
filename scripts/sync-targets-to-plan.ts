// Pone la meta de las métricas de ChartMogul en el valor que el plan pide para
// el mes en curso (la rampa), en vez de la meta de cierre de semestre.
// Idempotente. El sync de /api/sync/plan-kpis hace lo mismo en cada corrida.
//   npx tsx --env-file=.env.local scripts/sync-targets-to-plan.ts [--apply]
import "dotenv/config";
import { prisma } from "@/lib/db";
import { formatTargetLabel } from "@/lib/utils";
import { CHARTMOGUL_SCORECARD_METRICS } from "../prisma/seeds/planH2";

function firstOfMonthUTC(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

async function main() {
  const apply = process.argv.includes("--apply");
  const plan = await prisma.plan.findFirst({ where: { status: "ACTIVE" } });
  if (!plan) throw new Error("sin plan activo");

  const currentMonth = firstOfMonthUTC(new Date());
  console.log(`Mes en curso: ${currentMonth.toISOString().slice(0, 7)}\n`);

  const kpis = await prisma.planKPI.findMany({
    where: { planId: plan.id },
    include: { entries: true },
  });

  for (const m of CHARTMOGUL_SCORECARD_METRICS) {
    const kpi = kpis.find((k) => k.slug === m.slug);
    const entry = kpi?.entries.find(
      (e) => firstOfMonthUTC(e.period).getTime() === currentMonth.getTime(),
    );
    const metric = await prisma.scorecardMetric.findFirst({ where: { name: m.name } });
    if (!metric || !entry) continue;

    const projected = m.isPct ? entry.projected * 100 : entry.projected;
    const label = formatTargetLabel(projected, metric.unit, metric.targetDirection);
    console.log(`  ${m.name.padEnd(24)} ${String(metric.targetValue).padEnd(12)} → ${label}`);

    if (apply) {
      await prisma.scorecardMetric.update({
        where: { id: metric.id },
        data: { targetNumeric: projected, targetValue: label },
      });
    }
  }
  if (!apply) console.log("\n(dry-run — corré con --apply)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
