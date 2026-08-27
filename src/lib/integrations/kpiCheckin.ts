// KPI check-in por DM: Slack → Claude → Scorecard / Wins & Challenges.
//
// Un cron (jueves 5pm CR) le abre un DM a cada líder con métricas manuales
// activas. La conversación avanza en 3 pasos (KpiCheckinSession.step):
//   wins       → guarda el win de la semana como WinChallenge
//   metrics    → extrae valores del texto y escribe ScorecardEntry del período
//   challenges → guarda hasta 3 retos como WinChallenge y cierra con resumen
//
// Slack app requirements (además de lo que ya usa el check-in de canal):
//   scopes: im:write (abrir DMs), im:history (leer DMs)
//   event subscription: message.im
//   users:read.email ya está habilitado (lookupByEmail funciona).

import { prisma } from "@/lib/db";
import { calculateStatus } from "@/lib/utils";
import { postSlackMessage, type SlackMessageEvent } from "./checkin";
import type { KpiCheckinSession, ScorecardMetric, User } from "@/generated/prisma/client";

// Métricas de contexto que se muestran a todos en el paso "ver métricas".
const HEADER_METRICS = ["MRR", "NDR", "CCR", "Demos agendadas / semana"];

const STATUS_EMOJI: Record<string, string> = {
  on_track: "🟢",
  riesgo: "🟡",
  off_track: "🔴",
  pending: "⚪",
};

type SessionWithUser = KpiCheckinSession & { user: User };

// ---------------------------------------------------------------------------
// Slack helpers
// ---------------------------------------------------------------------------

async function slackApi(method: string, params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const res = await fetch(`https://slack.com/api/${method}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(params),
  });
  return (await res.json()) as Record<string, unknown>;
}

// Algunos líderes usan otro correo en Slack que en el app. SLACK_USER_OVERRIDES
// los mapea: "correo-del-app=SLACK_USER_ID,otro@mawi.io=U123..."
function slackOverride(email: string): string | null {
  const raw = process.env.SLACK_USER_OVERRIDES ?? "";
  for (const pair of raw.split(",")) {
    const [key, value] = pair.split("=").map((s) => s.trim());
    if (key && value && key.toLowerCase() === email.toLowerCase()) return value;
  }
  return null;
}

export async function lookupSlackUserByEmail(email: string): Promise<string | null> {
  const override = slackOverride(email);
  if (override) return override;
  const res = await fetch(
    `https://slack.com/api/users.lookupByEmail?email=${encodeURIComponent(email)}`,
    { headers: { Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}` } },
  );
  const data = (await res.json()) as { ok?: boolean; user?: { id?: string } };
  return data.ok ? data.user?.id ?? null : null;
}

async function openDm(slackUserId: string): Promise<string | null> {
  const data = (await slackApi("conversations.open", { users: slackUserId })) as {
    ok?: boolean;
    channel?: { id?: string };
    error?: string;
  };
  if (!data.ok) {
    console.error(`[kpi-checkin] conversations.open falló: ${data.error}`);
    return null;
  }
  return data.channel?.id ?? null;
}

// ---------------------------------------------------------------------------
// Claude helper — free text → JSON (same raw-fetch pattern as checkin.ts)
// ---------------------------------------------------------------------------

async function claudeJson<T>(prompt: string): Promise<T | null> {
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
      max_tokens: 700,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    console.error(`[kpi-checkin] Anthropic ${res.status}:`, await res.text());
    return null;
  }

  const data = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
  const text = (data.content?.find((b) => b.type === "text")?.text ?? "").trim();
  try {
    return JSON.parse(text) as T;
  } catch {
    console.error("[kpi-checkin] Claude no devolvió JSON válido:", text);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Period + quarter helpers (same conventions as /api/scorecard manual entry)
// ---------------------------------------------------------------------------

function mondayOfWeek(now: Date): Date {
  const d = new Date(now);
  const day = d.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + mondayOffset);
  d.setHours(0, 0, 0, 0);
  return d;
}

function currentPeriod(frequency: string, now = new Date()): { start: Date; end: Date } {
  if (frequency === "weekly" || frequency === "daily") {
    const start = mondayOfWeek(now);
    return { start, end: new Date(start.getTime() + 6 * 24 * 60 * 60 * 1000) };
  }
  // monthly / biweekly → calendar month, igual que el entry manual.
  return {
    start: new Date(now.getFullYear(), now.getMonth(), 1),
    end: new Date(now.getFullYear(), now.getMonth() + 1, 0),
  };
}

async function quarterIdForDate(d: Date): Promise<string | null> {
  const quarter = await prisma.quarter.findFirst({
    where: { startDate: { lte: d }, endDate: { gte: d } },
  });
  return quarter?.id ?? null;
}

async function userManualMetrics(userId: string): Promise<ScorecardMetric[]> {
  return prisma.scorecardMetric.findMany({
    where: { ownerId: userId, isActive: true, dataSource: "manual" },
    orderBy: { sortOrder: "asc" },
  });
}

// En prueba mostramos todos los KPIs manuales del tablero (el tester puede no
// tener ninguno propio) — igual no se escribe nada.
async function metricsForSession(session: KpiCheckinSession): Promise<ScorecardMetric[]> {
  if (!session.preview) return userManualMetrics(session.userId);
  return prisma.scorecardMetric.findMany({
    where: { isActive: true, dataSource: "manual" },
    orderBy: { sortOrder: "asc" },
  });
}

// ---------------------------------------------------------------------------
// Cron entry: abrir el DM de cada líder y pedir el WIN primero
// ---------------------------------------------------------------------------

export type KpiCheckinStartResult = {
  sent: string[];
  skipped: { name: string; reason: string }[];
  dryRun: boolean;
};

export type StartKpiCheckinOptions = {
  dryRun?: boolean;
  // Solo a esta persona (email del app), aunque no tenga KPIs manuales propios.
  onlyEmail?: string;
  // Recorre el flujo completo sin escribir nada. Útil para probar en vivo.
  preview?: boolean;
};

export async function startKpiCheckins(options?: StartKpiCheckinOptions): Promise<KpiCheckinStartResult> {
  const dryRun = options?.dryRun ?? false;
  const preview = options?.preview ?? false;
  const metrics = await prisma.scorecardMetric.findMany({
    where: { isActive: true, dataSource: "manual" },
    include: { owner: true },
    orderBy: { sortOrder: "asc" },
  });

  const byOwner = new Map<string, { owner: User; metrics: ScorecardMetric[] }>();
  for (const metric of metrics) {
    const group = byOwner.get(metric.ownerId) ?? { owner: metric.owner, metrics: [] };
    group.metrics.push(metric);
    byOwner.set(metric.ownerId, group);
  }

  let targets = [...byOwner.values()].map((g) => g.owner);
  if (options?.onlyEmail) {
    const user = await prisma.user.findUnique({ where: { email: options.onlyEmail } });
    if (!user) {
      return { sent: [], skipped: [{ name: options.onlyEmail, reason: "no existe en el app" }], dryRun };
    }
    targets = [user];
  }

  const weekStart = mondayOfWeek(new Date());
  const result: KpiCheckinStartResult = { sent: [], skipped: [], dryRun };

  for (const owner of targets) {
    const existing = await prisma.kpiCheckinSession.findUnique({
      where: { userId_weekStart: { userId: owner.id, weekStart } },
    });
    if (existing) {
      result.skipped.push({ name: owner.name, reason: "ya tiene sesión esta semana" });
      continue;
    }

    const slackUserId = await lookupSlackUserByEmail(owner.email);
    if (!slackUserId) {
      result.skipped.push({ name: owner.name, reason: `sin usuario Slack para ${owner.email}` });
      continue;
    }

    if (dryRun) {
      result.sent.push(`${owner.name} (dry-run)`);
      continue;
    }

    const dmChannel = await openDm(slackUserId);
    if (!dmChannel) {
      result.skipped.push({ name: owner.name, reason: "no se pudo abrir DM (¿falta scope im:write?)" });
      continue;
    }

    await prisma.kpiCheckinSession.create({
      data: { userId: owner.id, slackUserId, slackChannelId: dmChannel, weekStart, step: "wins", preview },
    });

    const firstName = owner.name.split(" ")[0];
    await postSlackMessage(
      dmChannel,
      (preview ? "🧪 *MODO PRUEBA* — nada de lo que respondas se guarda.\n\n" : "") +
        `¡Hola ${firstName}! 👋 Check-in para la reunión de management del viernes.\n\n` +
        `Primero lo bueno: *¿cuál fue tu WIN de la semana?* 🏆\n` +
        `_Contámelo en una o dos líneas — después te pido tus KPIs._`,
    );
    result.sent.push(owner.name);
  }

  console.log(
    `[kpi-checkin] Enviados: ${result.sent.length}, saltados: ${result.skipped.length}${dryRun ? " (dry-run)" : ""}`,
  );
  return result;
}

// ---------------------------------------------------------------------------
// DM conversation steps
// ---------------------------------------------------------------------------

export async function processKpiDmEvent(event: SlackMessageEvent): Promise<void> {
  const session = await prisma.kpiCheckinSession.findFirst({
    where: { slackChannelId: event.channel, step: { not: "done" } },
    orderBy: { createdAt: "desc" },
    include: { user: true },
  });

  // DMs sin sesión abierta (o de otra persona en un canal grupal raro) se ignoran.
  if (!session || session.slackUserId !== event.user) return;

  if (session.step === "wins") await handleWins(session, event.text);
  else if (session.step === "metrics") await handleMetrics(session, event.text);
  else if (session.step === "challenges") await handleChallenges(session, event.text);
}

async function advanceStep(sessionId: string, step: string): Promise<void> {
  await prisma.kpiCheckinSession.update({ where: { id: sessionId }, data: { step } });
}

function metricLine(m: ScorecardMetric): string {
  const target = m.targetValue ? ` (meta ${m.targetValue})` : "";
  return `• *${m.name}*${target}`;
}

// Paso 1: WIN → WinChallenge(entry_type=win), luego pedir KPIs.
async function handleWins(session: SessionWithUser, text: string): Promise<void> {
  const extracted = await claudeJson<{ win: string | null; result: string | null }>(
    `Un líder responde en Slack a la pregunta "¿cuál fue tu WIN de la semana?".

Mensaje:
"${text}"

Extraé el win. Si dice que no tuvo win o el mensaje no contiene ninguno, win = null.
Respondé ÚNICAMENTE con JSON válido, sin markdown ni backticks:
{
  "win": "el logro descrito, en sus palabras, limpio" o null,
  "result": "resultado medible si lo menciona (números, %, plata)" o null
}`,
  );

  if (extracted?.win && !session.preview) {
    const quarterId = await quarterIdForDate(new Date());
    if (quarterId) {
      await prisma.winChallenge.create({
        data: {
          userId: session.userId,
          quarterId,
          reportDate: new Date(),
          entryType: "win",
          wins: extracted.win,
          result: extracted.result,
        },
      });
    }
  }

  const metrics = await metricsForSession(session);
  await advanceStep(session.id, "metrics");

  const ack = extracted?.win
    ? session.preview
      ? `🧪 Leí este win (no se guardó): _${extracted.win}_`
      : "💪 Anotado el win."
    : "Va, sin win esta semana — pasa. 💪";
  await postSlackMessage(
    session.slackChannelId,
    `${ack}\n\nAhora tus KPIs. Mandámelos en un solo mensaje:\n${metrics.map(metricLine).join("\n")}\n` +
      `_Ejemplo: "${metrics[0]?.name ?? "Métrica"} 85"_`,
  );
}

// Paso 2: valores → ScorecardEntry del período vigente, luego mostrar tablero
// y pedir challenges. Si faltan métricas se queda en este paso hasta que las
// mande o diga "listo".
async function handleMetrics(session: SessionWithUser, text: string): Promise<void> {
  const metrics = await metricsForSession(session);
  const metricList = metrics
    .map((m) => `- "${m.name}" (unidad: ${m.unit ?? "número"}, frecuencia: ${m.frequency})`)
    .join("\n");

  const extracted = await claudeJson<{
    valores: { nombre: string; valor: number; display: string | null }[];
    continuar: boolean;
  }>(
    `Un líder responde en Slack con los valores de sus KPIs de la semana.

Sus KPIs (usá EXACTAMENTE estos nombres en "nombre"):
${metricList}

Mensaje:
"${text}"

Reglas:
- Porcentajes como número 0-100 (ej: "85%" → 85).
- Montos sin símbolo ni comas (ej: "$4,200" → 4200).
- "display" solo si el valor textual aporta formato (ej: "22 días"), si no null.
- Si el mensaje dice que no tiene los demás datos, que sigamos, o "listo", continuar = true.
- Solo incluí KPIs que el mensaje realmente menciona.

Respondé ÚNICAMENTE con JSON válido, sin markdown ni backticks:
{
  "valores": [{ "nombre": "...", "valor": 0, "display": null }],
  "continuar": false
}`,
  );

  const values = extracted?.valores ?? [];
  const byName = new Map(metrics.map((m) => [m.name, m]));
  const savedNames: string[] = []; // nombres de métrica, para calcular faltantes
  const savedLabels: string[] = []; // versión legible para el mensaje de Slack

  for (const v of values) {
    const metric = byName.get(v.nombre);
    if (!metric || typeof v.valor !== "number" || Number.isNaN(v.valor)) continue;

    const { start, end } = currentPeriod(metric.frequency);

    if (session.preview) {
      const status = calculateStatus(v.valor, metric.targetNumeric, metric.targetDirection);
      savedNames.push(metric.name);
      savedLabels.push(`${metric.name} → ${v.display ?? v.valor} ${STATUS_EMOJI[status] ?? ""}`.trim());
      continue;
    }

    const quarterId = await quarterIdForDate(start);
    if (!quarterId) continue;

    await prisma.scorecardEntry.upsert({
      where: { metricId_periodStart: { metricId: metric.id, periodStart: start } },
      update: {
        actualValue: v.valor,
        actualDisplay: v.display,
        status: calculateStatus(v.valor, metric.targetNumeric, metric.targetDirection),
        notes: `Slack check-in ${new Date().toISOString().split("T")[0]}`,
        enteredById: session.userId,
      },
      create: {
        metricId: metric.id,
        quarterId,
        periodStart: start,
        periodEnd: end,
        actualValue: v.valor,
        actualDisplay: v.display,
        status: calculateStatus(v.valor, metric.targetNumeric, metric.targetDirection),
        notes: `Slack check-in ${new Date().toISOString().split("T")[0]}`,
        enteredById: session.userId,
      },
    });
    savedNames.push(metric.name);
    savedLabels.push(metric.name);
  }

  if (savedNames.length === 0 && !extracted?.continuar) {
    await postSlackMessage(
      session.slackChannelId,
      `No logré leer ningún valor 😅. Mandámelos como "nombre valor", ej:\n` +
        `_"${metrics[0]?.name ?? "Métrica"} 85"_ — o escribí *listo* para seguir sin cargar.`,
    );
    return;
  }

  const missing = metrics.filter((m) => !savedNames.includes(m.name));
  if (missing.length > 0 && !extracted?.continuar) {
    await postSlackMessage(
      session.slackChannelId,
      `${session.preview ? "🧪 Leí (sin guardar)" : "✅ Guardé"}: ${savedLabels.join(", ")}.\n` +
        `Me falta:\n${missing.map(metricLine).join("\n")}\n` +
        `_Mandámelos o escribí *listo* para seguir._`,
    );
    return;
  }

  await advanceStep(session.id, "challenges");
  const summary = await buildScorecardSummary(session.userId);
  await postSlackMessage(
    session.slackChannelId,
    `${
      savedLabels.length
        ? `${session.preview ? "🧪 KPIs leídos (sin guardar)" : "✅ KPIs guardados"}: ${savedLabels.join(", ")}.`
        : "Va, seguimos sin cargar KPIs."
    }\n\n` +
      `Así va el tablero:\n${summary}\n\n` +
      `Último paso: *¿qué challenges traés para la reunión?* 🧱\n` +
      `_Máximo 3, idealmente los que pegan a retención/NDR. Si no tenés, decime "ninguno"._`,
  );
}

// Paso 3: challenges → WinChallenge(entry_type=challenge) y cierre.
async function handleChallenges(session: SessionWithUser, text: string): Promise<void> {
  const extracted = await claudeJson<{
    challenges: { titulo: string; detalle: string | null; prioridad: "alto" | "medio" | "bajo" }[];
  }>(
    `Un líder responde en Slack con los challenges/retos que quiere llevar a la reunión de management.

Mensaje:
"${text}"

Extraé hasta 3 challenges. Si dice que no tiene ninguno, devolvé lista vacía.
Prioridad: "alto" si suena urgente o pega a churn/retención/ventas, si no "medio", "bajo" si es menor.
Respondé ÚNICAMENTE con JSON válido, sin markdown ni backticks:
{
  "challenges": [{ "titulo": "resumen corto", "detalle": "contexto adicional" o null, "prioridad": "alto" }]
}`,
  );

  const challenges = (extracted?.challenges ?? []).slice(0, 3);
  const quarterId = session.preview ? null : await quarterIdForDate(new Date());

  if (quarterId) {
    for (const c of challenges) {
      await prisma.winChallenge.create({
        data: {
          userId: session.userId,
          quarterId,
          reportDate: new Date(),
          entryType: "challenge",
          keyChallenge: c.detalle ? `${c.titulo} — ${c.detalle}` : c.titulo,
          priority: c.prioridad ?? "medio",
        },
      });
    }
  }

  await advanceStep(session.id, "done");

  const appUrl = process.env.NEXTAUTH_URL ?? "";
  const firstName = session.user.name.split(" ")[0];
  const challengeSummary = challenges.length
    ? challenges.map((c) => `• ${c.titulo} (${c.prioridad})`).join("\n")
    : "• (sin challenges esta semana)";

  await postSlackMessage(
    session.slackChannelId,
    session.preview
      ? `🧪 Fin de la prueba, ${firstName}. Estos challenges habría registrado:\n${challengeSummary}\n\n` +
          `No se guardó nada en el tablero. Así se va a ver el jueves de verdad. 🚀`
      : `🙌 Listo, ${firstName}. Quedó todo cargado para el viernes:\n${challengeSummary}\n\n` +
          (appUrl ? `Lo ves en el tablero: ${appUrl}/wins-challenges\n` : "") +
          `¡Buen fin de semana! 🚀`,
  );
}

// Tablero resumido: header de empresa + las métricas propias, última entrada.
async function buildScorecardSummary(userId: string): Promise<string> {
  const metrics = await prisma.scorecardMetric.findMany({
    where: {
      isActive: true,
      OR: [{ name: { in: HEADER_METRICS } }, { ownerId: userId }],
    },
    include: { entries: { orderBy: { periodStart: "desc" }, take: 1 } },
    orderBy: { sortOrder: "asc" },
  });

  return metrics
    .map((m) => {
      const entry = m.entries[0];
      const emoji = STATUS_EMOJI[entry?.status ?? "pending"] ?? "⚪";
      const value =
        entry?.actualDisplay ??
        (entry?.actualValue !== null && entry?.actualValue !== undefined
          ? `${entry.actualValue}${m.unit === "%" ? "%" : ""}`
          : "sin dato");
      const target = m.targetValue ? ` · meta ${m.targetValue}` : "";
      return `${emoji} *${m.name}*: ${value}${target}`;
    })
    .join("\n");
}
