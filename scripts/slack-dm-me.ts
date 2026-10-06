// Pruebas de Slack SOLO al DM del dueño (sergio@mawi.io). El destinatario está
// fijo en el código: no acepta otro. Usa el token real del bot (.env.local).
//   node --env-file=.env.local node_modules/.bin/tsx scripts/slack-dm-me.ts open
//   ... prep      → manda la preparación de líderes (texto de prueba)
import { lookupSlackUserByEmail, openDm } from "../src/lib/integrations/kpiCheckin";
import { realSlackProvider } from "../src/lib/report/providers";
import { renderLeaderPrepPrompt } from "../src/lib/report/render";

const OWNER_EMAIL = "sergio@mawi.io";

async function main() {
  const mode = process.argv[2];
  const slackUser = await lookupSlackUserByEmail(OWNER_EMAIL);
  if (!slackUser) throw new Error("No se encontró tu usuario de Slack por email");
  const channel = await openDm(slackUser);
  if (!channel) throw new Error("No se pudo abrir el DM (¿falta im:write?)");

  if (mode === "open") {
    console.log(`DM_CHANNEL=${channel}`);
    return;
  }
  if (mode === "prep") {
    const text = renderLeaderPrepPrompt({
      leaderName: "Sergio (PRUEBA)", meetingDate: new Date(),
      rock: { title: "Proceso comercial repetible", status: "en camino" },
      metrics: [{ label: "Show rate", valueText: "66.7% (8/12)", targetText: "≥ 65%", periodLabel: "mes a la fecha (oct 2026)", source: "HubSpot" }],
      teamResponses: 4, teamExpected: 5,
      previousAgreements: [{ action: "Entregar el playbook comercial v1", dueDate: "2026-10-09", ownerName: "Lorena" }],
      url: null,
    });
    const res = await realSlackProvider.post({ channel, text: `🧪 *PRUEBA del reporte de management — datos ficticios, solo para vos*\n\n${text}`, idempotencyKey: `test-prep:${Date.now()}` });
    console.log("prep →", res.status === "sent" ? "enviado" : `${res.status}: ${"error" in res ? res.error : ""}`);
    return;
  }
  throw new Error("Modo: open | prep");
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; });
