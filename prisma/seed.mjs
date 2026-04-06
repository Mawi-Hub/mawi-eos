import "dotenv/config";
import pg from "pg";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

const password = bcrypt.hashSync("mawi2026", 10);

async function upsertUser(email, name, role) {
  const existing = await client.query("SELECT id FROM users WHERE email = $1", [email]);
  if (existing.rows.length > 0) return existing.rows[0].id;
  const id = randomUUID();
  await client.query(
    "INSERT INTO users (id, email, name, role, password_hash, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, NOW(), NOW())",
    [id, email, name, role, password]
  );
  return id;
}

const sergio = await upsertUser("sergio@mawi.io", "Sergio Monge", "ceo");
const fede = await upsertUser("fede@mawi.io", "Federico Ramirez", "sales");
const gaby = await upsertUser("gaby@mawi.io", "Gabriela Bencomo", "cs");
const glori = await upsertUser("glori@mawi.io", "Gloriana Gonzalez", "product");
const adrian = await upsertUser("adrian@mawi.io", "Adrian Agüero", "engineering");
console.log("Users seeded:", { sergio, fede, gaby, glori, adrian });

async function upsertQuarter(year, quarter, startDate, endDate, isActive) {
  const existing = await client.query("SELECT id FROM quarters WHERE year = $1 AND quarter = $2", [year, quarter]);
  if (existing.rows.length > 0) return existing.rows[0].id;
  const id = randomUUID();
  await client.query(
    "INSERT INTO quarters (id, year, quarter, start_date, end_date, is_active, created_at) VALUES ($1, $2, $3, $4, $5, $6, NOW())",
    [id, year, quarter, startDate, endDate, isActive]
  );
  return id;
}

const q1 = await upsertQuarter(2026, 1, "2026-01-01", "2026-03-31", false);
const q2 = await upsertQuarter(2026, 2, "2026-04-01", "2026-06-30", true);
console.log("Quarters seeded:", { q1, q2 });

// Metrics
await client.query("DELETE FROM scorecard_entries");
await client.query("DELETE FROM scorecard_metrics");
const metrics = [
  ["MRR Growth %", "revenue_health", sergio, "10%", 10, "above", "monthly", "%", "(MRR actual – MRR previo) ÷ MRR previo", "chartmogul", 1],
  ["New MRR", "revenue_health", fede, "$1,250", 1250, "above", "weekly", "$", "Nuevos contratos + upgrades – downgrades", "chartmogul", 2],
  ["Churn (Logo y Revenue)", "revenue_health", gaby, "2%", 2, "below", "monthly", "%", "Logo: cuentas perdidas ÷ totales. Revenue: MRR perdido ÷ total", "chartmogul", 3],
  ["ARPA", "revenue_health", sergio, "$350", 350, "above", "monthly", "$", "MRR total ÷ cuentas activas", "chartmogul", 4],
  ["NRR", "revenue_health", gaby, "90%", 90, "above", "monthly", "%", "(MRR inicial + expansión – churn) ÷ MRR inicial", "chartmogul", 5],
  ["Leads calificados (MQLs)", "sales_health", fede, "70", 70, "above", "weekly", "count", "Leads que cumplen criterios MQL", "hubspot", 6],
  ["Show Rate", "sales_health", fede, "60%", 60, "above", "weekly", "%", "Citas realizadas ÷ citas agendadas", "hubspot", 7],
  ["Close Rate", "sales_health", fede, "25%", 25, "above", "weekly", "%", "Deals ganados ÷ deals creados", "hubspot", 8],
  ["CAC/LTV", "sales_health", fede, "3:1", 3, "above", "monthly", "ratio", "Relación de LTV con CAC", "manual", 9],
  ["Onboarding Time", "customer_success", gaby, "30 días", 30, "below", "biweekly", "days", "Días entre kickoff y primera activación", "manual", 10],
  ["Activation Rate (30 días)", "customer_success", gaby, "80%", 80, "above", "monthly", "%", "% clientes que activan en primeros 30 días", "posthog", 11],
  ["Health Score / NPS", "customer_success", gaby, "75", 75, "above", "weekly", "score", "Según metodología NPS", "manual", 12],
  ["Shipping Cadence", "product_engineering", glori, "Sí", null, "equal", "weekly", "boolean", "¿Se cumplieron los deadlines de la semana?", "manual", 13],
  ["Time to Resolution de Urgentes", "product_engineering", adrian, "24 horas", 24, "below", "weekly", "hours", "Tiempo solución ticket escalado a ingeniería", "manual", 14],
  ["Bugs críticos", "product_engineering", adrian, "3", 3, "below", "weekly", "count", "Número de bugs críticos nuevos", "manual", 15],
  ["Burn Neto", "financial_health", sergio, "-$5,000", -5000, "above", "monthly", "$", "Ingresos – gastos reales del mes", "manual", 16],
  ["Runway", "financial_health", sergio, "18 meses", 18, "above", "monthly", "months", "Cash disponible ÷ Burn mensual", "manual", 17],
];

for (const m of metrics) {
  await client.query(
    `INSERT INTO scorecard_metrics (id, name, category, owner_id, target_value, target_numeric, target_direction, frequency, unit, calculation, data_source, sort_order, is_active, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, true, NOW(), NOW())`,
    [randomUUID(), ...m]
  );
}
console.log(`${metrics.length} metrics seeded`);

// Rocks Q1
const existingRocks = await client.query("SELECT COUNT(*) as c FROM rocks WHERE quarter_id = $1", [q1]);
if (parseInt(existingRocks.rows[0].c) === 0) {
  const rocks = [
    [q1, sergio, "Canales de distribución alternos", "Explorar canales alternativos más allá de Meta Ads.", "2-3 pilotos activos con estructura definida.", "¿2-3 pilotos en ejecución? ¿Se generaron leads?", 80, "Cementos Progreso canceló.", "on_track", null],
    [q1, sergio, "Reducir operación y elevar autonomía", "Reducir tareas operativas mediante delegación documentada.", "Procesos documentados. <3 hrs/semana operación.", "¿Documentación y owners claros?", 90, null, "on_track", null],
    [q1, glori, "Flexibilizar control y visualización de presupuesto", "Flexibilizar tipo de control y visualización.", "80% proyectos dentro del plazo.", "Proyectos en producción dentro del plazo", 82, "Requiere mucho testing.", "riesgo", null],
    [q1, glori, "Autoasignación para control de gastos", "Agilizar asignación con autoasignación.", "Autoasignación de categoría y modelos.", "Modelo en producción con 80% precisión", 75, null, "on_track", null],
    [q1, fede, "Construir Engine de Ventas Predecible", "Engine de ventas predecible.", "Funnel definido, reporte conversión.", "$15K–$20K New MRR, ≥80% reps cumplen meta", 75, "Atraso por cambios con Edgar.", "on_track", null],
    [q1, fede, "Crear Playbook Comercial End-to-End", "Playbook comercial para escalar.", "Sales Playbook documentado completo.", "Nuevo rep puede ejecutar sin Fede", 100, null, "done", "done"],
    [q1, gaby, "Asegurar Activación en Onboarding (30 Días)", "Activación en primeros 30 días.", "Reporte de uso en PostHog.", "≥90% cuentas con Key User activo en 30 días", 46, "Se toman graduados en el mes.", "off_track", null],
    [q1, gaby, "Fidelización y Seguimiento Post-Graduación", "Seguimiento post-graduación.", "Seguimientos en HubSpot.", "100% clientes con 2+ touchpoints", 100, null, "on_track", null],
    [q1, adrian, "Cumplir con Plazos de Entrega", "Cumplir plazos con métricas lead/cycle time.", "Métricas implementadas, reporte semanal.", "90% tareas dentro del plazo", 0, "Retrasados", "off_track", null],
    [q1, adrian, "Reducir Bugs introducidos por development", "Reducir bugs con tests automatizados.", "Suite tests en módulos críticos.", "≥80% cobertura, reducción bugs producción", 0, "22 bugs/semana, 11 urgentes.", "off_track", null],
  ];

  for (const r of rocks) {
    await client.query(
      `INSERT INTO rocks (id, quarter_id, owner_id, title, description, deliverable, done_criteria, progress, risk, status, final_status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())`,
      [randomUUID(), ...r]
    );
  }
  console.log(`${rocks.length} rocks seeded`);
}

await client.end();
console.log("Seed completed!");
