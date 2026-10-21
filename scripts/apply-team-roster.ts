// Carga el roster del check-in semanal (config/team-roster.json): áreas de
// reporte que falten y personas (Slack ID, área y equipo de preguntas). Por
// defecto SIMULA; con --apply escribe. Un área existente no se modifica (ni su
// líder); no toca roles ni la selección del trimestre. Quien no está en el
// archivo no se borra.
//
//   npx tsx scripts/apply-team-roster.ts config/team-roster.json
//   npx tsx scripts/apply-team-roster.ts config/team-roster.json --apply
import "dotenv/config";
import { readFileSync } from "node:fs";
import { prisma } from "../src/lib/db";
import { isTeamKey } from "../src/lib/checkin/teams";

type Area = { key: string; name: string; leaderEmail?: string | null; sortOrder?: number };
type Member = { displayName: string; slackUserId: string; email?: string; areaKey: string; teamKey: string; isLeader?: boolean };

async function main() {
  const file = process.argv[2];
  if (!file || file.startsWith("--")) throw new Error("Uso: apply-team-roster.ts <archivo.json> [--apply]");
  const apply = process.argv.includes("--apply");
  const { areas: areaConfig = [], members } = JSON.parse(readFileSync(file, "utf8")) as { areas?: Area[]; members: Member[] };
  const host = (() => { try { return new URL(process.env.DATABASE_URL ?? "").host; } catch { return "(desconocido)"; } })();
  console.log(`Base: ${host} · modo: ${apply ? "ESCRIBIR" : "simulación"}\n`);

  const areas = new Map<string, { id: string }>((await prisma.reportArea.findMany()).map((a) => [a.key, a]));
  for (const a of areaConfig) {
    if (areas.has(a.key)) continue;
    const leader = a.leaderEmail ? await prisma.user.findUnique({ where: { email: a.leaderEmail }, select: { id: true } }) : null;
    if (a.leaderEmail && !leader) console.log(`  ⚠ área ${a.key}: no hay usuario del app con ${a.leaderEmail} (queda sin líder)`);
    console.log(`  • crear área ${a.key} (${a.name}) · líder ${a.leaderEmail ?? "sin asignar"}`);
    const data = { key: a.key, name: a.name, sortOrder: a.sortOrder ?? 0, leaderId: leader?.id ?? null };
    // En simulación se finge el área para validar las personas que dependen de ella.
    areas.set(a.key, apply ? await prisma.reportArea.create({ data }) : { id: `dry:${a.key}` });
  }
  const seen = new Set<string>();
  let problems = 0;
  for (const m of members) {
    const area = areas.get(m.areaKey);
    const issues = [
      !area && `área ${m.areaKey} no existe`,
      !isTeamKey(m.teamKey) && `equipo ${m.teamKey} no existe`,
      !/^[UW][A-Z0-9]{6,}$/.test(m.slackUserId) && "Slack ID inválido",
      seen.has(m.slackUserId) && "Slack ID repetido",
    ].filter(Boolean);
    seen.add(m.slackUserId);
    if (issues.length) {
      problems += 1;
      console.log(`  ⚠ ${m.displayName}: ${issues.join(", ")}`);
      continue;
    }
    const user = m.email ? await prisma.user.findUnique({ where: { email: m.email }, select: { id: true } }) : null;
    if (m.email && !user) console.log(`  ⚠ ${m.displayName}: no hay usuario del app con ${m.email} (queda sin vincular)`);
    const existing = await prisma.reportMember.findFirst({ where: { slackUserId: m.slackUserId, validTo: null }, orderBy: { validFrom: "desc" } });
    console.log(`  • ${existing ? "actualizar" : "crear"} ${m.displayName} → ${m.areaKey} · ${m.teamKey}`);
    if (!apply) continue;
    const data = {
      areaId: area!.id,
      userId: user?.id ?? existing?.userId ?? null,
      displayName: m.displayName,
      slackUserId: m.slackUserId,
      identityVerified: true,
      isLeader: m.isLeader === true,
      teamKey: m.teamKey,
    };
    if (existing) await prisma.reportMember.update({ where: { id: existing.id }, data });
    else await prisma.reportMember.create({ data });
  }
  if (problems) process.exitCode = 1;
  if (!apply) console.log("\nSimulación: no se escribió nada. Agregá --apply para aplicar.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
