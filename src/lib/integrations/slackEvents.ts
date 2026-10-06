// Recepción duradera e idempotente de eventos de Slack.
//
// Orden: verificar firma (en la ruta) → persistir el evento por event_id →
// responder 200 → procesar en segundo plano. Un reintento de Slack con el
// mismo event_id no vuelve a procesar un evento ya terminado; uno que quedó
// sin procesar (falló la vez anterior) sí puede reprocesarse.

import { safeErrorLabel } from "./checkinStore";
import type { SlackMessageEvent } from "./checkin";

export type SlackEventRow = {
  eventId: string;
  processedAt: Date | null;
  attempts: number;
};

export type SlackEventStore = {
  // Crea el evento; si el event_id ya existe devuelve la fila existente.
  create(data: {
    eventId: string; eventType: string; channelId: string | null; messageTs: string | null;
  }): Promise<{ row: SlackEventRow; created: boolean }>;
  markAttempt(eventId: string): Promise<void>;
  markProcessed(eventId: string): Promise<void>;
  markFailed(eventId: string, safeError: string): Promise<void>;
};

export const prismaSlackEventStore: SlackEventStore = {
  async create(data) {
    const { prisma } = await import("@/lib/db");
    try {
      const row = await prisma.slackEvent.create({ data });
      return { row, created: true };
    } catch (error) {
      if ((error as { code?: string }).code !== "P2002") throw error;
      const row = await prisma.slackEvent.findUnique({ where: { eventId: data.eventId } });
      if (!row) throw error;
      return { row, created: false };
    }
  },
  async markAttempt(eventId) {
    const { prisma } = await import("@/lib/db");
    await prisma.slackEvent.update({ where: { eventId }, data: { attempts: { increment: 1 } } });
  },
  async markProcessed(eventId) {
    const { prisma } = await import("@/lib/db");
    await prisma.slackEvent.update({ where: { eventId }, data: { processedAt: new Date(), lastError: null } });
  },
  async markFailed(eventId, safeError) {
    const { prisma } = await import("@/lib/db");
    await prisma.slackEvent.update({ where: { eventId }, data: { lastError: safeError.slice(0, 200) } });
  },
};

export type SlackEventKind = "dm" | "checkin_message" | "checkin_edit" | "checkin_delete";

export type ClassifiedEvent = {
  kind: SlackEventKind;
  channelId: string;
  messageTs: string | null;
};

// Solo se persisten (y procesan) los eventos que nos interesan: mensajes
// humanos en DM, y mensajes/ediciones/borrados en el canal de check-ins.
export function classifySlackEvent(
  event: SlackMessageEvent | undefined,
  checkinChannel: string | undefined,
): ClassifiedEvent | null {
  if (!event || event.type !== "message" || !event.channel) return null;

  if (event.subtype === "message_changed") {
    const m = event.message;
    if (event.channel !== checkinChannel || !m?.ts || m.bot_id || (m.subtype && m.subtype !== "thread_broadcast")) return null;
    return { kind: "checkin_edit", channelId: event.channel, messageTs: m.ts };
  }
  if (event.subtype === "message_deleted") {
    if (event.channel !== checkinChannel || !event.deleted_ts) return null;
    return { kind: "checkin_delete", channelId: event.channel, messageTs: event.deleted_ts };
  }

  // Solo mensajes humanos normales: sin joins, sin bots.
  if (event.subtype || event.bot_id) return null;

  if (event.channel_type === "im") return { kind: "dm", channelId: event.channel, messageTs: event.ts ?? null };
  if (event.channel !== checkinChannel) return null;
  return { kind: "checkin_message", channelId: event.channel, messageTs: event.ts ?? null };
}

export type EventProcessors = {
  dm: (event: SlackMessageEvent) => Promise<void>;
  checkin_message: (event: SlackMessageEvent) => Promise<void>;
  checkin_edit: (event: SlackMessageEvent) => Promise<void>;
  checkin_delete: (event: SlackMessageEvent) => Promise<void>;
};

// ¿Este hilo cuelga de un resumen de management publicado? Las respuestas y
// reacciones de la gente a ese resumen no son check-ins: se ignoran sin gastar
// una llamada a Claude ni arriesgar que un comentario se guarde como aporte.
export async function prismaIsReportThread(channelId: string, threadTs: string): Promise<boolean> {
  const { prisma } = await import("@/lib/db");
  const found = await prisma.reportDelivery.findFirst({
    where: { destination: "slack", providerChannel: channelId, OR: [{ providerMessageId: threadTs }, { threadTs }] },
    select: { id: true },
  });
  return found !== null;
}

export type ReceiveDeps = {
  store: SlackEventStore;
  // Opcional: sin esto no se filtran los hilos del resumen.
  isReportThread?: (channelId: string, threadTs: string) => Promise<boolean>;
  processors: EventProcessors;
  checkinChannel: string | undefined;
  // `after` de Next.js (o un ejecutor en línea en pruebas).
  schedule: (task: () => Promise<void>) => void;
};

export type ReceiveResult = { status: 200 | 500; outcome: "ignored" | "duplicate" | "scheduled" | "persist_failed" };

// Ejecuta el procesamiento registrando intentos, éxito y un error seguro.
export async function runSlackEvent(
  store: SlackEventStore,
  eventId: string,
  task: () => Promise<void>,
): Promise<void> {
  try {
    await store.markAttempt(eventId);
    await task();
    await store.markProcessed(eventId);
  } catch (error) {
    console.error(`[slack-events] Falló el procesamiento (${safeErrorLabel(error)})`);
    try {
      await store.markFailed(eventId, safeErrorLabel(error));
    } catch {
      // El registro del error nunca debe tumbar el proceso.
    }
  }
}

export async function receiveSlackEvent(
  body: { event_id?: string; event?: SlackMessageEvent },
  deps: ReceiveDeps,
): Promise<ReceiveResult> {
  const event = body.event;
  const classified = classifySlackEvent(event, deps.checkinChannel);
  if (!classified || !event) return { status: 200, outcome: "ignored" };

  // Mensajes dentro del hilo de un resumen publicado: no son check-ins.
  if (deps.isReportThread && (classified.kind === "checkin_message" || classified.kind === "checkin_edit")) {
    const threadTs = classified.kind === "checkin_edit" ? event.message?.thread_ts : event.thread_ts;
    if (threadTs && threadTs !== classified.messageTs) {
      try {
        if (await deps.isReportThread(classified.channelId, threadTs)) return { status: 200, outcome: "ignored" };
      } catch {
        // Si la consulta falla seguimos el flujo normal: nunca se pierde un check-in.
      }
    }
  }

  // Sin event_id no hay forma de deduplicar (Slack siempre lo envía en event_callback).
  if (!body.event_id) return { status: 200, outcome: "ignored" };
  const eventId = body.event_id;

  let persisted: { row: SlackEventRow; created: boolean };
  try {
    persisted = await deps.store.create({
      eventId,
      eventType: classified.kind,
      channelId: classified.channelId,
      messageTs: classified.messageTs,
    });
  } catch (error) {
    // No se pudo guardar: 500 para que Slack reintente la entrega.
    console.error(`[slack-events] No se pudo persistir el evento (${safeErrorLabel(error)})`);
    return { status: 500, outcome: "persist_failed" };
  }

  if (!persisted.created) {
    if (persisted.row.processedAt) return { status: 200, outcome: "duplicate" };
    // Los DM no son idempotentes (wins, entradas de scorecard): un reintento
    // de un DM que ya intentó procesarse no se vuelve a ejecutar.
    if (classified.kind === "dm" && persisted.row.attempts > 0) return { status: 200, outcome: "duplicate" };
  }

  deps.schedule(() => runSlackEvent(deps.store, eventId, () => deps.processors[classified.kind](event)));
  return { status: 200, outcome: "scheduled" };
}
