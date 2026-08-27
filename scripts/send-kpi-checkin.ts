// Dispara el KPI check-in por DM a mano.
//   npx tsx --env-file=.env.local scripts/send-kpi-checkin.ts --only sergio@mawi.io --preview --reset
//   npx tsx --env-file=.env.local scripts/send-kpi-checkin.ts            (a todos, real)
//
// --reset borra la sesión de esta semana antes de arrancar (hay una por
// persona por semana, así que sin esto una segunda corrida se saltaría).
import "dotenv/config";

import { startKpiCheckins } from "@/lib/integrations/kpiCheckin";
import { prisma } from "@/lib/db";

function mondayOfWeek(now: Date): Date {
  const d = new Date(now);
  const day = d.getDay();
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  d.setHours(0, 0, 0, 0);
  return d;
}

async function main() {
  const args = process.argv.slice(2);
  const onlyIdx = args.indexOf("--only");
  const options = {
    preview: args.includes("--preview"),
    dryRun: args.includes("--dry-run"),
    onlyEmail: onlyIdx >= 0 ? args[onlyIdx + 1] : undefined,
  };

  if (args.includes("--reset")) {
    const { count } = await prisma.kpiCheckinSession.deleteMany({
      where: {
        weekStart: mondayOfWeek(new Date()),
        ...(options.onlyEmail ? { user: { email: options.onlyEmail } } : {}),
      },
    });
    console.log(`Sesiones borradas: ${count}`);
  }

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
