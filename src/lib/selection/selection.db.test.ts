// Selección trimestral + configuración contra Postgres LOCAL (nunca producción).
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { dbAvailable } from "@/test/db";

const skip = !dbAvailable;
const tag = Math.random().toString(36).slice(2, 8);
let ids: { users: string[]; plan: string; q4: string; q3: string; metric: string; metric2: string };

before(async () => {
  if (skip) return;
  process.env.REPORT_SELECTION_ENABLED = "1";
  const { prisma } = await import("@/lib/db");
  const lore = await prisma.user.create({ data: { email: `lore-${tag}@t.local`, name: "Lore", role: "sales", passwordHash: "x" } });
  const fede = await prisma.user.create({ data: { email: `fede-${tag}@t.local`, name: "Fede", role: "sales", passwordHash: "x" } });
  const plan = await prisma.plan.create({ data: { name: `Plan ${tag}`, type: "SEMESTRAL", startDate: new Date(), endDate: new Date() } });
  const year = 4000 + Math.floor(Math.random() * 5000);
  const q3 = await prisma.quarter.create({ data: { year, quarter: 3, startDate: new Date("2026-07-01"), endDate: new Date("2026-09-30"), planId: plan.id } });
  const q4 = await prisma.quarter.create({ data: { year, quarter: 4, startDate: new Date("2026-10-01"), endDate: new Date("2026-12-31"), planId: plan.id } });
  const metric = await prisma.scorecardMetric.create({ data: { name: `Show Rate ${tag}`, category: "sales_health", ownerId: fede.id, frequency: "monthly", unit: "%", dataSource: "hubspot", targetNumeric: 65 } });
  const metric2 = await prisma.scorecardMetric.create({ data: { name: `Otra ${tag}`, category: "sales_health", ownerId: fede.id, frequency: "weekly", unit: "count", dataSource: "manual" } });
  // Un cero sincronizado SIN confirmar, y un valor viejo: nada de eso puede salir como resultado.
  await prisma.scorecardEntry.create({ data: { metricId: metric.id, quarterId: q4.id, periodStart: new Date(), periodEnd: new Date(), actualValue: 0, autoSynced: true } });
  await prisma.scorecardEntry.create({ data: { metricId: metric2.id, quarterId: q4.id, periodStart: new Date(), periodEnd: new Date(), actualValue: 7, status: "on_track" } });
  ids = { users: [lore.id, fede.id], plan: plan.id, q4: q4.id, q3: q3.id, metric: metric.id, metric2: metric2.id };
});

after(async () => {
  if (skip) return;
  const { prisma } = await import("@/lib/db");
  await prisma.quarterMetricSelection.deleteMany({ where: { planId: ids.plan } });
  await prisma.areaQuarterConfig.deleteMany({ where: { quarterId: { in: [ids.q3, ids.q4] } } });
  await prisma.reportArea.deleteMany({ where: { key: { in: [`ventas-${tag}`, `growth-${tag}`] } } });
  await prisma.scorecardEntry.deleteMany({ where: { metricId: { in: [ids.metric, ids.metric2] } } });
  await prisma.scorecardMetric.deleteMany({ where: { id: { in: [ids.metric, ids.metric2] } } });
  await prisma.quarter.deleteMany({ where: { id: { in: [ids.q3, ids.q4] } } });
  await prisma.plan.deleteMany({ where: { id: ids.plan } });
  await prisma.user.deleteMany({ where: { id: { in: ids.users } } });
  await prisma.$disconnect();
});

const config = () => ({
  quarter: { year: 0, quarter: 4 },
  plan: { name: `Plan ${tag}` },
  areas: [
    { key: `ventas-${tag}`, name: "Ventas", leaderEmail: `lore-${tag}@t.local`, sortOrder: 1 },
    { key: `growth-${tag}`, name: "Growth", leaderEmail: `fede-${tag}@t.local`, sortOrder: 2 },
  ],
  selections: [
    { areaKey: `ventas-${tag}`, order: 1, label: "Show rate", ref: { scorecardMetricName: `Show Rate ${tag}` }, approvalStatus: "pending" as const, definition: { targetConfirmed: false } },
    { areaKey: `growth-${tag}`, order: 1, label: "Leads aceptados", ref: { proposalKey: `growth_leads_${tag}` }, approvalStatus: "pending" as const, definition: {} },
  ],
});

async function q4Year() {
  const { prisma } = await import("@/lib/db");
  return (await prisma.quarter.findUniqueOrThrow({ where: { id: ids.q4 } })).year;
}

test("simulación no escribe; aplicar es idempotente y no pisa aprobadas", { skip }, async () => {
  const { prisma } = await import("@/lib/db");
  const { applyReportConfig } = await import("@/lib/report/configApply");
  const cfg = config();
  cfg.quarter.year = await q4Year();

  const dry = await applyReportConfig(cfg, { apply: false });
  assert.ok(dry.actions.length > 0);
  assert.equal(await prisma.quarterMetricSelection.count({ where: { planId: ids.plan } }), 0, "la simulación no escribe");

  await applyReportConfig(cfg, { apply: true });
  await applyReportConfig(cfg, { apply: true }); // idempotente
  assert.equal(await prisma.quarterMetricSelection.count({ where: { planId: ids.plan } }), 2);
  assert.equal(await prisma.reportArea.count({ where: { key: { in: [`ventas-${tag}`, `growth-${tag}`] } } }), 2);

  // Una definición aprobada se conserva aunque el JSON diga otra cosa.
  await prisma.quarterMetricSelection.updateMany({ where: { planId: ids.plan, displayLabel: "Show rate" }, data: { approvalStatus: "approved", displayLabel: "Show rate (aprobado)" } });
  await applyReportConfig(cfg, { apply: true });
  const kept = await prisma.quarterMetricSelection.findFirstOrThrow({ where: { planId: ids.plan, displayLabel: "Show rate (aprobado)" } });
  assert.equal(kept.approvalStatus, "approved");
  await prisma.quarterMetricSelection.update({ where: { id: kept.id }, data: { approvalStatus: "pending", displayLabel: "Show rate" } });
});

test("la selección separa Growth y Ventas, marca pendientes y nunca muestra un cero sin confirmar", { skip }, async () => {
  const { getQuarterSelection } = await import("./quarterSelection");
  const sel = await getQuarterSelection(ids.q4);
  assert.equal(sel.hasSelection, true);
  assert.deepEqual([...new Set(sel.rows.map((r) => r.areaName))].sort(), ["Growth", "Ventas"]);

  const show = sel.rows.find((r) => r.label === "Show rate")!;
  assert.equal(show.pendingConfig, true, "definición sin aprobar = pendiente de configuración");
  assert.equal(show.signal, null, "sin meta confirmada no hay semáforo");
  assert.equal(show.valueText, null, "un 0 sincronizado sin confirmar no se muestra como valor");
  assert.equal(show.dataState, "pending");

  const proposal = sel.rows.find((r) => r.label === "Leads aceptados")!;
  assert.equal(proposal.metric, null);
  assert.equal(proposal.valueText, null);
  assert.equal(proposal.pendingConfig, true);
});

test("trimestre sin selección: estado vacío explícito, sin fallback a todas las métricas", { skip }, async () => {
  const { getQuarterSelection, getMetricScope } = await import("./quarterSelection");
  const sel = await getQuarterSelection(ids.q3);
  assert.equal(sel.hasSelection, false);
  assert.equal(sel.rows.length, 0);
  const scope = await getMetricScope(ids.q3);
  assert.equal(scope.mode, "selection");
  if (scope.mode === "selection") {
    assert.equal(scope.hasSelection, false);
    assert.equal(scope.metricIds.size, 0);
  }
});

test("meta confirmada + aprobada + dato vigente: sí hay semáforo; ocultar y restaurar conserva datos", { skip }, async () => {
  const { prisma } = await import("@/lib/db");
  const { getQuarterSelection } = await import("./quarterSelection");
  const area = await prisma.reportArea.findUniqueOrThrow({ where: { key: `ventas-${tag}` } });
  const sel = await prisma.quarterMetricSelection.create({
    data: { planId: ids.plan, quarterId: ids.q4, areaId: area.id, scorecardMetricId: ids.metric2, displayLabel: "Otra", sortOrder: 5, approvalStatus: "approved", definition: { targetConfirmed: true, target: 5, direction: "above", targetText: "≥ 5" } },
  });
  let rows = (await getQuarterSelection(ids.q4)).rows;
  const row = rows.find((r) => r.label === "Otra")!;
  assert.equal(row.signal, "on_track");
  assert.equal(row.targetText, "≥ 5");

  // "Ocultar" = salir de la selección. El dato no se toca (isActive tampoco).
  await prisma.quarterMetricSelection.delete({ where: { id: sel.id } });
  rows = (await getQuarterSelection(ids.q4)).rows;
  assert.ok(!rows.some((r) => r.label === "Otra"));
  assert.equal(await prisma.scorecardEntry.count({ where: { metricId: ids.metric2 } }), 1);
  assert.equal((await prisma.scorecardMetric.findUniqueOrThrow({ where: { id: ids.metric2 } })).isActive, true);

  // Restaurar recupera el histórico intacto.
  await prisma.quarterMetricSelection.create({
    data: { planId: ids.plan, quarterId: ids.q4, areaId: area.id, scorecardMetricId: ids.metric2, displayLabel: "Otra", sortOrder: 5, approvalStatus: "approved", definition: { targetConfirmed: true, target: 5, direction: "above" } },
  });
  assert.equal((await getQuarterSelection(ids.q4)).rows.find((r) => r.label === "Otra")?.entry?.actualValue, 7);
});

test("la base rechaza duplicados del mismo KPI/métrica/propuesta en un trimestre", { skip }, async () => {
  const { prisma } = await import("@/lib/db");
  const area = await prisma.reportArea.findUniqueOrThrow({ where: { key: `ventas-${tag}` } });
  await assert.rejects(
    prisma.quarterMetricSelection.create({ data: { planId: ids.plan, quarterId: ids.q4, areaId: area.id, scorecardMetricId: ids.metric2, sortOrder: 9 } }),
  );
});
