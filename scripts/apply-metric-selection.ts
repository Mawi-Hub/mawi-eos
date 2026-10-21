// Carga las métricas del trimestre por área (QuarterMetricSelection) desde un
// JSON, p. ej. config/q4-2026-metrics.json. Por defecto SIMULA; con --apply
// escribe. Solo toca la selección del trimestre (y, si se pide con setMetric,
// la fuente de una métrica existente); nunca borra selecciones ni datos.
// Una selección ya aprobada no se pisa salvo con --force.
//
//   npx tsx scripts/apply-metric-selection.ts config/q4-2026-metrics.json
//   npx tsx scripts/apply-metric-selection.ts config/q4-2026-metrics.json --apply
import "dotenv/config";
import { readFileSync } from "node:fs";
import { prisma } from "../src/lib/db";

type Selection = {
  areaKey: string;
  order?: number;
  label: string;
  metric?: string; // nombre exacto de una ScorecardMetric existente
  proposal?: string; // clave de una métrica sin fuente todavía
  setMetric?: { dataSource?: "manual" | "hubspot" | "chartmogul" | "posthog" };
  definition: Record<string, unknown>;
};

async function main() {
  const file = process.argv[2];
  if (!file || file.startsWith("--")) throw new Error("Uso: apply-metric-selection.ts <archivo.json> [--apply] [--force]");
  const apply = process.argv.includes("--apply");
  const force = process.argv.includes("--force");
  const config = JSON.parse(readFileSync(file, "utf8")) as { quarter: { year: number; quarter: number }; plan: string; selections: Selection[] };
  const host = (() => { try { return new URL(process.env.DATABASE_URL ?? "").host; } catch { return "(desconocido)"; } })();
  console.log(`Base: ${host} · modo: ${apply ? "ESCRIBIR" : "simulación"}${force ? " · force" : ""}\n`);

  const [quarter, plan] = await Promise.all([
    prisma.quarter.findUnique({ where: { year_quarter: { year: config.quarter.year, quarter: config.quarter.quarter } } }),
    prisma.plan.findUnique({ where: { name: config.plan } }),
  ]);
  if (!quarter) throw new Error(`No existe Q${config.quarter.quarter} ${config.quarter.year}`);
  if (!plan) throw new Error(`No existe el plan "${config.plan}"`);
  if (apply && quarter.planId !== plan.id) await prisma.quarter.update({ where: { id: quarter.id }, data: { planId: plan.id } });

  const areas = new Map((await prisma.reportArea.findMany({ select: { id: true, key: true, leaderId: true } })).map((a) => [a.key, a]));
  const usedMetrics = new Set<string>();
  let problems = 0;

  for (const s of config.selections) {
    const area = areas.get(s.areaKey);
    if (!area) {
      problems += 1;
      console.log(`  ⚠ ${s.label}: el área ${s.areaKey} no existe (corré antes scripts/apply-team-roster.ts)`);
      continue;
    }
    if (!!s.metric === !!s.proposal) {
      problems += 1;
      console.log(`  ⚠ ${s.label}: tiene que tener "metric" o "proposal", no ambos ni ninguno`);
      continue;
    }

    let metricId: string | null = null;
    if (s.metric) {
      const found = await prisma.scorecardMetric.findMany({ where: { name: s.metric }, select: { id: true, dataSource: true } });
      if (found.length !== 1) {
        problems += 1;
        console.log(`  ⚠ ${s.label}: la métrica "${s.metric}" ${found.length ? "es ambigua" : "no existe"}`);
        continue;
      }
      metricId = found[0].id;
      if (usedMetrics.has(metricId)) {
        problems += 1;
        console.log(`  ⚠ ${s.label}: "${s.metric}" ya está seleccionada en otra área`);
        continue;
      }
      usedMetrics.add(metricId);
      if (s.setMetric?.dataSource && s.setMetric.dataSource !== found[0].dataSource) {
        console.log(`    · fuente de "${s.metric}": ${found[0].dataSource} → ${s.setMetric.dataSource}`);
        if (apply) await prisma.scorecardMetric.update({ where: { id: metricId }, data: { dataSource: s.setMetric.dataSource } });
      }
    }

    const approved = !!metricId;
    const existing = await prisma.quarterMetricSelection.findFirst({
      where: { quarterId: quarter.id, ...(metricId ? { scorecardMetricId: metricId } : { proposalKey: s.proposal }) },
    });
    const keep = existing?.approvalStatus === "approved" && !force;
    console.log(`  • ${existing ? (keep ? "conservar (ya aprobada)" : "actualizar") : "crear"} ${s.areaKey} · ${s.label} [${approved ? "aprobada" : "pendiente de configurar"}]`);
    if (!apply || keep) continue;

    const data = {
      planId: plan.id,
      quarterId: quarter.id,
      areaId: area.id,
      scorecardMetricId: metricId,
      proposalKey: metricId ? null : s.proposal!,
      displayLabel: s.label,
      sortOrder: s.order ?? 0,
      approvalStatus: approved ? "approved" : "pending",
      reportOwnerId: area.leaderId,
      definition: { label: s.label, ...s.definition },
    };
    if (existing) await prisma.quarterMetricSelection.update({ where: { id: existing.id }, data });
    else await prisma.quarterMetricSelection.create({ data });
  }
  if (problems) process.exitCode = 1;
  if (!apply) console.log("\nSimulación: no se escribió nada. Agregá --apply para aplicar.");
}

main()
  .catch((e) => {
    console.error(String(e instanceof Error ? e.message : e));
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
