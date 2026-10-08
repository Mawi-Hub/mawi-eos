// Comando explícito de cierre de reunión (+ publicación opcional).
//
// Es la ÚNICA ruta que crea un reporte publicable. Un PATCH genérico de
// status, el cron que cierra reuniones viejas, notas, fases o crear/iniciar una
// reunión nunca emiten publicación. El cierre, la intención de publicar y las
// filas de entrega se guardan en una misma transacción; el envío lo hace
// processReportDeliveries después.

import { prisma } from "@/lib/db";
import { crIsoDate, reportPeriodFor } from "@/lib/time/costaRica";
import { publishBlocker, reportChannel, notionParentPageId } from "./config";
import { createDeliveries, type ReportContent } from "./publish";
import { renderMeetingSummary } from "./render";
import { buildMeetingSnapshot, type Candidate, type InclusionChoice } from "./snapshot";

export class CloseError extends Error {
  constructor(
    public code: "not_found" | "not_open" | "version_conflict" | "preview_changed" | "publish_blocked" | "skip_reason_required" | "no_previous_thread",
    message: string,
    public extra: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

// Última versión realmente publicada (con algo enviado) de la reunión.
async function latestPublished(meetingId: string) {
  const reports = await prisma.meetingReport.findMany({
    where: { meetingId, status: { in: ["published", "publishing", "uncertain", "failed"] } },
    include: { deliveries: true },
    orderBy: { version: "desc" },
  });
  return reports.find((r) => r.deliveries.some((d) => d.destination === "slack" && d.partIndex === 0 && d.status === "sent")) ?? null;
}

export type ClosePreview = {
  meetingId: string;
  meetingVersion: number;
  status: string;
  fingerprint: string;
  parts: string[];
  candidates: Candidate[];
  channel: string | null;
  publishBlocker: string | null;
  previousVersion: number | null;
  unchangedSincePublished: boolean;
};

export async function previewClose(meetingId: string, choice: InclusionChoice | null, closedByName?: string): Promise<ClosePreview> {
  const meeting = await prisma.l10Meeting.findUnique({ where: { id: meetingId } });
  if (!meeting) throw new CloseError("not_found", "Reunión no encontrada");
  const previous = await latestPublished(meetingId);
  const built = await buildMeetingSnapshot(meetingId, {
    now: new Date(),
    choice,
    closedByName,
    previous: previous ? { version: previous.version, cutAt: previous.cutAt, contentFingerprint: previous.contentHash } : null,
  });
  return {
    meetingId,
    meetingVersion: meeting.version,
    status: meeting.status,
    fingerprint: built.fingerprint,
    parts: renderMeetingSummary(built.snapshot).parts,
    candidates: built.candidates,
    channel: reportChannel(),
    publishBlocker: publishBlocker(),
    previousVersion: previous?.version ?? null,
    unchangedSincePublished: !!previous && previous.contentHash === built.fingerprint,
  };
}

export type CloseInput = {
  meetingId: string;
  actorId: string;
  expectedVersion: number;
  publish: boolean;
  choice?: InclusionChoice | null;
  // Lo que el usuario vio en la vista previa: si cambió, no se envía.
  expectedFingerprint?: string | null;
  skipReason?: string | null;
  updateReason?: string | null;
  // Notas privadas del L10: se guardan en la reunión, nunca van al resumen.
  notes?: string | null;
};

export type CloseResult = {
  meetingId: string;
  reportId: string | null;
  reportVersion: number | null;
  publish: boolean;
  deliveriesCreated: boolean;
  unchanged: boolean;
};

export async function closeMeeting(input: CloseInput): Promise<CloseResult> {
  const meeting = await prisma.l10Meeting.findUnique({ where: { id: input.meetingId }, include: { quarter: true } });
  if (!meeting) throw new CloseError("not_found", "Reunión no encontrada");
  if (meeting.status !== "in_progress") {
    const existing = await prisma.meetingReport.findFirst({ where: { meetingId: input.meetingId }, orderBy: { version: "desc" } });
    throw new CloseError("not_open", "La reunión no está abierta (¿ya se cerró?).", { existingReportId: existing?.id ?? null });
  }
  if (meeting.version !== input.expectedVersion) {
    throw new CloseError("version_conflict", "La reunión cambió después de la vista previa. Revisá de nuevo.", { currentVersion: meeting.version });
  }

  const actor = await prisma.user.findUnique({ where: { id: input.actorId }, select: { name: true } });
  const previous = await latestPublished(input.meetingId);
  const now = new Date();
  const built = await buildMeetingSnapshot(input.meetingId, {
    now,
    choice: input.choice ?? null,
    closedByName: actor?.name ?? "—",
    previous: previous ? { version: previous.version, cutAt: previous.cutAt, contentFingerprint: previous.contentHash } : null,
    updateReason: input.updateReason ?? null,
  });

  if (input.expectedFingerprint && input.expectedFingerprint !== built.fingerprint) {
    throw new CloseError("preview_changed", "El contenido cambió desde la vista previa. Revisá el resumen de nuevo.", { fingerprint: built.fingerprint });
  }

  // Reabrir y cerrar sin cambios publicables no duplica el resumen.
  const unchanged = !!previous && previous.contentHash === built.fingerprint;
  const willPublish = input.publish && !unchanged;

  if (input.publish) {
    const blocker = publishBlocker();
    if (blocker && !unchanged) throw new CloseError("publish_blocked", blocker, { blocker });
  } else if (!input.skipReason?.trim() && !unchanged) {
    throw new CloseError("skip_reason_required", "Para cerrar sin enviar indicá el motivo.");
  }

  const period = meeting.periodStart && meeting.periodEnd ? { start: meeting.periodStart, end: meeting.periodEnd } : reportPeriodFor(meeting.date);
  const parts = renderMeetingSummary(built.snapshot).parts;
  const content: ReportContent = {
    snapshot: built.snapshot,
    parts,
    notionTitle: `Management ${crIsoDate(meeting.date)} · ${meeting.id.slice(0, 8)}`,
  };
  const channel = reportChannel();
  const includeNotion = willPublish && !!notionParentPageId();
  const parentMainTs = previous?.deliveries.find((d) => d.destination === "slack" && d.partIndex === 0)?.providerMessageId ?? null;
  if (willPublish && previous && !parentMainTs) {
    throw new CloseError("no_previous_thread", "No se encontró el mensaje original para enlazar la actualización.");
  }

  return prisma.$transaction(async (tx) => {
    // Cierre atómico: si dos clics llegan a la vez, solo uno cambia la fila.
    const closed = await tx.l10Meeting.updateMany({
      where: { id: meeting.id, status: "in_progress", version: input.expectedVersion },
      data: {
        status: "completed",
        phase: "closed",
        closeOrigin: "human",
        closedAt: now,
        closedById: input.actorId,
        periodStart: period.start,
        periodEnd: period.end,
        cutAt: now,
        version: { increment: 1 },
        ...(input.notes != null && { notes: input.notes }),
      },
    });
    if (closed.count !== 1) throw new CloseError("version_conflict", "La reunión ya se cerró o cambió.");

    // Lo que el usuario dejó incluido pasa a ser lo compartible; el resto no.
    const byKind = (k: Candidate["kind"]) => built.candidates.filter((c) => c.kind === k);
    const flag = async (k: Candidate["kind"], update: (ids: string[], shareable: boolean) => Promise<unknown>) => {
      const all = byKind(k).filter((c) => !c.locked);
      await update(all.filter((c) => c.included).map((c) => c.id), true);
      await update(all.filter((c) => !c.included).map((c) => c.id), false);
    };
    await flag("win", (ids, v) => tx.winChallenge.updateMany({ where: { id: { in: ids } }, data: { shareable: v } }));
    await flag("contribution", (ids, v) => tx.checkinEvidence.updateMany({ where: { id: { in: ids } }, data: { shareable: v } }));
    await flag("commitment", (ids, v) => tx.l10Commitment.updateMany({ where: { id: { in: ids } }, data: { shareable: v } }));
    await flag("issue", (ids, v) => tx.l10Issue.updateMany({ where: { id: { in: ids } }, data: { shareable: v } }));

    if (unchanged) {
      return { meetingId: meeting.id, reportId: null, reportVersion: previous?.version ?? null, publish: false, deliveriesCreated: false, unchanged: true };
    }

    const last = await tx.meetingReport.findFirst({ where: { meetingId: meeting.id }, orderBy: { version: "desc" }, select: { version: true } });
    const version = (last?.version ?? 0) + 1;
    const report = await tx.meetingReport.create({
      data: {
        meetingId: meeting.id,
        version,
        kind: previous ? "update" : "original",
        parentReportId: previous?.id ?? null,
        status: willPublish ? "pending" : "skipped",
        quarterId: meeting.quarterId,
        closeOrigin: "human",
        closedById: input.actorId,
        closedAt: now,
        periodStart: period.start,
        periodEnd: period.end,
        cutAt: now,
        audience: "company",
        channel,
        content: content as unknown as object,
        contentHash: built.fingerprint,
        publishRequested: willPublish,
        skipReason: willPublish ? null : (input.skipReason?.trim() ?? null),
      },
    });

    if (willPublish && channel) {
      await createDeliveries(tx, {
        reportId: report.id,
        meetingId: meeting.id,
        version,
        audience: "company",
        partCount: parts.length,
        includeNotion,
        threadTs: parentMainTs,
        channel,
      });
    }
    return { meetingId: meeting.id, reportId: report.id, reportVersion: version, publish: willPublish, deliveriesCreated: willPublish, unchanged: false };
  });
}

// Reabrir: lo que no se envió se cancela; lo ya publicado queda como historial.
export async function onMeetingReopened(meetingId: string): Promise<{ cancelledReports: number }> {
  const reports = await prisma.meetingReport.findMany({
    where: { meetingId, status: { in: ["pending", "failed", "skipped"] } },
    include: { deliveries: true },
  });
  let cancelled = 0;
  for (const r of reports) {
    const anySent = r.deliveries.some((d) => d.status === "sent");
    if (anySent) continue; // parcialmente publicado: no se cancela
    await prisma.reportDelivery.updateMany({ where: { reportId: r.id, status: { in: ["pending", "failed"] } }, data: { status: "cancelled", lockedUntil: null } });
    await prisma.meetingReport.update({ where: { id: r.id }, data: { status: "cancelled" } });
    cancelled++;
  }
  return { cancelledReports: cancelled };
}

// Publicar más tarde un reporte que se cerró sin enviar (cuando ya hay canal).
export async function publishSkippedReport(reportId: string): Promise<{ reportId: string }> {
  const report = await prisma.meetingReport.findUnique({ where: { id: reportId } });
  if (!report) throw new CloseError("not_found", "Reporte no encontrado");
  if (report.status !== "skipped") throw new CloseError("not_open", "Solo un reporte cerrado sin enviar se puede publicar después.");
  const blocker = publishBlocker();
  const channel = reportChannel();
  if (blocker || !channel) throw new CloseError("publish_blocked", blocker ?? "Falta el canal", { blocker });
  const content = report.content as unknown as ReportContent;
  const previous = await latestPublished(report.meetingId);
  const parentMainTs = previous?.deliveries.find((d) => d.destination === "slack" && d.partIndex === 0)?.providerMessageId ?? null;

  await prisma.$transaction(async (tx) => {
    const claimed = await tx.meetingReport.updateMany({ where: { id: reportId, status: "skipped" }, data: { status: "pending", publishRequested: true, channel, skipReason: null } });
    if (claimed.count !== 1) return;
    await createDeliveries(tx, {
      reportId,
      meetingId: report.meetingId,
      version: report.version,
      audience: report.audience,
      partCount: content.parts.length,
      includeNotion: !!notionParentPageId(),
      threadTs: previous && previous.id !== reportId ? parentMainTs : null,
      channel,
    });
  });
  return { reportId };
}
