// Resumen semanal de empresa: junta lo que el equipo respondió y lo que los
// managers validaron (Rocks, métricas, acuerdos de la reunión si la hubo), arma
// un borrador editable y lo envía a #weekly-check-ins.
//
// Privacidad: los IDS de management nunca entran salvo con su resumen
// compartible aprobado al cerrar la reunión; lo que se oculta en la página
// Semana no le llega ni a Claude ni a Slack.

import { prisma } from "@/lib/db";
import { appUrl, companyMetricNames } from "@/lib/report/config";
import { neutralizeSlack, oneLine, screenSensitive } from "@/lib/report/privacy";
import { realSlackProvider, type SlackProvider } from "@/lib/report/providers";
import type { MeetingReportSnapshot } from "@/lib/report/types";
import { getQuarterSelection } from "@/lib/selection/quarterSelection";
import { crIsoDate, crWeekEnd } from "@/lib/time/costaRica";
import { formatMetricValue } from "@/lib/metrics/format";
import { isActionableState, resolveDataState } from "@/lib/metrics/dataState";
import { listCheckinMembers } from "@/lib/checkin/teamCheckin";
import { teamConfig } from "@/lib/checkin/teams";
import { claudeJson } from "./claude";
import { readThemes } from "./themes";
import { draftToParts, narrativePrompt, parseNarrative, renderWeeklyDraft, summarizeEnergy, type WeekAnswer, type WeekArea, type WeekData, type WeekManagement, type WeekMetric } from "./render";

export function weeklyChannel(): string | null {
  const v = process.env.WEEKLY_CHANNEL_ID?.trim();
  return v ? v : null;
}

export function weekUrl(periodStart: Date): string | null {
  const base = appUrl();
  return base ? `${base}/semana?w=${crIsoDate(periodStart)}` : null;
}

// ---------------------------------------------------------------------------
// Datos de la semana
// ---------------------------------------------------------------------------

export type ManagementCandidate = { key: string; kind: "commitment" | "issue"; label: string; hidden: boolean };

export type LoadedWeek = {
  data: WeekData;
  // Ítems de management que se pueden ocultar desde la página.
  managementCandidates: ManagementCandidate[];
  meetingId: string | null;
};

const ROCK_STATUS = new Set(["on_track", "riesgo", "off_track", "done"]);

export async function loadWeek(periodStart: Date, options: { now?: Date } = {}): Promise<LoadedWeek> {
  const now = options.now ?? new Date();
  const periodEnd = crWeekEnd(periodStart);
  const quarter =
    (await prisma.quarter.findFirst({ where: { startDate: { lte: periodEnd }, endDate: { gte: periodStart } }, orderBy: { startDate: "desc" } })) ??
    (await prisma.quarter.findFirst({ where: { isActive: true } }));

  const [areas, checkins, summary, members] = await Promise.all([
    prisma.reportArea.findMany({ where: { active: true }, include: { leader: { select: { id: true, name: true } } }, orderBy: { sortOrder: "asc" } }),
    prisma.teamCheckin.findMany({ where: { periodStart }, orderBy: [{ areaKey: "asc" }, { authorName: "asc" }] }),
    prisma.weeklySummary.findUnique({ where: { periodStart } }),
    // Roster vigente hoy: quien entra al equipo a mitad de semana igual cuenta.
    listCheckinMembers(now),
  ]);
  const hiddenItems = new Set(Array.isArray(summary?.hiddenItems) ? (summary!.hiddenItems as string[]) : []);

  // ---- Rocks y avance validado por el líder --------------------------------
  const areaBlocks: WeekArea[] = [];
  if (quarter) {
    const [configs, preps] = await Promise.all([
      prisma.areaQuarterConfig.findMany({ where: { quarterId: quarter.id } }),
      prisma.leaderPrep.findMany({ where: { createdAt: { gte: periodStart, lte: periodEnd } }, orderBy: { updatedAt: "desc" } }),
    ]);
    const leaderIds = areas.map((a) => a.leaderId).filter((v): v is string => !!v);
    const rockIds = configs.map((c) => c.principalRockId).filter((v): v is string => !!v);
    const rocks = await prisma.rock.findMany({
      where: { quarterId: quarter.id, OR: [{ id: { in: rockIds } }, { ownerId: { in: leaderIds }, finalStatus: null }] },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    for (const area of areas) {
      const cfg = configs.find((c) => c.areaId === area.id);
      const rock = (cfg?.principalRockId ? rocks.find((r) => r.id === cfg.principalRockId) : undefined) ?? rocks.find((r) => r.ownerId === area.leaderId) ?? null;
      const prep = preps.find((p) => p.areaId === area.id);
      const block = (prep?.blocks ?? {}) as { rock?: { status?: string; reported?: { advance?: string | null; nextStep?: string | null } } };
      const reported = block.rock?.status === "answered" ? block.rock.reported : undefined;
      const advance = reported?.advance && !screenSensitive(reported.advance).sensitive ? reported.advance : null;
      const nextStep = reported?.nextStep && !screenSensitive(reported.nextStep).sensitive ? reported.nextStep : null;
      areaBlocks.push({
        key: area.key,
        name: area.name,
        leaderName: area.leader?.name ?? null,
        rock: rock ? { title: neutralizeSlack(rock.title), status: ROCK_STATUS.has(rock.status) ? rock.status : "on_track" } : null,
        advance,
        nextStep,
      });
    }
  }

  // ---- Métricas de empresa (las mismas que el resumen de management) -------
  const companyMetrics: WeekMetric[] = [];
  const names = companyMetricNames();
  if (names.length) {
    const found = await prisma.scorecardMetric.findMany({
      where: { name: { in: names } },
      include: { entries: { where: { periodStart: { lte: periodEnd } }, orderBy: { periodStart: "desc" }, take: 1 } },
    });
    const signals = quarter ? (await getQuarterSelection(quarter.id, { now: periodEnd < now ? periodEnd : now })).rows : [];
    for (const name of names) {
      const m = found.find((x) => x.name === name);
      if (!m) continue;
      const entry = m.entries[0] ?? null;
      const state = resolveDataState(entry, { frequency: m.frequency, now: periodEnd < now ? periodEnd : now, autoSynced: m.dataSource !== "manual" });
      const sel = signals.find((r) => r.scorecardMetricId === m.id || r.metric?.id === m.id);
      companyMetrics.push({
        label: m.name,
        valueText: isActionableState(state) && entry ? entry.actualDisplay ?? formatMetricValue(entry.actualValue, m.unit) : null,
        targetText: sel?.targetText ?? null,
        signal: sel?.signal ?? null,
      });
    }
  }

  // ---- Respuestas del equipo (sin las ocultas ni las sensibles) -------------
  const answers: WeekAnswer[] = [];
  for (const c of checkins) {
    if (c.hidden) continue;
    const all = [c.result, c.learning, c.extra, c.blocker, c.commitment].filter(Boolean).join(" ");
    if (screenSensitive(all).sensitive) continue;
    const team = teamConfig(c.teamKey);
    answers.push({
      id: c.id,
      name: c.authorName,
      teamName: team?.name ?? c.teamKey,
      areaKey: c.areaKey,
      result: c.result,
      learning: c.learning,
      extra: c.extra,
      extraQuestion: team?.extra ?? null,
      blocker: c.blocker,
      commitment: c.commitment,
      previousCommitment: c.previousCommitment,
      previousStatus: c.previousCommitmentStatus,
      numbers: Array.isArray(c.numbers) ? (c.numbers as Array<{ label: string; value: number | null }>) : [],
      highlighted: c.highlighted,
    });
  }
  // Lo que el líder destacó en su preparación cuenta como destacado.
  const evidenceIds = new Set<string>();
  const preps = await prisma.leaderPrep.findMany({ where: { createdAt: { gte: periodStart, lte: periodEnd } }, select: { blocks: true } });
  for (const p of preps) {
    const w = (p.blocks as { wins?: { highlighted?: Array<{ evidenceId?: string | null }> } }).wins;
    for (const h of w?.highlighted ?? []) if (h.evidenceId) evidenceIds.add(h.evidenceId);
  }
  for (const a of answers) {
    const row = checkins.find((c) => c.id === a.id);
    if (row?.evidenceId && evidenceIds.has(row.evidenceId)) a.highlighted = true;
  }

  // ---- Reunión de management cerrada esa semana ------------------------------
  let management: WeekManagement | null = null;
  const candidates: ManagementCandidate[] = [];
  const meeting = await prisma.l10Meeting.findFirst({
    where: { closeOrigin: "human", status: "completed", closedAt: { gte: periodStart, lte: periodEnd } },
    orderBy: { closedAt: "desc" },
  });
  if (meeting) {
    const report = await prisma.meetingReport.findFirst({ where: { meetingId: meeting.id }, orderBy: { version: "desc" } });
    const snap = (report?.content as { snapshot?: MeetingReportSnapshot } | null)?.snapshot;
    if (snap) {
      const agreements = snap.agreements.filter((a) => !a.previous && a.accepted);
      for (const a of agreements) candidates.push({ key: `commitment:${a.id}`, kind: "commitment", label: `${a.action} — ${a.ownerName}`, hidden: hiddenItems.has(`commitment:${a.id}`) });
      for (const b of snap.blockers) candidates.push({ key: `issue:${b.id}`, kind: "issue", label: b.text, hidden: hiddenItems.has(`issue:${b.id}`) });
      management = {
        meetingDate: snap.meetingDate,
        agreements: agreements
          .filter((a) => !hiddenItems.has(`commitment:${a.id}`))
          .map((a) => ({ id: a.id, action: a.action, ownerName: a.ownerName, dueDate: a.dueDate, status: a.status })),
        decisions: snap.blockers.filter((b) => !hiddenItems.has(`issue:${b.id}`)).map((b) => ({ id: b.id, text: b.text, resolved: b.resolved })),
      };
      // Si la reunión trae el avance confirmado de un Rock, ese manda.
      for (const area of areaBlocks) {
        const a = snap.areas.find((x) => x.areaKey === area.key);
        if (a?.advance && !area.advance) area.advance = a.advance;
        if (a?.nextStep && !area.nextStep) area.nextStep = a.nextStep;
      }
    }
  }

  // ---- Lo que escuchamos: temas del equipo llevados a IDS -------------------
  const promoted = readThemes(summary?.teamThemes).filter((t) => t.issueId);
  const promotedIssues = promoted.length
    ? await prisma.l10Issue.findMany({ where: { id: { in: promoted.map((t) => t.issueId!) } }, select: { id: true, idsStatus: true, shareable: true, sharedSummary: true } })
    : [];
  const heard = promoted
    .map((t) => ({ t, issue: promotedIssues.find((i) => i.id === t.issueId) }))
    .filter((x) => x.issue && !screenSensitive(x.t.title).sensitive)
    .map(({ t, issue }) => ({
      title: neutralizeSlack(t.title),
      resolved: issue!.idsStatus === "resolved",
      sharedSummary: issue!.shareable && issue!.sharedSummary ? neutralizeSlack(issue!.sharedSummary) : null,
    }));

  return {
    data: {
      periodStart,
      heard,
      companyMetrics,
      areas: areaBlocks,
      answers,
      responded: checkins.length,
      energy: summarizeEnergy(checkins.map((c) => c.energy)),
      expected: members.length,
      areaParticipation: areas.map((a) => {
        const responded = checkins.filter((c) => c.areaKey === a.key).length;
        return { name: a.name, responded, expected: Math.max(members.filter((m) => m.areaKey === a.key).length, responded) };
      }),
      management,
      detailUrl: weekUrl(periodStart),
    },
    managementCandidates: candidates,
    meetingId: meeting?.id ?? null,
  };
}

// ---------------------------------------------------------------------------
// Borrador
// ---------------------------------------------------------------------------

export type DraftDeps = { claude: (prompt: string) => Promise<unknown> };

// Genera (o regenera) el borrador. No pisa un borrador editado a mano salvo
// que se pida (force) ni toca un resumen ya enviado.
export async function generateDraft(
  periodStart: Date,
  options: { force?: boolean; now?: Date; deps?: DraftDeps } = {},
): Promise<{ status: "generated" | "kept_edited" | "already_sent"; draftText: string | null; usedNarrative: boolean }> {
  const existing = await prisma.weeklySummary.findUnique({ where: { periodStart } });
  if (existing && (existing.status === "sent" || existing.status === "sending")) {
    return { status: "already_sent", draftText: existing.draftText, usedNarrative: false };
  }
  if (existing?.editedAt && !options.force) return { status: "kept_edited", draftText: existing.draftText, usedNarrative: false };

  const week = await loadWeek(periodStart, { now: options.now });
  const deps = options.deps ?? { claude: claudeJson };
  const narrative = week.data.answers.length ? parseNarrative(await deps.claude(narrativePrompt(week.data)), week.data) : null;
  const draftText = renderWeeklyDraft(week.data, narrative);
  await prisma.weeklySummary.upsert({
    where: { periodStart },
    create: { periodStart, draftText, generatedAt: new Date(), meetingId: week.meetingId },
    update: { draftText, generatedAt: new Date(), editedAt: null, meetingId: week.meetingId, lastError: null, ...(existing?.status === "failed" ? { status: "draft" } : {}) },
  });
  return { status: "generated", draftText, usedNarrative: !!narrative };
}

export async function saveDraftText(periodStart: Date, text: string): Promise<void> {
  const clean = text.replace(/\r/g, "").slice(0, 30_000);
  const existing = await prisma.weeklySummary.findUnique({ where: { periodStart } });
  if (existing && (existing.status === "sent" || existing.status === "sending")) throw new SummaryError("already_sent", "El resumen ya se envió.");
  await prisma.weeklySummary.upsert({
    where: { periodStart },
    create: { periodStart, draftText: clean, editedAt: new Date() },
    update: { draftText: clean, editedAt: new Date(), ...(existing?.status === "failed" ? { status: "draft" } : {}) },
  });
}

export async function setManagementHidden(periodStart: Date, key: string, hidden: boolean): Promise<void> {
  const existing = await prisma.weeklySummary.findUnique({ where: { periodStart } });
  const current = new Set(Array.isArray(existing?.hiddenItems) ? (existing!.hiddenItems as string[]) : []);
  if (hidden) current.add(key);
  else current.delete(key);
  await prisma.weeklySummary.upsert({
    where: { periodStart },
    create: { periodStart, hiddenItems: [...current] },
    update: { hiddenItems: [...current] },
  });
}

// ---------------------------------------------------------------------------
// Envío
// ---------------------------------------------------------------------------

export class SummaryError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "SummaryError";
  }
}

export async function sendSummary(
  periodStart: Date,
  actorId: string,
  options: { slack?: SlackProvider; channel?: string | null } = {},
): Promise<{ channel: string; ts: string; permalink: string | null; threadErrors: number }> {
  const channel = options.channel ?? weeklyChannel();
  if (!channel) throw new SummaryError("no_channel", "Falta configurar el canal (WEEKLY_CHANNEL_ID).");
  const slack = options.slack ?? realSlackProvider;

  const row = await prisma.weeklySummary.findUnique({ where: { periodStart } });
  if (!row?.draftText?.trim()) throw new SummaryError("no_draft", "Primero generá o escribí el borrador.");
  const parts = draftToParts(row.draftText);
  if (!parts.length) throw new SummaryError("no_draft", "El borrador está vacío.");

  // Reclamo atómico: un doble clic o dos pestañas no publican dos veces.
  const claimed = await prisma.weeklySummary.updateMany({
    where: { id: row.id, status: { in: ["draft", "failed"] } },
    data: { status: "sending", lastError: null },
  });
  if (claimed.count !== 1) throw new SummaryError("already_sent", "El resumen ya se envió o se está enviando.");

  const key = `weekly:${crIsoDate(periodStart)}`;
  const startedAt = new Date();
  let main = await slack.post({ channel, text: parts[0], idempotencyKey: `${key}:0` });
  if (main.status === "uncertain") {
    const found = await slack.find({ channel, idempotencyKey: `${key}:0`, since: startedAt });
    if (found.found === true) main = { status: "sent", ts: found.ts, channel };
  }
  if (main.status !== "sent") {
    const error = main.status === "uncertain" ? `No sabemos si llegó (${main.error}). Revisá el canal antes de reintentar.` : `Slack rechazó el mensaje (${main.error}).`;
    await prisma.weeklySummary.update({ where: { id: row.id }, data: { status: main.status === "uncertain" ? "sending" : "failed", lastError: error } });
    throw new SummaryError("send_failed", error);
  }

  let threadErrors = 0;
  for (let i = 1; i < parts.length; i++) {
    const r = await slack.post({ channel: main.channel, text: parts[i], threadTs: main.ts, idempotencyKey: `${key}:${i}` });
    if (r.status !== "sent") threadErrors += 1;
  }
  const permalink = await getPermalink(main.channel, main.ts);
  await prisma.weeklySummary.update({
    where: { id: row.id },
    data: {
      status: "sent",
      channel: main.channel,
      slackTs: main.ts,
      permalink,
      sentAt: new Date(),
      sentById: actorId,
      lastError: threadErrors ? `${threadErrors} parte${threadErrors === 1 ? "" : "s"} del hilo no se enviaron.` : null,
    },
  });
  return { channel: main.channel, ts: main.ts, permalink, threadErrors };
}

async function getPermalink(channel: string, ts: string): Promise<string | null> {
  try {
    const res = await fetch(`https://slack.com/api/chat.getPermalink?channel=${encodeURIComponent(channel)}&message_ts=${encodeURIComponent(ts)}`, {
      headers: { Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}` },
      signal: AbortSignal.timeout(5_000),
    });
    const data = (await res.json()) as { ok?: boolean; permalink?: string };
    return data.ok ? data.permalink ?? null : null;
  } catch {
    return null;
  }
}

// Vista previa sin guardar nada (la usa la página y el dry-run del cron).
export function previewParts(draftText: string): string[] {
  return draftToParts(draftText);
}

export function answerLabel(text: string, max = 160): string {
  return oneLine(text, max);
}
