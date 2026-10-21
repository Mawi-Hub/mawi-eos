// Carga los Rocks de un trimestre desde un JSON (p. ej. config/q4-2026-rocks.json)
// y marca el Rock principal de cada área (AreaQuarterConfig). Por defecto
// SIMULA; con --apply escribe. Idempotente por trimestre + dueño + título: un
// Rock que ya existe no se duplica ni se pisa su estado o avance. No activa el
// trimestre (eso se hace en EOS → Trimestres) ni borra nada.
//
//   npx tsx scripts/apply-rocks.ts config/q4-2026-rocks.json
//   npx tsx scripts/apply-rocks.ts config/q4-2026-rocks.json --apply
import "dotenv/config";
import { readFileSync } from "node:fs";
import { prisma } from "../src/lib/db";

type RockConfig = {
  areaKey: string;
  ownerEmail: string;
  principal?: boolean;
  title: string;
  description: string;
  deliverable: string;
  doneCriteria: string;
};

async function main() {
  const file = process.argv[2];
  if (!file || file.startsWith("--")) throw new Error("Uso: apply-rocks.ts <archivo.json> [--apply]");
  const apply = process.argv.includes("--apply");
  const config = JSON.parse(readFileSync(file, "utf8")) as { quarter: { year: number; quarter: number }; rocks: RockConfig[] };
  const host = (() => { try { return new URL(process.env.DATABASE_URL ?? "").host; } catch { return "(desconocido)"; } })();
  console.log(`Base: ${host} · modo: ${apply ? "ESCRIBIR" : "simulación"}\n`);

  const quarter = await prisma.quarter.findUnique({ where: { year_quarter: { year: config.quarter.year, quarter: config.quarter.quarter } } });
  if (!quarter) throw new Error(`No existe Q${config.quarter.quarter} ${config.quarter.year}. Crealo desde EOS → Trimestres.`);
  if (!quarter.isActive) console.log(`  ℹ Q${quarter.quarter} ${quarter.year} todavía no está activo: activalo en EOS → Trimestres (cerrar el trimestre anterior).\n`);

  const principals = config.rocks.filter((r) => r.principal);
  const dupAreas = principals.map((r) => r.areaKey).filter((k, i, all) => all.indexOf(k) !== i);
  if (dupAreas.length) throw new Error(`Más de un Rock principal en: ${[...new Set(dupAreas)].join(", ")}`);

  let problems = 0;
  for (const r of config.rocks) {
    const [owner, area] = await Promise.all([
      prisma.user.findUnique({ where: { email: r.ownerEmail }, select: { id: true, name: true } }),
      prisma.reportArea.findUnique({ where: { key: r.areaKey }, select: { id: true } }),
    ]);
    if (!owner) {
      problems += 1;
      console.log(`  ⚠ ${r.title}: no hay usuario del app con ${r.ownerEmail}`);
      continue;
    }
    const existing = await prisma.rock.findFirst({ where: { quarterId: quarter.id, ownerId: owner.id, title: r.title }, select: { id: true } });
    console.log(`  • ${existing ? "ya existe" : "crear"}: ${r.title} — ${owner.name}${r.principal ? " (principal de " + r.areaKey + ")" : ""}`);
    if (r.principal && !area) {
      problems += 1;
      console.log(`    ⚠ el área ${r.areaKey} no existe: corré antes scripts/apply-team-roster.ts`);
    }
    if (!apply) continue;

    const rock = existing ?? (await prisma.rock.create({
      data: {
        quarterId: quarter.id,
        ownerId: owner.id,
        title: r.title,
        description: r.description,
        deliverable: r.deliverable,
        doneCriteria: r.doneCriteria,
      },
      select: { id: true },
    }));
    if (r.principal && area) {
      await prisma.areaQuarterConfig.upsert({
        where: { quarterId_areaId: { quarterId: quarter.id, areaId: area.id } },
        create: { quarterId: quarter.id, areaId: area.id, principalRockId: rock.id, reportOwnerId: owner.id, status: "approved" },
        update: { principalRockId: rock.id },
      });
    }
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
