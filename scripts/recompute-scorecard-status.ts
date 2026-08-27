// Recalcula el semáforo de las entradas sincronizadas desde ChartMogul contra
// la proyección del mes del plan, en vez del "on_track" fijo que se escribía
// antes. Idempotente: se puede correr las veces que sea.
//   npx tsx --env-file=.env.local scripts/recompute-scorecard-status.ts [--apply]
import "dotenv/config";
import { prisma } from "@/lib/db";
import { calculateStatus } from "@/lib/utils";
import { CHARTMOGUL_SCORECARD_METRICS } from "../prisma/seeds/planH2";

function firstOfMonthUTC(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

async function main() {
  const apply = process.argv.includes("--apply");
  const plan = await prisma.plan.findFirst({ where: { status: "ACTIVE" } });
  if (!plan) throw new Error("sin plan activo");

  const kpis = await prisma.planKPI.findMany({
    where: { planId: plan.id },
    include: { entries: true },
  });
  const projectedBySlug = new Map<string, Map<number, number>>();
  for (const k of kpis) {
    const byPeriod = new Map<number, number>();
    for (const e of k.entries) byPeriod.set(firstOfMonthUTC(e.period).getTime(), e.projected);
    projectedBySlug.set(k.slug, byPeriod);
  }

  let changed = 0;
  for (const m of CHARTMOGUL_SCORECARD_METRICS) {
    const metric = await prisma.scorecardMetric.findFirst({
      where: { name: m.name },
      include: { entries: { orderBy: { periodStart: "asc" } } },
    });
    if (!metric) continue;

    for (const entry of metric.entries) {
      if (entry.actualValue === null) continue;
      const periodMs = firstOfMonthUTC(entry.periodStart).getTime();
      const projectedRaw = projectedBySlug.get(m.slug)?.get(periodMs);
      const projected =
        projectedRaw === undefined ? null : m.isPct ? projectedRaw * 100 : projectedRaw;
      const status = calculateStatus(
        entry.actualValue,
        projected ?? metric.targetNumeric,
        metric.targetDirection,
      );
      const expected = projected ?? metric.targetNumeric;
      if (status === entry.status && entry.expectedValue === expected) continue;

      console.log(
        `  ${m.name.padEnd(22)} ${entry.periodStart.toISOString().slice(0, 7)}  ` +
          `actual=${entry.actualValue}  esperado=${expected ?? "—"}  ${entry.status} → ${status}`,
      );
      changed++;
      if (apply) {
        await prisma.scorecardEntry.update({
          where: { id: entry.id },
          data: {
            status,
            expectedValue: expected,
            notes: projected !== null ? `Recalculado vs plan del mes ${projected}` : entry.notes,
          },
        });
      }
    }
  }
  console.log(`\n${changed} entradas ${apply ? "actualizadas" : "cambiarían"}${apply ? "" : " (corré con --apply)"}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
