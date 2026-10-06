// Publicación del resumen de management como trabajo persistido.
//
// El cierre de reunión guarda el snapshot y las filas de entrega en una misma
// transacción; este módulo las envía. Garantías:
//   - una entrega lógica por (reunión, versión, audiencia, destino, parte):
//     idempotencyKey única en la base;
//   - dos workers (o doble clic) no pueden enviar la misma entrega: cada una se
//     reclama con un UPDATE condicional atómico;
//   - si el proveedor pudo aceptar el mensaje pero no hubo respuesta, se
//     reconcilia contra el proveedor antes de reenviar; si no se puede saber,
//     queda "uncertain" y se pide revisión del operador. Nada se reintenta a ciegas;
//   - un fallo no reabre la reunión ni toca los acuerdos.

import { prisma } from "@/lib/db";
import { notionParentPageId } from "./config";
import { realNotionProvider, realSlackProvider, safeError, type NotionProvider, type SlackProvider } from "./providers";

export const LOCK_MS = 2 * 60 * 1000;
export const MAX_ATTEMPTS = 5;

export type Providers = { slack: SlackProvider; notion: NotionProvider };
const REAL: Providers = { slack: realSlackProvider, notion: realNotionProvider };

export function deliveryKey(meetingId: string, version: number, audience: string, destination: string, partIndex: number): string {
  return `${meetingId}:v${version}:${audience}:${destination}:${partIndex}`;
}

export type ReportContent = {
  snapshot: import("./types").MeetingReportSnapshot;
  // Texto exacto que se publica, ya partido para Slack.
  parts: string[];
  // Título de la proyección en Notion.
  notionTitle: string;
};

type Tx = Pick<typeof prisma, "reportDelivery">;

// Filas de entrega para un reporte (se crean dentro de la transacción de cierre).
export async function createDeliveries(
  tx: Tx,
  args: { reportId: string; meetingId: string; version: number; audience: string; partCount: number; includeNotion: boolean; threadTs?: string | null; channel: string },
): Promise<void> {
  const rows = Array.from({ length: args.partCount }, (_, i) => ({
    reportId: args.reportId,
    destination: "slack",
    partIndex: i,
    idempotencyKey: deliveryKey(args.meetingId, args.version, args.audience, "slack", i),
    status: "pending",
    providerChannel: args.channel,
    // Una actualización cuelga del mensaje principal original.
    threadTs: args.threadTs ?? null,
  }));
  if (args.includeNotion) {
    rows.push({
      reportId: args.reportId,
      destination: "notion",
      partIndex: 0,
      idempotencyKey: deliveryKey(args.meetingId, args.version, args.audience, "notion", 0),
      status: "pending",
      providerChannel: args.channel,
      threadTs: null,
    });
  }
  await tx.reportDelivery.createMany({ data: rows, skipDuplicates: true });
}

async function claim(id: string, now: Date): Promise<boolean> {
  const res = await prisma.reportDelivery.updateMany({
    where: {
      id,
      status: { in: ["pending", "failed"] },
      attempts: { lt: MAX_ATTEMPTS },
      OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }],
    },
    data: { status: "sending", lockedUntil: new Date(now.getTime() + LOCK_MS), attempts: { increment: 1 } },
  });
  return res.count === 1;
}

async function finish(id: string, data: { status: string; providerMessageId?: string | null; providerChannel?: string | null; threadTs?: string | null; lastError?: string | null }) {
  await prisma.reportDelivery.update({
    where: { id },
    data: { ...data, lockedUntil: null, sentAt: data.status === "sent" ? new Date() : undefined },
  });
}

// Una entrega que quedó "sending" con el candado vencido: el worker anterior
// pudo haber enviado. Se reconcilia antes de cualquier reenvío.
async function recoverStale(report: { channel: string | null; createdAt: Date }, d: { id: string; destination: string; idempotencyKey: string; threadTs: string | null; providerChannel: string | null }, providers: Providers, now: Date) {
  const res = await prisma.reportDelivery.updateMany({
    where: { id: d.id, status: "sending", lockedUntil: { lt: now } },
    data: { status: "uncertain", lockedUntil: null, lastError: "worker interrumpido; reconciliando" },
  });
  if (res.count === 0) return;
  await reconcile(report, d, providers);
}

export async function reconcile(
  report: { channel: string | null; createdAt: Date },
  d: { id: string; destination: string; idempotencyKey: string; threadTs: string | null; providerChannel: string | null },
  providers: Providers,
): Promise<"sent" | "not_found" | "unknown"> {
  if (d.destination === "slack") {
    const channel = d.providerChannel ?? report.channel;
    if (!channel) return "unknown";
    const found = await providers.slack.find({ channel, threadTs: d.threadTs, idempotencyKey: d.idempotencyKey, since: report.createdAt });
    if (found.found === true) {
      await finish(d.id, { status: "sent", providerMessageId: found.ts, providerChannel: channel, lastError: null });
      return "sent";
    }
    if (found.found === false) {
      // Sin rastro en el proveedor: es seguro volver a intentarlo.
      await prisma.reportDelivery.update({ where: { id: d.id }, data: { status: "pending", lastError: "no estaba en Slack; se reintentará" } });
      return "not_found";
    }
    return "unknown";
  }
  const parent = notionParentPageId();
  const meta = await prisma.reportDelivery.findUnique({ where: { id: d.id }, include: { report: true } });
  const content = meta?.report.content as unknown as ReportContent | undefined;
  if (!parent || !content) return "unknown";
  const found = await providers.notion.findPage({ parentPageId: parent, title: content.notionTitle });
  if (found.found === true) {
    await finish(d.id, { status: "sent", providerMessageId: found.pageId, lastError: null });
    return "sent";
  }
  if (found.found === false) {
    await prisma.reportDelivery.update({ where: { id: d.id }, data: { status: "pending", lastError: "no estaba en Notion; se reintentará" } });
    return "not_found";
  }
  return "unknown";
}

export type ProcessResult = {
  reportId: string;
  status: string;
  sent: number;
  failed: number;
  uncertain: number;
  skipped: number;
};

export async function processReportDeliveries(reportId: string, providers: Providers = REAL, now = new Date()): Promise<ProcessResult> {
  const report = await prisma.meetingReport.findUnique({ where: { id: reportId }, include: { deliveries: { orderBy: [{ destination: "asc" }, { partIndex: "asc" }] } } });
  if (!report) throw new Error("Reporte no encontrado");
  const result: ProcessResult = { reportId, status: report.status, sent: 0, failed: 0, uncertain: 0, skipped: 0 };
  if (["cancelled", "skipped"].includes(report.status)) return result;

  const content = report.content as unknown as ReportContent;

  // Primero recuperar entregas atascadas.
  for (const d of report.deliveries.filter((x) => x.status === "sending" && x.lockedUntil && x.lockedUntil < now)) {
    await recoverStale(report, d, providers, now);
  }

  const fresh = await prisma.reportDelivery.findMany({ where: { reportId }, orderBy: [{ destination: "asc" }, { partIndex: "asc" }] });
  let mainTs: string | null = fresh.find((d) => d.destination === "slack" && d.partIndex === 0 && d.status === "sent")?.providerMessageId ?? null;

  for (const d of fresh) {
    if (d.status === "sent") continue;
    if (d.status === "uncertain") {
      result.uncertain++;
      if (d.destination === "slack" && d.partIndex === 0) break; // el hilo depende de la parte principal
      continue;
    }
    if (d.status === "cancelled") continue;

    // Las respuestas esperan al mensaje principal (o al original si es una actualización).
    const threadTs = d.destination === "slack" ? (d.partIndex === 0 ? d.threadTs : (d.threadTs ?? mainTs)) : null;
    if (d.destination === "slack" && d.partIndex > 0 && !threadTs) {
      result.skipped++;
      continue;
    }

    // Reconciliar antes de reenviar cuando un intento previo pudo haber llegado.
    if (d.attempts > 0 && d.status === "failed" && d.lastError?.startsWith("incierto")) {
      const r = await reconcile(report, d, providers);
      if (r === "unknown") {
        await finish(d.id, { status: "uncertain", lastError: "incierto: no se pudo verificar" });
        result.uncertain++;
        continue;
      }
      if (r === "sent") {
        result.sent++;
        if (d.destination === "slack" && d.partIndex === 0) {
          mainTs = (await prisma.reportDelivery.findUnique({ where: { id: d.id } }))?.providerMessageId ?? mainTs;
        }
        continue;
      }
    }

    if (!(await claim(d.id, now))) {
      result.skipped++; // otro worker la tiene
      continue;
    }

    if (d.destination === "slack") {
      const channel = d.providerChannel ?? report.channel;
      const text = content.parts[d.partIndex];
      if (!channel || text === undefined) {
        await finish(d.id, { status: "failed", lastError: "destino o texto faltante" });
        result.failed++;
        continue;
      }
      const res = await providers.slack.post({ channel, text, threadTs, idempotencyKey: d.idempotencyKey });
      if (res.status === "sent") {
        await finish(d.id, { status: "sent", providerMessageId: res.ts, providerChannel: res.channel, threadTs: threadTs ?? res.ts, lastError: null });
        if (d.partIndex === 0) mainTs = res.ts;
        result.sent++;
      } else if (res.status === "uncertain") {
        // Pudo haberse publicado: pausar y reconciliar, no reintentar a ciegas.
        await finish(d.id, { status: "uncertain", lastError: safeError(res.error) });
        result.uncertain++;
        if (d.partIndex === 0) break;
      } else {
        await finish(d.id, { status: "failed", lastError: safeError(res.error) });
        result.failed++;
        if (d.partIndex === 0) break;
      }
    } else {
      const parent = notionParentPageId();
      if (!parent) {
        await finish(d.id, { status: "failed", lastError: "REPORT_NOTION_PARENT_PAGE_ID no configurado" });
        result.failed++;
        continue;
      }
      const existing = report.kind === "update" ? await findParentNotionPage(report.parentReportId) : null;
      const res = await providers.notion.publish({
        parentPageId: parent,
        title: content.notionTitle,
        text: content.parts.join("\n\n"),
        existingPageId: existing,
        heading: report.kind === "update" ? `Actualización v${report.version}` : null,
      });
      if (res.status === "sent") {
        await finish(d.id, { status: "sent", providerMessageId: res.pageId, lastError: null });
        result.sent++;
      } else if (res.status === "uncertain") {
        await finish(d.id, { status: "uncertain", lastError: safeError(res.error) });
        result.uncertain++;
      } else {
        await finish(d.id, { status: "failed", lastError: safeError(res.error) });
        result.failed++;
      }
    }
  }

  result.status = await refreshReportStatus(reportId);
  return result;
}

async function findParentNotionPage(parentReportId: string | null): Promise<string | null> {
  if (!parentReportId) return null;
  const d = await prisma.reportDelivery.findFirst({ where: { reportId: parentReportId, destination: "notion", status: "sent" } });
  return d?.providerMessageId ?? null;
}

// Estado del reporte derivado de sus entregas. Una entrega de Notion fallida no
// bloquea que el reporte cuente como publicado si Slack ya salió.
export async function refreshReportStatus(reportId: string): Promise<string> {
  const report = await prisma.meetingReport.findUnique({ where: { id: reportId }, include: { deliveries: true } });
  if (!report) throw new Error("Reporte no encontrado");
  if (["cancelled", "skipped"].includes(report.status)) return report.status;

  const slack = report.deliveries.filter((d) => d.destination === "slack");
  let status = "pending";
  if (slack.length > 0 && slack.every((d) => d.status === "sent")) status = "published";
  else if (slack.some((d) => d.status === "uncertain")) status = "uncertain";
  else if (slack.some((d) => d.status === "failed")) status = "failed";
  else if (slack.some((d) => d.status === "sending")) status = "publishing";
  else if (slack.some((d) => d.status === "sent")) status = "publishing"; // parcial: falta continuar el hilo

  if (status !== report.status) await prisma.meetingReport.update({ where: { id: reportId }, data: { status } });
  return status;
}

// Cancela lo pendiente de una versión (reabrir antes del envío). Lo ya
// publicado no se toca: queda como registro histórico.
export async function cancelPendingDeliveries(reportId: string): Promise<number> {
  const res = await prisma.reportDelivery.updateMany({
    where: { reportId, status: { in: ["pending", "failed"] } },
    data: { status: "cancelled", lockedUntil: null },
  });
  return res.count;
}

// Acciones del operador sobre una entrega.
export async function operatorResolve(
  deliveryId: string,
  action: "retry" | "confirm_sent" | "confirm_not_sent",
  extra?: { messageTs?: string },
): Promise<void> {
  const d = await prisma.reportDelivery.findUnique({ where: { id: deliveryId } });
  if (!d) throw new Error("Entrega no encontrada");
  if (action === "confirm_sent") {
    await finish(d.id, { status: "sent", providerMessageId: extra?.messageTs ?? d.providerMessageId, lastError: "confirmada por el operador" });
  } else if (action === "confirm_not_sent") {
    await prisma.reportDelivery.update({ where: { id: d.id }, data: { status: "pending", lockedUntil: null, lastError: "el operador confirmó que no se publicó" } });
  } else if (d.status === "failed") {
    await prisma.reportDelivery.update({ where: { id: d.id }, data: { attempts: 0, lockedUntil: null } });
  } else {
    throw new Error("Solo se puede reintentar una entrega fallida; las inciertas requieren verificar primero.");
  }
  await refreshReportStatus(d.reportId);
}
