// Copia del check-in semanal en la base de Notion de check-ins. EOS es la
// fuente; Notion es una proyección. Solo se escriben las columnas que existen
// en la base (se leen una vez por proceso), así que agregar o quitar columnas en
// Notion nunca rompe el guardado.

const NOTION_VERSION = "2022-06-28";

const headers = () => ({
  Authorization: `Bearer ${process.env.NOTION_API_KEY}`,
  "Content-Type": "application/json",
  "Notion-Version": NOTION_VERSION,
});

type PropType = "title" | "rich_text" | "select" | "date" | "number" | string;
let schemaCache: { at: number; props: Record<string, PropType> } | null = null;

async function databaseProps(): Promise<Record<string, PropType>> {
  if (schemaCache && Date.now() - schemaCache.at < 10 * 60 * 1000) return schemaCache.props;
  const res = await fetch(`https://api.notion.com/v1/databases/${encodeURIComponent(process.env.NOTION_DATABASE_ID ?? "")}`, {
    headers: headers(),
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) throw new Error(`Notion API error: ${res.status}`);
  const data = (await res.json()) as { properties?: Record<string, { type?: string }> };
  const props: Record<string, PropType> = {};
  for (const [name, p] of Object.entries(data.properties ?? {})) props[name] = p.type ?? "";
  schemaCache = { at: Date.now(), props };
  return props;
}

export type TeamCheckinNotionRow = {
  title: string;
  energy: number | null;
  // null = no tocar lo que ya está (una edición no borra el motivo anterior).
  energyReason: string | null;
  person: string;
  date: string; // YYYY-MM-DD
  team: string;
  result: string;
  learning: string;
  extra: string | null;
  blocker: string | null;
  commitment: string;
  previous: string | null;
  numbers: string | null;
};

const TEXT_LIMIT = 1900;

function valueFor(type: PropType, value: string): unknown {
  if (type === "number") {
    const n = Number(value);
    return Number.isFinite(n) ? { number: n } : undefined;
  }
  const text = value.slice(0, TEXT_LIMIT);
  if (type === "title") return { title: [{ text: { content: text } }] };
  if (type === "rich_text") return { rich_text: text ? [{ text: { content: text } }] : [] };
  if (type === "select") return text ? { select: { name: text.replace(/,/g, " ").slice(0, 100) } } : { select: null };
  if (type === "date") return { date: { start: text } };
  return undefined;
}

export function notionProperties(row: TeamCheckinNotionRow, props: Record<string, PropType>): Record<string, unknown> {
  // Columna → valor. Win/Reto siguen existiendo para que las vistas actuales
  // muestren el resultado y el bloqueo sin cambios.
  const wanted: Array<[string, string | null]> = [
    ["Nombre", row.title],
    ["Persona", row.person],
    ["Fecha", row.date],
    ["Tipo", "Check-in semanal"],
    ["Energía", row.energy === null ? null : String(row.energy)],
    ["Por qué", row.energyReason],
    ["Área", row.team],
    ["Win", row.result],
    ["Aprendizaje", [row.learning, row.extra].filter(Boolean).join("\n\n")],
    ["Reto", row.blocker],
    ["Compromiso", row.commitment],
    ["Compromiso anterior", row.previous],
    ["Números", row.numbers],
  ];
  const out: Record<string, unknown> = {};
  for (const [name, value] of wanted) {
    const type = props[name];
    if (!type || value === null) continue;
    const v = valueFor(type, value);
    if (v !== undefined) out[name] = v;
  }
  return out;
}

// Crea o actualiza la página. Devuelve el id de la página.
export async function upsertTeamCheckinNotion(row: TeamCheckinNotionRow, pageId: string | null): Promise<string | null> {
  if (!process.env.NOTION_API_KEY || !process.env.NOTION_DATABASE_ID) return null;
  const properties = notionProperties(row, await databaseProps());
  if (pageId) {
    const res = await fetch(`https://api.notion.com/v1/pages/${encodeURIComponent(pageId)}`, {
      method: "PATCH",
      headers: headers(),
      body: JSON.stringify({ properties }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`Notion API error: ${res.status}`);
    return pageId;
  }
  const res = await fetch("https://api.notion.com/v1/pages", {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ parent: { database_id: process.env.NOTION_DATABASE_ID }, properties }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Notion API error: ${res.status}`);
  const page = (await res.json()) as { id?: string };
  return page.id ?? null;
}
