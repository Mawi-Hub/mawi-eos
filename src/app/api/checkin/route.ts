import { after, NextResponse } from "next/server";
import {
  verifySlackSignature,
  processCheckinEvent,
  processCheckinEdit,
  processCheckinDelete,
} from "@/lib/integrations/checkin";
import { processKpiDmEvent } from "@/lib/integrations/kpiCheckin";
import { prismaSlackEventStore, receiveSlackEvent } from "@/lib/integrations/slackEvents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Slack Events API endpoint. Verifies the request signature, answers the
// url_verification challenge, PERSISTS the event (SlackEvent, unique by
// event_id) and only then acks within Slack's 3s window. Processing runs in
// the background via `after`. Duplicates/retries are deduplicated by event id,
// not by the x-slack-retry-num header, so an event whose processing failed can
// still be reprocessed by a later retry.
export async function POST(request: Request) {
  const rawBody = await request.text();
  const timestamp = request.headers.get("x-slack-request-timestamp");
  const signature = request.headers.get("x-slack-signature");

  if (!verifySlackSignature(rawBody, timestamp, signature)) {
    console.error("[checkin] Firma de Slack inválida");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  // Slack endpoint verification handshake.
  if (body.type === "url_verification") {
    return NextResponse.json({ challenge: body.challenge });
  }

  if (body.type !== "event_callback") {
    return NextResponse.json({ ok: true });
  }

  const result = await receiveSlackEvent(body as Parameters<typeof receiveSlackEvent>[0], {
    store: prismaSlackEventStore,
    checkinChannel: process.env.CHECKIN_CHANNEL_ID,
    schedule: (task) => after(task),
    processors: {
      // DMs al bot → conversación de check-in del líder.
      dm: (event) => processKpiDmEvent(event),
      checkin_message: (event) => processCheckinEvent(event),
      checkin_edit: (event) => processCheckinEdit(event),
      checkin_delete: (event) => processCheckinDelete(event),
    },
  });

  return NextResponse.json({ ok: result.status === 200 }, { status: result.status });
}
