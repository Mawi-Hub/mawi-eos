// Prueba el parsing de Claude sin necesidad de Slack ni Notion.
// Ejecutar con: npx tsx --env-file=.env.local scripts/test-checkin.ts
//
// Reutiliza extractCheckinFields del agente real, así el prompt vive en un
// solo lugar.

import { extractCheckinFields } from "@/lib/integrations/checkin";
import assert from "node:assert/strict";

const TEST_MESSAGES = [
  {
    user: "Sergio Monge",
    text: "Ando en un 4 esta semana, bien enfocado. Cerramos el deal de Brasil que teníamos trabado.",
    expectedTipo: "Jueves",
    sentAt: new Date("2026-09-10T15:05:00Z"),
  },
  {
    user: "Lorena",
    text: "Energía 3/5. Fue una semana intensa con demos. Win: cerramos 2 cuentas nuevas. Reto: el pipeline del Q3 está más lento de lo esperado.",
    expectedTipo: "Jueves",
    sentAt: new Date("2026-09-12T01:00:00Z"), // Viernes 19:00 CR: respuesta tardía.
  },
  {
    user: "Adrián",
    text: "Mi win de esta semana: terminamos la integración y ya está funcionando para el cliente.",
    expectedTipo: "Jueves",
    sentAt: new Date("2026-09-10T16:00:00Z"),
  },
  {
    user: "Adrián",
    text: "Alguien sabe dónde está el doc de la API?",
    expectedTipo: null as string | null, // No es check-in
    sentAt: new Date("2026-09-10T16:00:00Z"),
  },
];

async function main() {
  console.log("🧪 Probando extracción de campos con Claude...\n");

  for (const msg of TEST_MESSAGES) {
    console.log(`→ Mensaje de ${msg.user}:`);
    console.log(`  "${msg.text.slice(0, 80)}..."`);

    const fields = await extractCheckinFields(msg.text, msg.user, msg.sentAt);
    console.log("  Resultado:", JSON.stringify(fields, null, 2));

    assert.ok(fields, "Claude debe devolver campos válidos");
    assert.equal(fields.es_checkin, msg.expectedTipo !== null);
    assert.equal(fields.tipo, msg.expectedTipo ?? "Otro");
    console.log("  ✅ Clasificación correcta\n");
  }

  console.log("✅ Prueba de Claude completada.");
  console.log(
    "Para probar Notion/Slack de punta a punta, configurá las 6 variables y escribí en el canal #team-checkins.",
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
