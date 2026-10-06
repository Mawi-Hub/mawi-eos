// Vista previa de los mensajes de Slack del reporte de management con DATOS DE
// PRUEBA. No lee la base, no llama a Slack/Notion/Claude y no envía nada.
//   npx tsx scripts/preview-report.ts            → imprime
//   npx tsx scripts/preview-report.ts --write    → escribe docs/management-report-previews.md
import { writeFileSync } from "node:fs";
import { messages, renderLeaderPrepPrompt, renderMeetingSummary, renderTeamCheckinPrompt } from "../src/lib/report/render";
import { SNAPSHOT_SCHEMA, type MeetingReportSnapshot } from "../src/lib/report/types";

const cut = "2026-10-09T17:40:00.000Z";
const base: MeetingReportSnapshot = {
  schema: SNAPSHOT_SCHEMA,
  meetingId: "demo-0000",
  meetingVersion: 7,
  quarterLabel: "Q4 2026",
  meetingDate: "2026-10-09T15:30:00.000Z",
  period: { start: "2026-10-05T06:00:00.000Z", end: "2026-10-12T05:59:59.999Z", cutAt: cut },
  objective: "Llegar a un proceso comercial repetible y a un primer flujo real del cliente (DATO DE PRUEBA)",
  closedByName: "Facilitador de Prueba",
  selectionStatus: "ok",
  companyMetrics: [
    { selectionId: "c1", label: "NDR", valueText: "97.2%", nOverN: null, targetText: null, periodLabel: "último mes cerrado (sep 2026)", dataState: "value", lastValid: null, ownerName: null, pendingConfig: false, signal: null },
  ],
  areas: [
    {
      areaKey: "ventas", areaName: "Ventas", leaderName: "Lider Ventas",
      rock: { title: "Proceso comercial repetible", status: "en_camino", progress: 45 },
      advance: "El playbook pasó la primera prueba con 2 demos sin el founder", nextStep: "Validar el cierre con 3 oportunidades más",
      prepStatus: "confirmed",
      metrics: [
        { selectionId: "s1", label: "Show rate", valueText: "66.7%", nOverN: "8/12", targetText: null, periodLabel: "mes a la fecha (oct 2026)", dataState: "value", lastValid: null, ownerName: "Lider Ventas", pendingConfig: false, signal: null },
        { selectionId: "s2", label: "Porcentaje de cierre", valueText: null, nOverN: null, targetText: null, periodLabel: "mes a la fecha (oct 2026)", dataState: "pending", lastValid: { valueText: "22%", periodLabel: "último mes cerrado (sep 2026)" }, ownerName: "Lider Ventas", pendingConfig: false, signal: null },
      ],
    },
    {
      areaKey: "growth", areaName: "Growth", leaderName: "Lider Growth",
      rock: { title: "Experimentos de adquisición priorizados", status: "en_riesgo", progress: 20 },
      advance: null, nextStep: null, prepStatus: "draft",
      metrics: [
        { selectionId: "s3", label: "Leads calificados nuevos originados por Marketing", valueText: null, nOverN: null, targetText: null, periodLabel: "mes a la fecha (oct 2026)", dataState: "pending", lastValid: null, ownerName: null, pendingConfig: true, signal: null },
      ],
    },
    { areaKey: "customer", areaName: "Customer", leaderName: "Lider Customer", rock: null, advance: null, nextStep: null, prepStatus: "missing", metrics: [] },
  ],
  wins: [{ id: "w1", areaKey: "ventas", text: "Primer cierre sin intervención del founder", result: "USD 450 MRR", contributors: ["Persona A", "Persona B"], why: "Prueba que el playbook funciona" }],
  contributions: [
    { id: "e1", areaKey: "ventas", areaName: "Ventas", name: "Persona A", text: "Cerré la demo y dejé el seguimiento en HubSpot", link: null, late: false },
    { id: "e2", areaKey: "ventas", areaName: "Ventas", name: "Persona B", text: "Preparé el material de la demo · Reto: faltó el dato de asistencia", link: null, late: false },
    { id: "e3", areaKey: "growth", areaName: "Growth", name: "Persona C", text: "Lancé 2 experimentos de anuncios", link: null, late: true },
  ],
  blockers: [{ id: "i1", text: "El importador necesita apoyo de Ingeniería para el piloto", impact: null, decision: null, helpFrom: "Lider Ingeniería", neededBy: "2026-10-30", resolved: false }],
  agreements: [
    { id: "a1", action: "Entregar el playbook comercial v1", ownerName: "Lider Ventas", dueDate: "2026-10-16", originalDueDate: "2026-10-09", dateChangeReason: "Depende de la validación de Producto", status: "pending", accepted: true, nextStep: "Cerrar el borrador el lunes", previous: true },
    { id: "a2", action: "Definir el flujo real de onboarding", ownerName: "Lider Customer", dueDate: "2026-10-23", originalDueDate: null, dateChangeReason: null, status: "open", accepted: false, nextStep: null, previous: false },
  ],
  detailUrl: "https://eos.example.test/l10",
  notionUrl: null,
  update: null,
};

const sections: Array<[string, string]> = [];
sections.push(["1. Check-in del equipo (jueves) — texto de la pregunta única, sin cambios de flujo", renderTeamCheckinPrompt({ rocks: [{ areaName: "Ventas", rockTitle: "Proceso comercial repetible" }, { areaName: "Growth", rockTitle: "Experimentos de adquisición priorizados" }, { areaName: "Customer", rockTitle: null }] })]);
sections.push([
  "2. Check-in de líderes (jueves por la noche) — cinco bloques precargados",
  renderLeaderPrepPrompt({
    leaderName: "Lider Ventas", meetingDate: new Date("2026-10-09T15:30:00Z"),
    rock: { title: "Proceso comercial repetible", status: "en camino" },
    metrics: [{ label: "Show rate", valueText: "66.7% (8/12)", targetText: null, periodLabel: "mes a la fecha (oct 2026)", source: "HubSpot" }, { label: "Porcentaje de cierre", valueText: null, targetText: null, periodLabel: "mes a la fecha (oct 2026)", source: "HubSpot" }],
    teamResponses: 4, teamExpected: 5,
    previousAgreements: [{ action: "Entregar el playbook comercial v1", dueDate: "2026-10-09", ownerName: "Lider Ventas" }],
    url: "https://eos.example.test/l10",
  }),
]);
const summary = renderMeetingSummary(base).parts;
summary.forEach((p, i) => sections.push([`3.${i + 1} Resumen al cerrar management — ${i === 0 ? "mensaje principal" : "respuesta en el hilo"}`, p]));
const update = renderMeetingSummary({ ...base, update: { ofVersion: 1, reason: "Se completó el playbook" } }).parts[0];
sections.push(["3.x Actualización posterior (mismo hilo, versionada) — primeras líneas", update.split("\n").slice(0, 4).join("\n")]);
sections.push([
  "4. Faltantes y errores",
  [
    messages.metricPending("Porcentaje de cierre", "oct 2026", "Lider Ventas", { value: "22%", date: "sep 2026" }),
    messages.metricStale("Show rate", "2026-09-28"),
    messages.leaderReminder("el bloque 4 (acuerdos anteriores)", "9 oct", "https://eos.example.test/l10"),
    messages.captureFailed,
    messages.publishFailed("Slack", "https://eos.example.test/l10"),
    messages.publishUncertain("https://eos.example.test/l10"),
  ].map((m) => `• ${m}`).join("\n"),
]);

const out = [
  "# Vistas previas de los mensajes de Slack",
  "",
  "> Generado con `npx tsx scripts/preview-report.ts --write`. **Datos de prueba**: nombres, cifras y enlaces son ficticios. No se envió nada.",
  "",
  ...sections.flatMap(([title, body]) => [`## ${title}`, "", "```", body, "```", ""]),
].join("\n");

if (process.argv.includes("--write")) {
  writeFileSync("docs/management-report-previews.md", out);
  console.log("Escrito docs/management-report-previews.md");
} else {
  console.log(out);
}
