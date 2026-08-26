// Dry-run del arranque del KPI check-in: agrupa métricas manuales por dueño y
// resuelve sus usuarios de Slack por email, sin abrir DMs ni crear sesiones.
// Ejecutar con: npx tsx --env-file=.env.local scripts/test-kpi-checkin.ts
import "dotenv/config";

import { startKpiCheckins } from "@/lib/integrations/kpiCheckin";
import { prisma } from "@/lib/db";

async function main() {
  const result = await startKpiCheckins({ dryRun: true });
  console.log("Enviaría DM a:", result.sent.length ? result.sent.join(", ") : "(nadie)");
  for (const s of result.skipped) console.log(`Saltado: ${s.name} — ${s.reason}`);

  const active = await prisma.scorecardMetric.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
    select: { name: true, dataSource: true },
  });
  console.log(`\nMétricas activas en el tablero (${active.length}):`);
  for (const m of active) console.log(`  • ${m.name} [${m.dataSource}]`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
