// Dispara el KPI check-in por DM a mano.
//   npx tsx --env-file=.env.local scripts/send-kpi-checkin.ts --only sergio@mawi.io --preview
//   npx tsx --env-file=.env.local scripts/send-kpi-checkin.ts            (a todos, real)
import "dotenv/config";

import { startKpiCheckins } from "@/lib/integrations/kpiCheckin";
import { prisma } from "@/lib/db";

async function main() {
  const args = process.argv.slice(2);
  const onlyIdx = args.indexOf("--only");
  const options = {
    preview: args.includes("--preview"),
    dryRun: args.includes("--dry-run"),
    onlyEmail: onlyIdx >= 0 ? args[onlyIdx + 1] : undefined,
  };

  console.log("Opciones:", options);
  const result = await startKpiCheckins(options);
  console.log("Enviado a:", result.sent.length ? result.sent.join(", ") : "(nadie)");
  for (const s of result.skipped) console.log(`Saltado: ${s.name} — ${s.reason}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
