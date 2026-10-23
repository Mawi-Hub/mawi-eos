// Lo que se repite en el equipo: temas que aparecen en los check-ins (bloqueos,
// aprendizajes, pedidos de ayuda) y que conviene llevar a la L10. Se arma los
// viernes a las 10:15 CR y se guarda en WeeklySummary.teamThemes.
//
// Un tema entra solo si (a) lo mencionan 2 o más personas esta semana, (b) ya
// apareció en una semana anterior, o (c) es una dependencia entre áreas. El
// conteo de personas y las áreas los calcula EOS a partir de las respuestas que
// Claude cita; no se confía en los números que devuelva el modelo.
//
// Privacidad: el tema se presenta por área y cantidad de personas, sin
// nombres. Las respuestas con temas sensibles no se le mandan a Claude.

import { prisma } from "@/lib/db";
import { neutralizeSlack, oneLine, screenSensitive } from "@/lib/report/privacy";
import { crIsoDate } from "@/lib/time/costaRica";
import { teamConfig } from "@/lib/checkin/teams";
import { claudeJson } from "./claude";

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_THEMES = 6;
const LOOKBACK_WEEKS = 4;

export type TeamThemeKind = "repetido" | "recurrente" | "dependencia";

export type TeamTheme = {
  id: string;
  title: string;
  detail: string;
  kind: TeamThemeKind;
  people: number;
  areas: string[];
  // Lunes (ISO) de la primera semana en que apareció y cuántas semanas lleva.
  firstSeen: string;
  weeks: number;
  quotes: string[];
  // IDS creado desde el tema (si se llevó a la L10).
  issueId?: string | null;
};

export type ThemeAnswer = { ref: string; areaName: string; teamName: string; text: string };

type PreviousTheme = Pick<TeamTheme, "id" | "title" | "firstSeen" | "weeks"> & { week: string };

export function themeRef(periodStart: Date, themeId: string): string {
  return `${crIsoDate(periodStart)}:${themeId}`;
}

export function parseThemeRef(ref: string): { week: string; themeId: string } | null {
  const m = /^(\d{4}-\d{2}-\d{2}):([a-z0-9-]{1,40})$/.exec(ref);
  return m ? { week: m[1], themeId: m[2] } : null;
}

export function readThemes(value: unknown): TeamTheme[] {
  return Array.isArray(value) ? (value as TeamTheme[]).filter((t) => t && typeof t.id === "string" && typeof t.title === "string") : [];
}

export function themesPrompt(answers: ThemeAnswer[], previous: PreviousTheme[]): string {
  const lines = answers.map((a) => `[${a.ref}] (${a.areaName} · ${a.teamName}) ${a.text}`).join("\n");
  const prev = previous.length
    ? previous.map((p) => `- ${p.id}: ${p.title} (semana del ${p.week})`).join("\n")
    : "(ninguno)";
  return `Sos quien prepara la reunión semanal de management (L10, formato EOS) de Mawi, un SaaS para constructoras.
Abajo están los bloqueos, aprendizajes y pedidos de ayuda que el equipo escribió en su check-in de esta semana. Cada línea tiene un identificador entre corchetes.

Encontrá los TEMAS QUE SE REPITEN y que management debería discutir en IDS. Un tema vale solo si cumple al menos una:
1. Lo mencionan 2 o más líneas distintas esta semana (mismo problema de fondo, aunque lo digan distinto).
2. Es el mismo problema que un tema de semanas anteriores (lista abajo): en ese caso poné su id en "continua".
3. Es una dependencia entre áreas: alguien necesita algo de otra área para avanzar.

No inventes temas a partir de una sola línea que no cumpla 2 o 3. No repitas lo mismo en dos temas. Máximo ${MAX_THEMES}, los más importantes primero.
Escribí en español neutro, sin nombres de personas (sí de clientes o módulos si aparecen). El título es el problema real, no el síntoma, en una frase corta.

Respuestas de esta semana:
${lines}

Temas de semanas anteriores:
${prev}

Devolvé SOLO JSON con esta forma:
{"temas":[{"titulo":"...","detalle":"una o dos frases con el contexto y el impacto","tipo":"repetido|recurrente|dependencia","refs":["a1","a4"],"continua":"id-anterior o null","citas":["fragmento textual corto de una respuesta, máx 140 caracteres"]}]}`;
}

function slug(text: string): string {
  return (
    text
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40)
      .replace(/-+$/g, "") || "tema"
  );
}

// Valida la respuesta del modelo y calcula personas, áreas y recurrencia.
export function parseThemes(
  raw: unknown,
  input: { answers: ThemeAnswer[]; previous: PreviousTheme[]; week: string },
): TeamTheme[] {
  const list = (raw as { temas?: unknown })?.temas;
  if (!Array.isArray(list)) return [];
  const byRef = new Map(input.answers.map((a) => [a.ref, a]));
  const prevById = new Map(input.previous.map((p) => [p.id, p]));
  const out: TeamTheme[] = [];
  const used = new Set<string>();

  for (const t of list.slice(0, MAX_THEMES * 2)) {
    const item = t as { titulo?: unknown; detalle?: unknown; tipo?: unknown; refs?: unknown; continua?: unknown; citas?: unknown };
    const title = typeof item.titulo === "string" ? oneLine(item.titulo, 140) : "";
    if (title.length < 4) continue;
    const refs = Array.isArray(item.refs) ? [...new Set(item.refs.filter((r): r is string => typeof r === "string" && byRef.has(r)))] : [];
    if (!refs.length) continue;
    const people = refs.length;
    const areas = [...new Set(refs.map((r) => byRef.get(r)!.areaName))];
    const prev = typeof item.continua === "string" ? prevById.get(item.continua) : undefined;
    const declared = item.tipo === "dependencia" ? "dependencia" : null;
    const kind: TeamThemeKind | null = prev ? "recurrente" : people >= 2 ? "repetido" : declared;
    if (!kind) continue;

    let id = prev?.id ?? slug(title);
    for (let n = 2; used.has(id); n++) id = `${(prev?.id ?? slug(title)).slice(0, 37)}-${n}`;
    used.add(id);

    const quotes = (Array.isArray(item.citas) ? item.citas : [])
      .filter((q): q is string => typeof q === "string" && q.trim().length > 3)
      .slice(0, 2)
      .map((q) => oneLine(q, 160));
    out.push({
      id,
      title,
      detail: typeof item.detalle === "string" ? oneLine(item.detalle, 320) : "",
      kind,
      people,
      areas,
      firstSeen: prev?.firstSeen ?? input.week,
      weeks: prev ? prev.weeks + 1 : 1,
      quotes,
      issueId: null,
    });
    if (out.length >= MAX_THEMES) break;
  }
  return out;
}

export async function loadThemeInputs(periodStart: Date): Promise<{ answers: ThemeAnswer[]; previous: PreviousTheme[] }> {
  const since = new Date(periodStart.getTime() - LOOKBACK_WEEKS * 7 * DAY_MS);
  const [checkins, areas, past] = await Promise.all([
    prisma.teamCheckin.findMany({ where: { periodStart }, orderBy: { submittedAt: "asc" } }),
    prisma.reportArea.findMany({ select: { key: true, name: true } }),
    prisma.weeklySummary.findMany({
      where: { periodStart: { gte: since, lt: periodStart } },
      select: { periodStart: true, teamThemes: true },
      orderBy: { periodStart: "desc" },
    }),
  ]);
  const areaName = new Map(areas.map((a) => [a.key, a.name]));
  const answers: ThemeAnswer[] = [];
  checkins.forEach((c, i) => {
    const parts = [
      c.blocker ? `Bloqueo / ayuda: ${c.blocker}` : null,
      `Aprendizaje: ${c.learning}`,
      c.extra ? `Otro: ${c.extra}` : null,
    ].filter((p): p is string => !!p);
    const text = parts.join(" | ");
    if (screenSensitive(text).sensitive) return;
    answers.push({
      ref: `a${i + 1}`,
      areaName: (c.areaKey && areaName.get(c.areaKey)) || "Sin área",
      teamName: teamConfig(c.teamKey)?.name ?? c.teamKey,
      text: oneLine(neutralizeSlack(text), 700),
    });
  });
  // El tema más reciente de cada id manda.
  const previous: PreviousTheme[] = [];
  const seen = new Set<string>();
  for (const row of past) {
    for (const t of readThemes(row.teamThemes)) {
      if (seen.has(t.id)) continue;
      seen.add(t.id);
      previous.push({ id: t.id, title: t.title, firstSeen: t.firstSeen, weeks: t.weeks, week: crIsoDate(row.periodStart) });
    }
  }
  return { answers, previous };
}

export type ThemeDeps = { claude: (prompt: string) => Promise<unknown> };

// Arma los temas de la semana y los guarda. Conserva el IDS de un tema que ya
// se llevó a la L10 si vuelve a salir con el mismo id.
export async function generateTeamThemes(periodStart: Date, deps: ThemeDeps = { claude: (p) => claudeJson(p, 2500) }): Promise<{ themes: TeamTheme[]; answers: number }> {
  const { answers, previous } = await loadThemeInputs(periodStart);
  const week = crIsoDate(periodStart);
  const themes = answers.length >= 2 ? parseThemes(await deps.claude(themesPrompt(answers, previous)), { answers, previous, week }) : [];
  const existing = await prisma.weeklySummary.findUnique({ where: { periodStart }, select: { teamThemes: true } });
  const promoted = new Map(readThemes(existing?.teamThemes).filter((t) => t.issueId).map((t) => [t.id, t.issueId]));
  for (const t of themes) if (promoted.has(t.id)) t.issueId = promoted.get(t.id);
  // Un tema llevado a IDS que ya no salió igual se conserva, para no perder el vínculo.
  for (const t of readThemes(existing?.teamThemes)) if (t.issueId && !themes.some((x) => x.id === t.id)) themes.push(t);
  await prisma.weeklySummary.upsert({
    where: { periodStart },
    create: { periodStart, teamThemes: themes, themesGeneratedAt: new Date() },
    update: { teamThemes: themes, themesGeneratedAt: new Date() },
  });
  return { themes, answers: answers.length };
}

const KIND_LABEL: Record<TeamThemeKind, string> = {
  repetido: "se repite esta semana",
  recurrente: "viene de semanas anteriores",
  dependencia: "dependencia entre áreas",
};

export function themeMeta(t: TeamTheme): string {
  const people = `${t.people} persona${t.people === 1 ? "" : "s"}`;
  const since = t.weeks > 1 ? ` · ${t.weeks}.ª semana` : "";
  return `${people} · ${t.areas.join(", ")} · ${KIND_LABEL[t.kind]}${since}`;
}

export function themesSlackText(themes: TeamTheme[], url: string | null): string {
  const list = themes
    .map((t, i) => `${i + 1}. *${neutralizeSlack(t.title)}*\n   _${neutralizeSlack(themeMeta(t))}_${t.detail ? `\n   ${neutralizeSlack(t.detail)}` : ""}`)
    .join("\n");
  return (
    `🔁 *Lo que se repite en el equipo esta semana*\n` +
    `Sale de los check-ins (bloqueos, aprendizajes y pedidos de ayuda). Nada se agrega solo a IDS: si algo vale la pena, llevalo desde la L10.\n\n` +
    `${list}${url ? `\n\nLlevar a IDS: ${url}` : ""}`
  );
}
