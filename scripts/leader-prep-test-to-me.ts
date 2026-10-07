// Prueba del check-in de líderes (v2) SOLO a sergio@mawi.io, con la base LOCAL
// de demo. Se niega a correr si la base no es localhost. Asigna temporalmente a
// Sergio como líder de Ventas en esa base, arranca la sesión real (onlyEmail)
// y restaura el líder original.
//   DATABASE_URL=<local> LEADER_CHECKIN_V2=1 node --env-file=.env.local node_modules/.bin/tsx scripts/leader-prep-test-to-me.ts
const host = (() => { try { return new URL(process.env.DATABASE_URL ?? "").hostname; } catch { return ""; } })();
if (!["localhost", "127.0.0.1", "::1"].includes(host)) { console.error("Solo contra una base en localhost."); process.exit(1); }

import { prisma } from "../src/lib/db";
import { startKpiCheckins } from "../src/lib/integrations/kpiCheckin";

const OWNER = "sergio@mawi.io";

async function main() {
  const sergio = await prisma.user.findUniqueOrThrow({ where: { email: OWNER } });
  const area = await prisma.reportArea.findUniqueOrThrow({ where: { key: "ventas" } });
  const original = area.leaderId;
  await prisma.kpiCheckinSession.deleteMany({ where: { userId: sergio.id } });
  await prisma.reportArea.update({ where: { id: area.id }, data: { leaderId: sergio.id } });
  try {
    const res = await startKpiCheckins({ onlyEmail: OWNER });
    console.log("enviados:", res.sent, "| saltados:", res.skipped, "| legacy:", res.legacyFallback ?? []);
  } finally {
    await prisma.reportArea.update({ where: { id: area.id }, data: { leaderId: original } });
  }
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
