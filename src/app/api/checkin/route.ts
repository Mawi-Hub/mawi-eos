import { after, NextResponse } from "next/server";
import {
  verifySlackSignature,
  processCheckinEvent,
  type SlackMessageEvent,
} from "@/lib/integrations/checkin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Slack Events API endpoint. Verifies the request signature, answers the
// url_verification challenge, then acks within Slack's 3s window and processes
// the check-in in the background via `after` (Vercel keeps the function alive
// with waitUntil under the hood).
export async function POST(request: Request) {
  const rawBody = await request.text();
  const timestamp = request.headers.get("x-slack-request-timestamp");
  const signature = request.headers.get("x-slack-signature");

  if (!verifySlackSignature(rawBody, timestamp, signature)) {
    console.error("[checkin] Firma de Slack inválida");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = JSON.parse(rawBody);

  // Slack endpoint verification handshake.
  if (body.type === "url_verification") {
    return NextResponse.json({ challenge: body.challenge });
  }

  // Ignore Slack delivery retries so we don't create duplicate Notion rows.
  if (request.headers.get("x-slack-retry-num")) {
    return NextResponse.json({ ok: true });
  }

  if (body.type !== "event_callback") {
    return NextResponse.json({ ok: true });
  }

  const event = body.event as SlackMessageEvent;

  // Only real human messages in the check-ins channel — skip edits, joins,
  // and the bot's own confirmations.
  if (
    event?.type !== "message" ||
    event.channel !== process.env.CHECKIN_CHANNEL_ID ||
    event.subtype ||
    event.bot_id
  ) {
    return NextResponse.json({ ok: true });
  }

  after(async () => {
    try {
      await processCheckinEvent(event);
    } catch (error) {
      console.error("[checkin] Error procesando check-in:", error);
    }
  });

  return NextResponse.json({ ok: true });
}
