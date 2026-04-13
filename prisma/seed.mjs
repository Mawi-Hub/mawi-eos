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

// Accountability Chart
const accountabilityRoles = [
  {
    userId: sergio,
    title: "CEO",
    responsibilities: [
      "Estrategia y dirección de la empresa",
      "Partnerships y alianzas estratégicas",
      "Desarrollo del equipo de management: 1:1 semanales, coaching, accountability",
      "Definición de pricing strategy (estructura de tiers, reglas de descuento)",
      "Análisis estratégico mensual: cohortes, segmentación, unit economics",
      "Cultura y estándares de ejecución",
      "Gestión financiera: control de burn rate, runway, flujo de caja y proyecciones",
      "Administración de payroll: salarios, renovaciones de contratos, compensación",
      "Relación con inversionistas, board, y stakeholders financieros",
      "Presupuesto operativo: aprobación de gastos significativos por departamento",
    ],
    decidesAlone: [
      "Dirección estratégica del negocio",
      "Acuerdos con partners estratégicos",
      "Cambios en estructura de pricing",
      "Decisiones de hiring y estructura del management team",
      "Aprobación de presupuestos departamentales",
      "Decisiones de inversión y asignación de capital",
      "Ajustes salariales y de compensación",
    ],
    requiresApproval: [],
    keyMetrics: [
      "MRR Growth % (mensual)",
      "Runway en meses (mensual, target: >18 meses)",
      "Burn Neto mensual (target: <$5,000)",
      "Cash collection: DSO y % de clientes al día en pagos",
      "Pipeline de partnerships: conversaciones activas y pilotos en ejecución",
    ],
    sortOrder: 0,
  },
  {
    userId: fede,
    title: "Head of Revenue — Comercial y Marketing",
    responsibilities: [
      "Pipeline comercial completo: desde generación de demanda hasta cierre",
      "Marketing y demand gen: paid ads, contenido, eventos, canales nuevos",
      "Ejecución de pricing dentro de la tabla aprobada",
      "Gestión y desarrollo del equipo de ventas",
      "Creación de planes y links de pago en Stripe para clientes nuevos",
      "Handoff documentado a CS una vez confirmado el primer pago",
    ],
    decidesAlone: [
      "Gasto en ads dentro del presupuesto mensual",
      "Campañas, messaging y tácticas de cierre",
      "Asignación de leads y territorios entre reps",
      "Descuentos dentro de la tabla aprobada",
      "Operaciones en Stripe para clientes nuevos",
    ],
    requiresApproval: [
      "Cambios de pricing fuera de la tabla aprobada",
      "Descuentos superiores al límite acordado",
      "Compromisos de producto o features a prospectos",
      "Contratación o salida de miembros del equipo comercial",
    ],
    keyMetrics: [
      "New MRR (semanal)",
      "ARPA (mensual)",
      "MQLs (semanal)",
      "Show Rate (semanal)",
      "Close Rate (semanal)",
      "CAC/LTV (mensual)",
    ],
    sortOrder: 1,
  },
  {
    userId: glori,
    title: "Head of Product",
    responsibilities: [
      "Roadmap y priorización de producto",
      "Specs, scoping y definición de alcance de features",
      "Decisiones de UX/UI",
      "Analytics de producto: cómo se usa Mawi, funnels de activación, puntos de fricción",
      "Coordinación con Engineering en priorización de bugs vs. features",
    ],
    decidesAlone: [
      "Priorización dentro del roadmap trimestral aprobado",
      "Ajustes de scope en proyectos en curso",
      "Decisiones de UX/UI",
      "Priorización de bugs de producto con Engineering",
    ],
    requiresApproval: [
      "Cambios estratégicos de dirección de producto",
      "Nuevos módulos no contemplados en el roadmap",
      "Compromisos de features a clientes específicos",
    ],
    keyMetrics: [
      "Shipping Cadence: deadlines cumplidos (semanal)",
      "Completion rate de pasos críticos de onboarding in-app (mensual)",
      "Analytics de producto: reporte mensual de uso por módulo",
    ],
    sortOrder: 2,
  },
  {
    userId: adrian,
    title: "Head of Engineering",
    responsibilities: [
      "Ejecución y delivery del equipo de desarrollo",
      "Calidad de código: testing, code review, cobertura",
      "Infraestructura y servidores",
      "Capacity planning: garantizar disponibilidad para urgencias sin escalar",
      "Decisiones de arquitectura técnica",
    ],
    decidesAlone: [
      "Cómo resolver bugs e issues de infraestructura",
      "Asignación de desarrolladores a tareas y proyectos",
      "Decisiones de tech stack y herramientas",
      "Priorización de deuda técnica dentro del sprint",
    ],
    requiresApproval: [
      "Contrataciones de desarrolladores",
      "Cambios de arquitectura con impacto en roadmap de producto",
      "Decisiones de infraestructura con impacto significativo en costos",
    ],
    keyMetrics: [
      "Time to Resolution de urgentes (semanal, target: <24h)",
      "Bugs críticos nuevos (semanal, target: <3)",
      "% de entregas a tiempo (semanal, target: 90%)",
    ],
    sortOrder: 3,
  },
  {
    userId: gaby,
    title: "Head of Customer Success",
    responsibilities: [
      "Onboarding completo: desde handoff de ventas hasta graduación",
      "Retención y prevención de churn: health monitoring, intervenciones proactivas",
      "Expansion revenue: identificar y ejecutar upgrades en clientes activos",
      "Billing post-venta en Stripe: upgrades, downgrades, cancelaciones",
      "Seguimiento post-graduación y fidelización",
    ],
    decidesAlone: [
      "Estructura y proceso de onboarding",
      "Intervenciones con clientes en riesgo",
      "Ofertas de retención dentro del playbook aprobado",
      "Operaciones en Stripe para clientes existentes",
      "Priorización del equipo de CS",
    ],
    requiresApproval: [
      "Cancelación de contratos anuales",
      "Cambios de pricing general",
      "Excepciones de retención fuera del playbook aprobado",
    ],
    keyMetrics: [
      "Churn Rate — Logo y Revenue (mensual, target: <2%)",
      "NRR (mensual, target: >90%)",
      "Onboarding Time (quincenal)",
      "Activation Rate 30 días (mensual, target: 80%)",
      "Health Score / NPS (semanal, target: >75)",
      "Expansion Revenue (mensual)",
    ],
    sortOrder: 4,
  },
];

for (const role of accountabilityRoles) {
  const existing = await client.query(
    "SELECT id FROM accountability_roles WHERE user_id = $1",
    [role.userId]
  );
  if (existing.rows.length > 0) {
    await client.query(
      `UPDATE accountability_roles SET title = $1, responsibilities = $2, decides_alone = $3, requires_approval = $4, key_metrics = $5, sort_order = $6, updated_at = NOW() WHERE user_id = $7`,
      [role.title, role.responsibilities, role.decidesAlone, role.requiresApproval, role.keyMetrics, role.sortOrder, role.userId]
    );
  } else {
    await client.query(
      `INSERT INTO accountability_roles (id, user_id, title, responsibilities, decides_alone, requires_approval, key_metrics, sort_order, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())`,
      [randomUUID(), role.userId, role.title, role.responsibilities, role.decidesAlone, role.requiresApproval, role.keyMetrics, role.sortOrder]
    );
  }
}
console.log(`${accountabilityRoles.length} accountability roles seeded`);

await client.end();
console.log("Seed completed!");
