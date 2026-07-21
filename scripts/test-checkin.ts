// Prueba el parsing de Claude sin necesidad de Slack ni Notion.
// Ejecutar con: npx tsx --env-file=.env.local scripts/test-checkin.ts
//
// Reutiliza extractCheckinFields del agente real, así el prompt vive en un
// solo lugar.

import { extractCheckinFields } from "@/lib/integrations/checkin";

const TEST_MESSAGES = [
  {
    user: "Sergio Monge",
    text: "Ando en un 4 esta semana, bien enfocado. Cerramos el deal de Brasil que teníamos trabado.",
    expectedTipo: "Miércoles" as string | null,
  },
  {
    user: "Lorena",
    text: "Energía 3/5. Fue una semana intensa con demos. Win: cerramos 2 cuentas nuevas. Reto: el pipeline del Q3 está más lento de lo esperado.",
    expectedTipo: "Viernes" as string | null,
  },
  {
    user: "Adrián",
    text: "Alguien sabe dónde está el doc de la API?",
    expectedTipo: null as string | null, // No es check-in
  },
];

async function main() {
  console.log("🧪 Probando extracción de campos con Claude...\n");

  for (const msg of TEST_MESSAGES) {
    console.log(`→ Mensaje de ${msg.user}:`);
    console.log(`  "${msg.text.slice(0, 80)}..."`);

    const fields = await extractCheckinFields(msg.text, msg.user);
    console.log("  Resultado:", JSON.stringify(fields, null, 2));

    if (msg.expectedTipo === null && fields?.es_checkin === false) {
      console.log("  ✅ Correcto: mensaje ignorado\n");
    } else if (fields?.es_checkin && fields.energia) {
      console.log(`  ✅ Check-in detectado: energía ${fields.energia}/5\n`);
    } else {
      console.log("  ⚠️  Revisar resultado\n");
    }
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
