// Check-in agent: Slack → Claude → Notion.
//
// Listens to free-form messages in #team-checkins, extracts structured fields
// with Claude, writes a row to a Notion database, and confirms back in Slack.
// Raw `fetch` (no SDKs) to match the other integrations in this folder.
//
// Env vars (see .env.local / Vercel project settings):
//   SLACK_SIGNING_SECRET  — Slack App → Basic Information → Signing Secret
//   SLACK_BOT_TOKEN       — Slack App → OAuth & Permissions → Bot Token (xoxb-…)
//   ANTHROPIC_API_KEY     — console.anthropic.com
//   NOTION_API_KEY        — notion.so/my-integrations (Internal Integration Token)
//   NOTION_DATABASE_ID    — 32-char ID from the check-ins DB URL
//   CHECKIN_CHANNEL_ID    — Slack channel ID for #team-checkins (starts with C)

import crypto from "crypto";

export type CheckinFields = {
  tipo: "Miércoles" | "Viernes" | "Otro";
  energia: number | null;
  por_que: string | null;
  win: string | null;
  reto: string | null;
  es_checkin: boolean;
};

export type SlackMessageEvent = {
  type: string;
  user: string;
  text: string;
  ts: string;
  channel: string;
  subtype?: string;
  bot_id?: string;
};

// Verify Slack's request signature (HMAC-SHA256 over `v0:timestamp:body`).
// Returns false on any missing/stale/mismatched input rather than throwing.
export function verifySlackSignature(
  rawBody: string,
  timestamp: string | null,
  signature: string | null,
): boolean {
  const signingSecret = process.env.SLACK_SIGNING_SECRET;
  if (!signingSecret || !timestamp || !signature) return false;

  // Replay protection: reject anything older than 5 minutes.
  const now = Math.floor(Date.now() / 1000);
  if (Number.isNaN(Number(timestamp)) || Math.abs(now - Number(timestamp)) > 60 * 5) {
    return false;
  }

  const sigBase = `v0:${timestamp}:${rawBody}`;
  const hmac = crypto.createHmac("sha256", signingSecret).update(sigBase).digest("hex");
  const expected = `v0=${hmac}`;

  const expectedBuf = Buffer.from(expected);
  const signatureBuf = Buffer.from(signature);
  // timingSafeEqual throws on length mismatch — guard first.
  if (expectedBuf.length !== signatureBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, signatureBuf);
}

function buildPrompt(messageText: string, userName: string): string {
  const today = new Date().toISOString().split("T")[0];
  const dayOfWeek = new Date().toLocaleDateString("es-CR", { weekday: "long" });

  return `Eres un asistente que procesa check-ins de equipo de una startup latinoamericana.

El siguiente mensaje fue enviado por ${userName} en el canal de check-ins del equipo.
Fecha: ${today} (${dayOfWeek})

Mensaje:
"${messageText}"

Extrae los campos del mensaje. Si un campo no está presente o no aplica, dejalo como null.
Check-ins de MIÉRCOLES: energía (número 1-5) y motivo.
Check-ins de VIERNES: energía (número 1-5), motivo, win de la semana, reto o freno.

Responde ÚNICAMENTE con JSON válido, sin texto adicional, sin markdown, sin backticks:
{
  "tipo": "Miércoles" | "Viernes" | "Otro",
  "energia": número del 1 al 5 o null,
  "por_que": "texto explicando la energía" o null,
  "win": "logro o win de la semana" o null,
  "reto": "freno o reto que tuvo" o null,
  "es_checkin": true si el mensaje parece un check-in, false si es otro tipo de mensaje
}`;
}

// Ask Claude to turn free text into structured check-in fields.
// Returns null if the API errors or Claude returns non-JSON.
export async function extractCheckinFields(
  messageText: string,
  userName: string,
): Promise<CheckinFields | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 500,
      messages: [{ role: "user", content: buildPrompt(messageText, userName) }],
    }),
  });

  if (!res.ok) {
    console.error(`[checkin] Anthropic ${res.status}:`, await res.text());
    return null;
  }

  const data = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
  const text = (data.content?.find((b) => b.type === "text")?.text ?? "").trim();
  try {
    return JSON.parse(text) as CheckinFields;
  } catch {
    console.error("[checkin] Claude no devolvió JSON válido:", text);
    return null;
  }
}

// Resolve a Slack user ID to a display name (falls back to the ID).
export async function getSlackUserName(userId: string): Promise<string> {
  const token = process.env.SLACK_BOT_TOKEN;
  const res = await fetch(
    `https://slack.com/api/users.info?user=${encodeURIComponent(userId)}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const data = (await res.json()) as { user?: { real_name?: string; name?: string } };
  return data.user?.real_name || data.user?.name || userId;
}

// Create a row in the Notion check-ins database. Property names must match the
// Notion DB schema exactly (see the integration guide).
export async function createNotionEntry(
  fields: CheckinFields,
  userName: string,
  messageTs: string,
): Promise<void> {
  const date = new Date(parseFloat(messageTs) * 1000).toISOString().split("T")[0];
  const title = `${fields.tipo} — ${userName} — ${date}`;

  const properties: Record<string, unknown> = {
    Nombre: { title: [{ text: { content: title } }] },
    Persona: { rich_text: [{ text: { content: userName } }] },
    Fecha: { date: { start: date } },
    Tipo: { select: { name: fields.tipo } },
  };

  if (fields.energia !== null) properties["Energía"] = { number: fields.energia };
  if (fields.por_que) properties["Por qué"] = { rich_text: [{ text: { content: fields.por_que } }] };
  if (fields.win) properties["Win"] = { rich_text: [{ text: { content: fields.win } }] };
  if (fields.reto) properties["Reto"] = { rich_text: [{ text: { content: fields.reto } }] };

  const res = await fetch("https://api.notion.com/v1/pages", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.NOTION_API_KEY}`,
      "Content-Type": "application/json",
      "Notion-Version": "2022-06-28",
    },
    body: JSON.stringify({
      parent: { database_id: process.env.NOTION_DATABASE_ID },
      properties,
    }),
  });

  if (!res.ok) {
    throw new Error(`Notion API error: ${JSON.stringify(await res.json())}`);
  }
}

// Post the "saved" confirmation back to the Slack channel.
export async function postSlackConfirmation(
  channel: string,
  userName: string,
  fields: CheckinFields,
): Promise<void> {
  const emoji = fields.tipo === "Viernes" ? "🏁" : "⚡";
  const message = `${emoji} Check-in de *${userName}* registrado en Notion.\n> Energía: ${fields.energia ?? "—"}/5`;

  await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ channel, text: message }),
  });
}

// End-to-end handling of one Slack message event. Called in the background
// (via `after`) so it never blocks Slack's 3-second ack window.
export async function processCheckinEvent(event: SlackMessageEvent): Promise<void> {
  const userName = await getSlackUserName(event.user);
  const fields = await extractCheckinFields(event.text, userName);

  if (!fields || !fields.es_checkin) {
    console.log(`[checkin] Mensaje de ${userName} ignorado — no parece check-in`);
    return;
  }

  await createNotionEntry(fields, userName, event.ts);
  await postSlackConfirmation(event.channel, userName, fields);
  console.log(`[checkin] ✅ Check-in de ${userName} (${fields.tipo}) guardado en Notion`);
}
