// Read-only preview: Notion + Claude, with no Slack messages or Notion writes.
// npm run preview:checkin -- --date 2026-09-14
import { generateWeeklyDigest } from "@/lib/integrations/checkin";

async function main() {
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 2 || args[0] !== "--date" || !/^\d{4}-\d{2}-\d{2}$/.test(args[1]))) {
    throw new Error("Uso: npm run preview:checkin -- [--date YYYY-MM-DD]");
  }
  const now = args[1] ? new Date(`${args[1]}T08:00:00-06:00`) : new Date();
  if (Number.isNaN(now.getTime())) throw new Error("Fecha inválida");
  const result = await generateWeeklyDigest({ dryRun: true, now });
  console.log(result.text);
  console.log(`\n[Vista previa: ${result.count} respuestas; no se publicó en Slack.]`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
