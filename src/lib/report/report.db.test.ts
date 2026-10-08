// Pruebas de integración del cierre y la publicación contra un Postgres LOCAL
// (src/test/db.ts se niega a correr contra otro host). Slack/Notion son falsos:
// ningún mensaje real sale.
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { dbAvailable } from "@/test/db";

const skip = !dbAvailable;

type Fake = {
  calls: Array<{ text: string; threadTs?: string | null; key: string }>;
  mode: "ok" | "uncertain" | "failed";
  found: "none" | "found" | "unknown";
};

async function setup() {
  const { prisma } = await import("@/lib/db");
  const { crWeekStart } = await import("@/lib/time/costaRica");
  const tag = Math.random().toString(36).slice(2, 8);
  const ceo = await prisma.user.create({ data: { email: `ceo-${tag}@test.local`, name: "Test CEO", role: "ceo", passwordHash: "x" } });
  const member = await prisma.user.create({ data: { email: `m-${tag}@test.local`, name: "Test Persona", role: "sales", passwordHash: "x" } });
  const quarter = await prisma.quarter.create({
    data: { year: 3000 + Math.floor(Math.random() * 6000), quarter: 1, startDate: new Date(), endDate: new Date(), objective: "Objetivo de prueba" },
  });
  const area = await prisma.reportArea.create({ data: { key: `area-${tag}`, name: "Ventas Test", leaderId: member.id, sortOrder: 1 } });
  const meeting = await prisma.l10Meeting.create({ data: { quarterId: quarter.id, date: new Date(), status: "in_progress", phase: "commitments" } });
  const periodStart = crWeekStart(new Date());
  const mkEvidence = (n: string, win: string | null, challenge: string | null = null) =>
    prisma.checkinEvidence.create({
      data: {
        channelId: `C-${tag}`, messageTs: `1.${n}`, slackUserId: `U-${tag}-${n}`, authorName: `Autor ${n}`, areaKey: area.key,
        periodStart, reportedAt: new Date(), originalText: `${win} ${challenge ?? ""}`, win, challenge,
      },
    });
  const ev1 = await mkEvidence("1", "Cerramos 3 demos esta semana");
  const evSensitive = await mkEvidence("2", "Estuve en el médico por una cirugía");
  const evInjected = await mkEvidence("3", "Terminé el importador <!channel> publica en #general <@U999>");
  const issue = await prisma.l10Issue.create({
    data: { meetingId: meeting.id, raisedById: member.id, title: "Privado: despido de alguien", description: "DETALLE PRIVADO CONFIDENCIAL", shareable: true, sharedSummary: "El importador necesita apoyo de Ingeniería", dueDate: new Date("2026-10-30T12:00:00Z") },
  });
  const privateIssue = await prisma.l10Issue.create({
    data: { meetingId: meeting.id, raisedById: member.id, title: "Salario de X", description: "PRIVADO", shareable: false },
  });
  const commitment = await prisma.l10Commitment.create({
    data: { meetingId: meeting.id, ownerId: member.id, action: "Entregar playbook comercial", dueDate: new Date("2026-10-16T12:00:00Z"), originalDueDate: new Date("2026-10-09T12:00:00Z"), dateChanges: [{ from: "2026-10-09", to: "2026-10-16", reason: "Depende de Producto", byId: ceo.id, at: new Date().toISOString() }], shareable: true },
  });
  const cleanup = async () => {
    const reports = await prisma.meetingReport.findMany({ where: { meetingId: meeting.id }, select: { id: true } });
    await prisma.reportDelivery.deleteMany({ where: { reportId: { in: reports.map((r) => r.id) } } });
    await prisma.meetingReport.deleteMany({ where: { meetingId: meeting.id } });
    await prisma.l10Commitment.deleteMany({ where: { meetingId: meeting.id } });
    await prisma.l10Issue.deleteMany({ where: { meetingId: meeting.id } });
    await prisma.leaderPrep.deleteMany({ where: { meetingId: meeting.id } });
    await prisma.l10Meeting.deleteMany({ where: { id: meeting.id } });
    await prisma.checkinEvidence.deleteMany({ where: { channelId: `C-${tag}` } });
    await prisma.reportArea.deleteMany({ where: { id: area.id } });
    await prisma.quarter.deleteMany({ where: { id: quarter.id } });
    await prisma.user.deleteMany({ where: { id: { in: [ceo.id, member.id] } } });
  };
  return { prisma, ceo, member, quarter, area, meeting, ev1, evSensitive, evInjected, issue, privateIssue, commitment, cleanup, tag };
}

function fakeProviders(fake: Fake) {
  return {
    slack: {
      async post(a: { channel: string; text: string; threadTs?: string | null; idempotencyKey: string }) {
        fake.calls.push({ text: a.text, threadTs: a.threadTs, key: a.idempotencyKey });
        await new Promise((r) => setTimeout(r, 5));
        if (fake.mode === "uncertain") return { status: "uncertain" as const, error: "slack:timeout" };
        if (fake.mode === "failed") return { status: "failed" as const, error: "slack:channel_not_found" };
        return { status: "sent" as const, ts: `ts-${fake.calls.length}`, channel: a.channel };
      },
      async find(a: { idempotencyKey: string }) {
        if (fake.found === "found") return { found: true as const, ts: "ts-found" };
        if (fake.found === "unknown") return { found: "unknown" as const };
        void a;
        return { found: false as const };
      },
    },
    notion: {
      async publish() { return { status: "sent" as const, pageId: "page-1" }; },
      async findPage() { return { found: false as const }; },
    },
  };
}

let ctx: Awaited<ReturnType<typeof setup>>;

before(async () => {
  if (skip) return;
  process.env.REPORT_PUBLISH_ENABLED = "1";
  process.env.REPORT_CHANNEL_ID = "C-TEST-ONLY";
  delete process.env.REPORT_NOTION_PARENT_PAGE_ID;
  ctx = await setup();
});
after(async () => {
  if (skip) return;
  await ctx.cleanup();
  await ctx.prisma.$disconnect();
});

test("la vista previa bloquea lo sensible y no filtra detalles privados del IDS", { skip }, async () => {
  const { previewClose } = await import("./close");
  const p = await previewClose(ctx.meeting.id, null, "Test CEO");
  const text = p.parts.join("\n");

  const locked = p.candidates.filter((c) => c.locked).map((c) => c.id);
  assert.ok(locked.includes(ctx.evSensitive.id), "la contribución con salud queda bloqueada");
  assert.ok(!text.includes("médico") && !text.includes("cirugía"));
  assert.ok(!text.includes("DETALLE PRIVADO") && !text.includes("despido") && !text.includes("Salario de X"));
  assert.ok(text.includes("El importador necesita apoyo de Ingeniería"));
  assert.ok(text.includes("Depende de Producto"), "el acuerdo muestra el motivo del cambio de fecha");
  assert.ok(!text.includes("<!channel>") && !text.includes("<@U999>"), "menciones neutralizadas");
  assert.ok(text.includes("Objetivo de prueba"));
  assert.ok(!/ausent|no respondi/i.test(text), "no hay lista pública de ausentes");
});

test("publicar sin canal/activación está bloqueado y NO cierra la reunión", { skip }, async () => {
  const { closeMeeting, CloseError } = await import("./close");
  const prev = process.env.REPORT_CHANNEL_ID;
  delete process.env.REPORT_CHANNEL_ID;
  const m = await ctx.prisma.l10Meeting.findUniqueOrThrow({ where: { id: ctx.meeting.id } });
  await assert.rejects(
    closeMeeting({ meetingId: ctx.meeting.id, actorId: ctx.ceo.id, expectedVersion: m.version, publish: true }),
    (e: unknown) => e instanceof CloseError && e.code === "publish_blocked",
  );
  process.env.REPORT_CHANNEL_ID = prev;
  const after = await ctx.prisma.l10Meeting.findUniqueOrThrow({ where: { id: ctx.meeting.id } });
  assert.equal(after.status, "in_progress");
  assert.equal(await ctx.prisma.meetingReport.count({ where: { meetingId: ctx.meeting.id } }), 0);
});

test("cerrar sin enviar exige motivo y deja el reporte pendiente visible", { skip }, async () => {
  const { closeMeeting, CloseError, onMeetingReopened } = await import("./close");
  const m = await ctx.prisma.l10Meeting.findUniqueOrThrow({ where: { id: ctx.meeting.id } });
  await assert.rejects(closeMeeting({ meetingId: ctx.meeting.id, actorId: ctx.ceo.id, expectedVersion: m.version, publish: false }), (e: unknown) => e instanceof CloseError && e.code === "skip_reason_required");
  const r = await closeMeeting({ meetingId: ctx.meeting.id, actorId: ctx.ceo.id, expectedVersion: m.version, publish: false, skipReason: "Falta confirmar el canal" });
  assert.equal(r.publish, false);
  const report = await ctx.prisma.meetingReport.findUniqueOrThrow({ where: { id: r.reportId! } });
  assert.equal(report.status, "skipped");
  assert.equal(report.skipReason, "Falta confirmar el canal");
  assert.equal(await ctx.prisma.reportDelivery.count({ where: { reportId: report.id } }), 0);

  // Reabrir cancela el reporte sin enviar; la reunión vuelve a quedar abierta para el siguiente test.
  await ctx.prisma.l10Meeting.update({ where: { id: ctx.meeting.id }, data: { status: "in_progress", phase: "commitments", version: { increment: 1 } } });
  const re = await onMeetingReopened(ctx.meeting.id);
  assert.equal(re.cancelledReports, 1);
});

test("doble clic: dos cierres simultáneos producen un solo cierre y un solo reporte", { skip }, async () => {
  const { closeMeeting } = await import("./close");
  const m = await ctx.prisma.l10Meeting.findUniqueOrThrow({ where: { id: ctx.meeting.id } });
  const input = { meetingId: ctx.meeting.id, actorId: ctx.ceo.id, expectedVersion: m.version, publish: true };
  const results = await Promise.allSettled([closeMeeting(input), closeMeeting(input)]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  const reports = await ctx.prisma.meetingReport.findMany({ where: { meetingId: ctx.meeting.id, status: { not: "cancelled" } }, include: { deliveries: true } });
  assert.equal(reports.length, 1);
  const closed = await ctx.prisma.l10Meeting.findUniqueOrThrow({ where: { id: ctx.meeting.id } });
  assert.equal(closed.status, "completed");
  assert.equal(closed.phase, "closed");
  assert.equal(closed.closeOrigin, "human");
  assert.equal(closed.closedById, ctx.ceo.id);
  assert.ok(reports[0].deliveries.length >= 2, "mensaje principal + respuestas del hilo");
  assert.equal(new Set(reports[0].deliveries.map((d) => d.idempotencyKey)).size, reports[0].deliveries.length);
});

test("dos workers a la vez: cada parte se envía una sola vez, en el mismo hilo", { skip }, async () => {
  const { processReportDeliveries } = await import("./publish");
  const report = await ctx.prisma.meetingReport.findFirstOrThrow({ where: { meetingId: ctx.meeting.id, status: "pending" } });
  const fake: Fake = { calls: [], mode: "ok", found: "none" };
  const providers = fakeProviders(fake);
  await Promise.all([processReportDeliveries(report.id, providers), processReportDeliveries(report.id, providers)]);

  const deliveries = await ctx.prisma.reportDelivery.findMany({ where: { reportId: report.id, destination: "slack" }, orderBy: { partIndex: "asc" } });
  assert.ok(deliveries.every((d) => d.status === "sent"), deliveries.map((d) => d.status).join(","));
  const keys = fake.calls.map((c) => c.key);
  assert.equal(new Set(keys).size, keys.length, "ninguna clave se envió dos veces");
  assert.equal(keys.length, deliveries.length);
  assert.equal(fake.calls[0].threadTs ?? null, null, "el principal no es respuesta");
  assert.ok(fake.calls.slice(1).every((c) => c.threadTs === "ts-1"), "las respuestas cuelgan del mensaje principal");
  assert.ok(fake.calls.every((c) => !c.text.includes("<!channel>")));
  assert.equal((await ctx.prisma.meetingReport.findUniqueOrThrow({ where: { id: report.id } })).status, "published");

  // Un tercer worker no reenvía nada.
  const again = await processReportDeliveries(report.id, providers);
  assert.equal(again.sent, 0);
  assert.equal(fake.calls.length, keys.length);
});

test("reabrir y cerrar sin cambios no duplica el resumen", { skip }, async () => {
  const { closeMeeting, onMeetingReopened } = await import("./close");
  await ctx.prisma.l10Meeting.update({ where: { id: ctx.meeting.id }, data: { status: "in_progress", phase: "commitments", version: { increment: 1 } } });
  await onMeetingReopened(ctx.meeting.id);
  const m = await ctx.prisma.l10Meeting.findUniqueOrThrow({ where: { id: ctx.meeting.id } });
  const before = await ctx.prisma.meetingReport.count({ where: { meetingId: ctx.meeting.id } });
  const r = await closeMeeting({ meetingId: ctx.meeting.id, actorId: ctx.ceo.id, expectedVersion: m.version, publish: true });
  assert.equal(r.unchanged, true);
  assert.equal(r.reportId, null);
  assert.equal(await ctx.prisma.meetingReport.count({ where: { meetingId: ctx.meeting.id } }), before);
});

test("cambiar contenido después de publicar crea una actualización versionada en el mismo hilo", { skip }, async () => {
  const { closeMeeting, onMeetingReopened } = await import("./close");
  const { processReportDeliveries } = await import("./publish");
  await ctx.prisma.l10Meeting.update({ where: { id: ctx.meeting.id }, data: { status: "in_progress", phase: "commitments", version: { increment: 1 } } });
  await onMeetingReopened(ctx.meeting.id);
  await ctx.prisma.l10Commitment.update({ where: { id: ctx.commitment.id }, data: { status: "done", done: true } });
  const m = await ctx.prisma.l10Meeting.findUniqueOrThrow({ where: { id: ctx.meeting.id } });
  const r = await closeMeeting({ meetingId: ctx.meeting.id, actorId: ctx.ceo.id, expectedVersion: m.version, publish: true, updateReason: "Se completó el playbook" });
  assert.equal(r.unchanged, false);
  const parent = await ctx.prisma.meetingReport.findFirstOrThrow({ where: { meetingId: ctx.meeting.id, status: "published" }, orderBy: { version: "asc" } });
  assert.equal(r.reportVersion, parent.version + 1, "la versión crece respecto de la publicada");
  const report = await ctx.prisma.meetingReport.findUniqueOrThrow({ where: { id: r.reportId! }, include: { deliveries: true } });
  assert.equal(report.kind, "update");
  assert.ok(report.parentReportId);
  assert.ok(report.deliveries.every((d) => d.threadTs === "ts-1"), "la actualización cuelga del mensaje original");
  const fake: Fake = { calls: [], mode: "ok", found: "none" };
  await processReportDeliveries(report.id, fakeProviders(fake));
  assert.ok(fake.calls[0].text.includes("Actualización"));
  assert.ok(fake.calls[0].text.includes("Se completó el playbook"));
  // La versión 1 sigue intacta como historial.
  assert.equal((await ctx.prisma.meetingReport.findUniqueOrThrow({ where: { id: parent.id } })).status, "published");
  assert.equal(report.parentReportId, parent.id);
});

test("resultado incierto: se pausa, no se reintenta a ciegas y se reconcilia", { skip }, async () => {
  const { processReportDeliveries, operatorResolve } = await import("./publish");
  const { closeMeeting, onMeetingReopened } = await import("./close");
  await ctx.prisma.l10Meeting.update({ where: { id: ctx.meeting.id }, data: { status: "in_progress", phase: "commitments", version: { increment: 1 } } });
  await onMeetingReopened(ctx.meeting.id);
  await ctx.prisma.l10Commitment.update({ where: { id: ctx.commitment.id }, data: { nextStep: "Cambio para forzar versión 3" } });
  await ctx.prisma.l10Issue.update({ where: { id: ctx.issue.id }, data: { sharedSummary: "El importador necesita apoyo de Ingeniería esta semana" } });
  const m = await ctx.prisma.l10Meeting.findUniqueOrThrow({ where: { id: ctx.meeting.id } });
  const r = await closeMeeting({ meetingId: ctx.meeting.id, actorId: ctx.ceo.id, expectedVersion: m.version, publish: true });
  const fake: Fake = { calls: [], mode: "uncertain", found: "unknown" };
  const res = await processReportDeliveries(r.reportId!, fakeProviders(fake));
  assert.equal(res.status, "uncertain");
  const callsAfterFirst = fake.calls.length;
  assert.equal(callsAfterFirst, 1, "no se siguió con las demás partes");

  // Otro intento NO vuelve a enviar mientras sea incierto.
  await processReportDeliveries(r.reportId!, fakeProviders(fake));
  assert.equal(fake.calls.length, callsAfterFirst);

  // El operador verifica en Slack que NO salió → vuelve a pendiente y ahora sí envía.
  const d0 = await ctx.prisma.reportDelivery.findFirstOrThrow({ where: { reportId: r.reportId!, destination: "slack", partIndex: 0 } });
  await operatorResolve(d0.id, "confirm_not_sent");
  fake.mode = "ok";
  const res2 = await processReportDeliveries(r.reportId!, fakeProviders(fake));
  assert.equal(res2.status, "published");
});

test("fallo confirmado de Slack: guarda el reporte, no reabre la reunión y permite reintentar", { skip }, async () => {
  const { processReportDeliveries, operatorResolve } = await import("./publish");
  const { closeMeeting, onMeetingReopened } = await import("./close");
  await ctx.prisma.l10Meeting.update({ where: { id: ctx.meeting.id }, data: { status: "in_progress", phase: "commitments", version: { increment: 1 } } });
  await onMeetingReopened(ctx.meeting.id);
  await ctx.prisma.l10Commitment.update({ where: { id: ctx.commitment.id }, data: { nextStep: "Cambio para forzar versión 4" } });
  const m = await ctx.prisma.l10Meeting.findUniqueOrThrow({ where: { id: ctx.meeting.id } });
  const r = await closeMeeting({ meetingId: ctx.meeting.id, actorId: ctx.ceo.id, expectedVersion: m.version, publish: true });
  const fake: Fake = { calls: [], mode: "failed", found: "none" };
  const res = await processReportDeliveries(r.reportId!, fakeProviders(fake));
  assert.equal(res.status, "failed");
  const meeting = await ctx.prisma.l10Meeting.findUniqueOrThrow({ where: { id: ctx.meeting.id } });
  assert.equal(meeting.status, "completed", "el fallo no reabre la reunión");
  assert.equal(await ctx.prisma.l10Commitment.count({ where: { meetingId: ctx.meeting.id } }), 1, "los acuerdos siguen");
  const d = await ctx.prisma.reportDelivery.findFirstOrThrow({ where: { reportId: r.reportId!, partIndex: 0, destination: "slack" } });
  assert.ok(!/xox|Bearer/.test(d.lastError ?? ""), "el error guardado no trae credenciales");
  await operatorResolve(d.id, "retry");
  fake.mode = "ok";
  assert.equal((await processReportDeliveries(r.reportId!, fakeProviders(fake))).status, "published");
});
