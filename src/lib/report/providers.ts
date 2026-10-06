// Proveedores reales de entrega (Slack y Notion). Cada uno distingue tres
// resultados, porque de eso depende si se puede reintentar:
//   sent      — el proveedor confirmó
//   failed    — el proveedor rechazó (nada se publicó): reintentar es seguro
//   uncertain — no sabemos si llegó (timeout, 5xx, respuesta ilegible): NO
//               reintentar a ciegas, primero reconciliar
// Los errores se devuelven sin credenciales ni contenido.

export type PostResult =
  | { status: "sent"; ts: string; channel: string }
  | { status: "failed"; error: string }
  | { status: "uncertain"; error: string };

export type ReconcileResult = { found: true; ts: string } | { found: false } | { found: "unknown" };

export type SlackProvider = {
  post(args: { channel: string; text: string; threadTs?: string | null; idempotencyKey: string }): Promise<PostResult>;
  // ¿Ya existe un mensaje con esta clave? Mira el historial del canal o hilo.
  find(args: { channel: string; threadTs?: string | null; idempotencyKey: string; since: Date }): Promise<ReconcileResult>;
};

export type NotionPostResult =
  | { status: "sent"; pageId: string }
  | { status: "failed"; error: string }
  | { status: "uncertain"; error: string };

export type NotionProvider = {
  // Crea la página (o agrega la actualización a la existente).
  publish(args: { parentPageId: string; title: string; text: string; existingPageId?: string | null; heading?: string | null }): Promise<NotionPostResult>;
  findPage(args: { parentPageId: string; title: string }): Promise<{ found: true; pageId: string } | { found: false } | { found: "unknown" }>;
};

// Quita tokens y recorta. Nunca devuelve el cuerpo de la respuesta ni la URL.
export function safeError(value: unknown): string {
  const raw = value instanceof Error ? value.message : String(value);
  return raw
    .replace(/xox[a-z]-[A-Za-z0-9-]+/g, "[token]")
    .replace(/(Bearer|secret_|ntn_)\s*[A-Za-z0-9._-]+/gi, "$1 [token]")
    .replace(/\s+/g, " ")
    .slice(0, 160);
}

function isTimeout(error: unknown): boolean {
  return error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
}

// Errores de Slack que garantizan que NO se publicó nada.
const SLACK_DEFINITIVE = new Set([
  "channel_not_found",
  "not_in_channel",
  "is_archived",
  "invalid_auth",
  "not_authed",
  "account_inactive",
  "token_revoked",
  "missing_scope",
  "restricted_action",
  "msg_too_long",
  "no_text",
  "invalid_arguments",
  "ratelimited",
  "thread_not_found",
]);

async function slackCall(method: string, init: RequestInit & { query?: Record<string, string> }): Promise<{ http: number; json: Record<string, unknown> | null }> {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) throw new Error("SLACK_BOT_TOKEN no configurado");
  const qs = init.query ? `?${new URLSearchParams(init.query).toString()}` : "";
  const res = await fetch(`https://slack.com/api/${method}${qs}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=utf-8", ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(10_000),
  });
  let json: Record<string, unknown> | null = null;
  try {
    json = (await res.json()) as Record<string, unknown>;
  } catch {
    json = null;
  }
  return { http: res.status, json };
}

export const realSlackProvider: SlackProvider = {
  async post({ channel, text, threadTs, idempotencyKey }) {
    try {
      const { http, json } = await slackCall("chat.postMessage", {
        method: "POST",
        body: JSON.stringify({
          channel,
          text,
          unfurl_links: false,
          unfurl_media: false,
          ...(threadTs ? { thread_ts: threadTs } : {}),
          // Permite reconciliar si se pierde la respuesta: el mensaje lleva su clave.
          metadata: { event_type: "mawi_management_report", event_payload: { key: idempotencyKey } },
        }),
      });
      if (json?.ok === true && typeof json.ts === "string") {
        return { status: "sent", ts: json.ts, channel: typeof json.channel === "string" ? json.channel : channel };
      }
      const code = typeof json?.error === "string" ? json.error : null;
      if (code && SLACK_DEFINITIVE.has(code)) return { status: "failed", error: `slack:${code}` };
      if (http >= 500 || !json) return { status: "uncertain", error: `slack:http_${http}` };
      return { status: "failed", error: `slack:${code ?? "unknown"}` };
    } catch (error) {
      return { status: "uncertain", error: isTimeout(error) ? "slack:timeout" : `slack:network ${safeError(error)}` };
    }
  },

  async find({ channel, threadTs, idempotencyKey, since }) {
    try {
      const oldest = String(Math.floor(since.getTime() / 1000) - 5);
      const { json } = threadTs
        ? await slackCall("conversations.replies", {
            method: "GET",
            query: { channel, ts: threadTs, include_all_metadata: "true", limit: "200" },
          })
        : await slackCall("conversations.history", {
            method: "GET",
            query: { channel, oldest, include_all_metadata: "true", limit: "100" },
          });
      if (json?.ok !== true || !Array.isArray(json.messages)) return { found: "unknown" };
      for (const m of json.messages as Array<{ ts?: string; metadata?: { event_payload?: { key?: string } } }>) {
        if (m.metadata?.event_payload?.key === idempotencyKey && m.ts) return { found: true, ts: m.ts };
      }
      return { found: false };
    } catch {
      return { found: "unknown" };
    }
  },
};

// ---- Notion -----------------------------------------------------------------

function notionHeaders() {
  return {
    Authorization: `Bearer ${process.env.NOTION_API_KEY}`,
    "Content-Type": "application/json",
    "Notion-Version": "2022-06-28",
  };
}

// Texto Slack → párrafos de Notion (límite 2000 caracteres por bloque de texto).
export function toNotionBlocks(text: string): Array<Record<string, unknown>> {
  const plain = text.replace(/\*([^*\n]+)\*/g, "$1").replace(/_([^_\n]+)_/g, "$1");
  const blocks: Array<Record<string, unknown>> = [];
  for (const para of plain.split(/\n{2,}/)) {
    for (let i = 0; i < para.length; i += 1900) {
      blocks.push({
        object: "block",
        type: "paragraph",
        paragraph: { rich_text: [{ type: "text", text: { content: para.slice(i, i + 1900) } }] },
      });
    }
  }
  return blocks.slice(0, 95);
}

export const realNotionProvider: NotionProvider = {
  async publish({ parentPageId, title, text, existingPageId, heading }) {
    if (!process.env.NOTION_API_KEY) return { status: "failed", error: "notion:sin_credencial" };
    try {
      const blocks = toNotionBlocks(text);
      if (existingPageId) {
        const children = heading
          ? [{ object: "block", type: "heading_2", heading_2: { rich_text: [{ type: "text", text: { content: heading } }] } }, ...blocks]
          : blocks;
        const res = await fetch(`https://api.notion.com/v1/blocks/${existingPageId}/children`, {
          method: "PATCH",
          headers: notionHeaders(),
          body: JSON.stringify({ children }),
          signal: AbortSignal.timeout(10_000),
        });
        if (res.ok) return { status: "sent", pageId: existingPageId };
        return res.status >= 500 ? { status: "uncertain", error: `notion:http_${res.status}` } : { status: "failed", error: `notion:http_${res.status}` };
      }
      const res = await fetch("https://api.notion.com/v1/pages", {
        method: "POST",
        headers: notionHeaders(),
        body: JSON.stringify({
          parent: { page_id: parentPageId },
          properties: { title: { title: [{ type: "text", text: { content: title } }] } },
          children: blocks,
        }),
        signal: AbortSignal.timeout(10_000),
      });
      if (res.ok) {
        const data = (await res.json()) as { id?: string };
        return data.id ? { status: "sent", pageId: data.id } : { status: "uncertain", error: "notion:sin_id" };
      }
      return res.status >= 500 ? { status: "uncertain", error: `notion:http_${res.status}` } : { status: "failed", error: `notion:http_${res.status}` };
    } catch (error) {
      return { status: "uncertain", error: isTimeout(error) ? "notion:timeout" : "notion:network" };
    }
  },

  async findPage({ parentPageId, title }) {
    if (!process.env.NOTION_API_KEY) return { found: "unknown" };
    try {
      let cursor: string | undefined;
      do {
        const res = await fetch(
          `https://api.notion.com/v1/blocks/${parentPageId}/children?page_size=100${cursor ? `&start_cursor=${cursor}` : ""}`,
          { headers: notionHeaders(), signal: AbortSignal.timeout(10_000) },
        );
        if (!res.ok) return { found: "unknown" };
        const data = (await res.json()) as {
          results?: Array<{ id: string; type: string; child_page?: { title?: string } }>;
          has_more?: boolean;
          next_cursor?: string | null;
        };
        const hit = data.results?.find((b) => b.type === "child_page" && b.child_page?.title === title);
        if (hit) return { found: true, pageId: hit.id };
        cursor = data.has_more && data.next_cursor ? data.next_cursor : undefined;
      } while (cursor);
      return { found: false };
    } catch {
      return { found: "unknown" };
    }
  },
};
