// Aplica config/management-report.*.json a la base. Por defecto es una
// SIMULACIÓN (no escribe). Con --apply escribe filas del reporte; nunca borra
// ni ejecuta seeds. Antes de --apply conviene mirar a qué base apunta.
//
//   npx tsx scripts/apply-report-config.ts config/management-report.q4-2026.json
//   npx tsx scripts/apply-report-config.ts config/management-report.q4-2026.json --apply
import "dotenv/config";
import { readFileSync } from "node:fs";
import { applyReportConfig, type ReportConfig } from "../src/lib/report/configApply";
import { prisma } from "../src/lib/db";

async function main() {
  const file = process.argv[2];
  if (!file || file.startsWith("--")) throw new Error("Uso: apply-report-config.ts <archivo.json> [--apply] [--force]");
  const apply = process.argv.includes("--apply");
  const force = process.argv.includes("--force");
  const config = JSON.parse(readFileSync(file, "utf8")) as ReportConfig;

  const host = (() => { try { return new URL(process.env.DATABASE_URL ?? "").host; } catch { return "(desconocido)"; } })();
  console.log(`Base: ${host} · modo: ${apply ? "ESCRIBIR" : "simulación"}${force ? " · force" : ""}\n`);

  const report = await applyReportConfig(config, { apply, force });
  console.log("Acciones:");
  report.actions.forEach((a) => console.log(`  • ${a}`));
  if (report.review.length) { console.log("\nPara revisión:"); report.review.forEach((r) => console.log(`  ⚠ ${r}`)); }
  if (report.issues.length) { console.log("\nValidación de la selección:"); report.issues.forEach((i) => console.log(`  [${i.level}] ${i.key}: ${i.message}`)); }
  if (report.issues.some((i) => i.level === "error")) { console.error("\nHay errores bloqueantes: no se escribió la selección."); process.exitCode = 1; }
  if (!apply) console.log("\nSimulación: no se escribió nada. Agregá --apply para aplicar.");
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
