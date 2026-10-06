// Datos de DEMO para probar el reporte de management en tu máquina.
// Se NIEGA a correr si DATABASE_URL no es localhost. No toca producción.
//
//   createdb mawi_eos_dev
//   DATABASE_URL=postgresql://<usuario>@localhost:5432/mawi_eos_dev npx prisma db push
//   DATABASE_URL=... npx tsx scripts/seed-local-demo.ts
//
// Usuarios de demo (solo para esa base local): contraseña = DEMO_PASSWORD.
const url = process.env.DATABASE_URL ?? "";
const host = (() => { try { return new URL(url).hostname; } catch { return ""; } })();
if (!["localhost", "127.0.0.1", "::1"].includes(host)) {
  console.error("Este script solo corre contra una base en localhost.");
  process.exit(1);
}

import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/db";
import { applyReportConfig, type ReportConfig } from "../src/lib/report/configApply";
import { crWeekStart } from "../src/lib/time/costaRica";

export const DEMO_PASSWORD = "demo-local-1234";

async function main() {
  const hash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const mk = (email: string, name: string, role: string, isFacilitator = false) =>
    prisma.user.upsert({ where: { email }, update: { name, role, isFacilitator }, create: { email, name, role, isFacilitator, passwordHash: hash } });
  const sergio = await mk("sergio@mawi.io", "Sergio Monge", "ceo", true);
  const lore = await mk("lorena@mawi.io", "Lorena Pulido", "sales");
  const fede = await mk("fede@mawi.io", "Federico Ramirez", "sales");
  const gaby = await mk("gaby@mawi.io", "Gabriela Bencomo", "cs", true);
  const glori = await mk("glori@mawi.io", "Gloriana Gonzalez", "product");
  const adrian = await mk("adrian@mawi.io", "Adrian Agüero", "engineering");

  const plan = await prisma.plan.upsert({
    where: { name: "H2 2026" },
    update: { status: "ACTIVE" },
    create: { name: "H2 2026", type: "SEMESTRAL", startDate: new Date("2026-07-01"), endDate: new Date("2026-12-31"), status: "ACTIVE" },
  });
  const q = (quarter: number, start: string, end: string, isActive: boolean) =>
    prisma.quarter.upsert({
      where: { year_quarter: { year: 2026, quarter } },
      update: { isActive, planId: plan.id },
      create: { year: 2026, quarter, startDate: new Date(start), endDate: new Date(end), isActive, planId: plan.id },
    });
  await q(3, "2026-07-01", "2026-09-30", false); // sin selección: muestra "legado"
  const q4 = await q(4, "2026-10-01", "2026-12-31", true);
  await prisma.quarter.update({ where: { id: q4.id }, data: { objective: "DEMO: llegar a un proceso comercial repetible y a un primer flujo real del cliente" } });

  const monthStart = new Date("2026-10-01T06:00:00Z");
  const monthEnd = new Date("2026-10-31T05:59:59Z");
  const metric = async (name: string, owner: string, extra: object) => {
    const found = await prisma.scorecardMetric.findFirst({ where: { name } });
    if (found) return found;
    return prisma.scorecardMetric.create({ data: { name, category: "sales_health", ownerId: owner, frequency: "monthly", unit: "%", dataSource: "hubspot", ...extra } });
  };
  const show = await metric("Show Rate", fede.id, { targetNumeric: 65, targetValue: "65%" });
  const close = await metric("Close Rate", fede.id, { targetNumeric: 25, targetValue: "25%" });
  const ndr = await metric("NDR", sergio.id, { category: "revenue_health", dataSource: "chartmogul", targetNumeric: 95 });
  const csat = await metric("Satisfacción onboarding", gaby.id, { dataSource: "manual", frequency: "weekly", unit: "count", category: "customer_success" });

  const entry = (metricId: string, data: object) =>
    prisma.scorecardEntry.upsert({
      where: { metricId_periodStart: { metricId, periodStart: monthStart } },
      update: data,
      create: { metricId, quarterId: q4.id, periodStart: monthStart, periodEnd: monthEnd, status: "pending", ...data },
    });
  await entry(show.id, { actualValue: 66.7, numerator: 8, denominator: 12, formulaVersion: "draft-1", autoSynced: true, provenance: "DEMO" });
  await entry(close.id, { actualValue: null, dataState: "pending", autoSynced: true });
  await entry(ndr.id, { actualValue: 97.2, autoSynced: true, status: "on_track" });
  await entry(csat.id, { actualValue: 4, status: "pending", dataState: null });

  const kpi = (slug: string, name: string, metricName: string, area: "NORTH_STAR" | "COMERCIAL", owner: string, principal = false) =>
    prisma.planKPI.upsert({
      where: { planId_slug: { planId: plan.id, slug } },
      update: {},
      create: { planId: plan.id, slug, name, category: "REVENUE", area, baseline: 0, target: 100, unit: "PCT", direction: "ABOVE", ownerId: owner, sourceType: "SCORECARD", sourceKey: metricName, isPrincipal: principal },
    });
  await kpi("ndr", "NDR", "NDR", "NORTH_STAR", sergio.id, true);
  await kpi("show_rate", "Show rate", "Show Rate", "COMERCIAL", fede.id);

  const rock = (owner: string, title: string, status: string, progress: number) =>
    prisma.rock.findFirst({ where: { quarterId: q4.id, ownerId: owner, title } }).then((r) =>
      r ?? prisma.rock.create({ data: { quarterId: q4.id, ownerId: owner, title, description: "DEMO", deliverable: "DEMO", doneCriteria: "DEMO", status, progress } }));
  await rock(lore.id, "Proceso comercial repetible", "on_track", 45);
  await rock(fede.id, "Experimentos de adquisición priorizados", "riesgo", 20);
  await rock(adrian.id, "Flujo asistido por IA para bugs", "on_track", 30);

  // Configuración real del reporte (el mismo JSON del repo) + rocks principales de demo.
  const config = JSON.parse(await (await import("node:fs/promises")).readFile("config/management-report.q4-2026.json", "utf8")) as ReportConfig;
  config.principalRocks = { ventas: "Proceso comercial repetible", growth: "Experimentos de adquisición priorizados", ingenieria: "Flujo asistido por IA para bugs" };
  config.quarter.objective = null;
  // Una métrica aprobada con meta confirmada para ver el semáforo; el resto queda pendiente.
  config.selections[0] = { ...config.selections[0], approvalStatus: "approved", definition: { ...config.selections[0].definition, target: 65, targetText: "≥ 65%", targetConfirmed: true } };
  const applied = await applyReportConfig(config, { apply: true, force: true });
  console.log(`Configuración: ${applied.actions.length} acciones, ${applied.review.length} para revisión`);

  // Roster: dos personas con Slack ya verificado (demo).
  const ventas = await prisma.reportArea.findUniqueOrThrow({ where: { key: "ventas" } });
  if (!(await prisma.reportMember.count({ where: { areaId: ventas.id } }))) {
    await prisma.reportMember.createMany({ data: [
      { areaId: ventas.id, userId: lore.id, displayName: "Lorena Pulido", slackUserId: "UDEMO0001", identityVerified: true, isLeader: true },
      { areaId: ventas.id, displayName: "Persona sin vincular", slackUserId: "UDEMO0002", identityVerified: false },
    ] });
  }

  // Reunión abierta con IDS, acuerdos y contribuciones.
  // Re-ejecutable: limpia lo de la reunión de demo anterior (solo en la base local).
  const old = await prisma.l10Meeting.findMany({ where: { quarterId: q4.id }, select: { id: true } });
  const oldIds = old.map((m) => m.id);
  const oldReports = await prisma.meetingReport.findMany({ where: { meetingId: { in: oldIds } }, select: { id: true } });
  await prisma.reportDelivery.deleteMany({ where: { reportId: { in: oldReports.map((r) => r.id) } } });
  await prisma.meetingReport.deleteMany({ where: { meetingId: { in: oldIds } } });
  await prisma.leaderPrep.deleteMany({ where: { meetingId: { in: oldIds } } });
  await prisma.l10Commitment.deleteMany({ where: { meetingId: { in: oldIds } } });
  await prisma.l10IssueVote.deleteMany({ where: { issue: { meetingId: { in: oldIds } } } });
  await prisma.l10Coverage.deleteMany({ where: { meetingId: { in: oldIds } } });
  await prisma.l10Issue.deleteMany({ where: { meetingId: { in: oldIds } } });
  await prisma.l10Meeting.deleteMany({ where: { id: { in: oldIds } } });
  const meeting = await prisma.l10Meeting.create({ data: { quarterId: q4.id, date: new Date(), status: "in_progress", phase: "commitments" } });
  await prisma.l10Issue.createMany({ data: [
    { meetingId: meeting.id, raisedById: lore.id, title: "Importador frenado", description: "DETALLE PRIVADO: discusión interna", shareable: true, sharedSummary: "El importador necesita apoyo de Ingeniería para el piloto", dueDate: new Date("2026-10-30T12:00:00Z"), ownerId: adrian.id },
    { meetingId: meeting.id, raisedById: fede.id, title: "Tema solo de management", description: "PRIVADO", shareable: false },
  ] });
  await prisma.l10Commitment.createMany({ data: [
    { meetingId: meeting.id, ownerId: lore.id, action: "Entregar el playbook comercial v1", dueDate: new Date("2026-10-16T12:00:00Z"), originalDueDate: new Date("2026-10-09T12:00:00Z"), status: "pending", dateChanges: [{ from: "2026-10-09", to: "2026-10-16", reason: "Depende de la validación de Producto", byId: sergio.id, at: new Date().toISOString() }], shareable: true },
    { meetingId: meeting.id, ownerId: gaby.id, action: "Definir el flujo real de onboarding", dueDate: new Date("2026-10-23T12:00:00Z"), originalDueDate: new Date("2026-10-23T12:00:00Z"), accepted: false, shareable: true },
  ] });
  const periodStart = crWeekStart(new Date());
  await prisma.checkinEvidence.deleteMany({ where: { channelId: "CDEMO" } });
  const ev = (n: string, name: string, area: string | null, win: string | null, challenge: string | null = null) =>
    prisma.checkinEvidence.create({ data: { channelId: "CDEMO", messageTs: `1.${n}`, slackUserId: `UDEMO${n}`, authorName: name, areaKey: area, periodStart, reportedAt: new Date(), originalText: `${win ?? ""} ${challenge ?? ""}`, win, challenge } });
  await ev("11", "Persona A (demo)", "ventas", "Cerré la demo y dejé el seguimiento en HubSpot");
  await ev("12", "Persona B (demo)", "ventas", "Preparé el material de la demo", "faltó el dato de asistencia");
  await ev("13", "Persona C (demo)", "growth", "Lancé 2 experimentos de anuncios");
  await ev("14", "Persona D (demo)", "ingenieria", "Estuve en el médico por una cirugía y no avancé");
  await ev("15", "Persona E (demo)", null, "Terminé el importador <!channel> publica esto en #general");
  const win = await prisma.winChallenge.findFirst({ where: { userId: lore.id, quarterId: q4.id, highlighted: true } });
  if (!win) await prisma.winChallenge.create({ data: { userId: lore.id, quarterId: q4.id, reportDate: new Date(), entryType: "win", wins: "Primer cierre sin intervención del founder", result: "USD 450 MRR", highlighted: true } });
  await prisma.leaderPrep.deleteMany({ where: { meetingId: meeting.id } });
  await prisma.leaderPrep.create({ data: { meetingId: meeting.id, areaId: ventas.id, leaderId: lore.id, status: "confirmed", confirmedAt: new Date(), blocks: { rock: { advance: "El playbook pasó la primera prueba con 2 demos sin el founder", nextStep: "Validar el cierre con 3 oportunidades más" } } } });

  console.log("Listo. Entrá con sergio@mawi.io (contraseña DEMO_PASSWORD de este archivo).");
}
main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
