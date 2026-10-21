// Check-in semanal del equipo por formulario de Slack.
//
//   jueves 15:00 CR  → DM a cada persona con su equipo asignado (botón)
//   viernes 08:00 CR → recordatorio a quien no respondió
//   viernes 11:00 CR → se arma el resumen con lo que haya (no hay corte duro)
//
// La respuesta se guarda en EOS (TeamCheckin), se refleja en CheckinEvidence
// para que la preparación de líderes y el resumen de management la usen, y se
// copia a Notion. La persona se identifica solo por ReportMember.slackUserId
// verificado y vigente; nunca por nombre.

import { prisma } from "@/lib/db";
import { getQuarterSelection } from "@/lib/selection/quarterSelection";
import { crIsoDate, crMidnight, crWeekStart } from "@/lib/time/costaRica";
import { oneLine } from "@/lib/report/privacy";
import { safeErrorLabel } from "@/lib/integrations/checkinStore";
import {
  buildModal, inviteBlocks, numbersText, parseMetadata, parseSubmission, submissionText,
  type ExistingAnswers, type Submission, type SystemNumber,
} from "./teamForm";
import { metricMatchesTeam, PREVIOUS_STATUS_LABEL, teamConfig, type TeamConfig } from "./teams";
import { upsertTeamCheckinNotion } from "./teamNotion";

const DAY_MS = 24 * 60 * 60 * 1000;
// El reflejo en CheckinEvidence usa este "canal" y la clave semana:persona.
export const FORM_CHANNEL = "slack-form";

// ---------------------------------------------------------------------------
// Slack
// ---------------------------------------------------------------------------

async function slack(method: string, params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const res = await fetch(`https://slack.com/api/${method}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}`, "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(params),
    signal: AbortSignal.timeout(8_000),
  });
  const data = (await res.json()) as Record<string, unknown>;
  if (!data.ok) throw new Error(`Slack ${method} failed: ${String(data.error ?? res.status)}`);
  return data;
}

// ---------------------------------------------------------------------------
// Período y personas
// ---------------------------------------------------------------------------

// La semana del check-in: lunes 00:00 CR de la semana en curso (jueves y
// viernes caen en la misma).
export function checkinWeek(now: Date): Date {
  return crWeekStart(now);
}

export function periodFromIso(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const d = crMidnight(Number(m[1]), Number(m[2]), Number(m[3]));
  // Solo lunes: el valor viene del botón, pero no se confía en él.
  return crWeekStart(d).getTime() === d.getTime() ? d : null;
}

export type CheckinMember = {
  id: string;
  displayName: string;
  slackUserId: string;
  userId: string | null;
  areaKey: string;
  team: TeamConfig;
};

export async function listCheckinMembers(at: Date): Promise<CheckinMember[]> {
  const rows = await prisma.reportMember.findMany({
    where: {
      identityVerified: true,
      slackUserId: { not: null },
      teamKey: { not: null },
      validFrom: { lte: at },
      OR: [{ validTo: null }, { validTo: { gt: at } }],
    },
    include: { area: { select: { key: true } } },
    orderBy: { displayName: "asc" },
  });
  const seen = new Set<string>();
  const out: CheckinMember[] = [];
  for (const r of rows) {
    const team = teamConfig(r.teamKey);
    if (!team || !r.slackUserId || seen.has(r.slackUserId)) continue;
    seen.add(r.slackUserId);
    out.push({ id: r.id, displayName: r.displayName, slackUserId: r.slackUserId, userId: r.userId, areaKey: r.area.key, team });
  }
  return out;
}

async function memberBySlackId(slackUserId: string, at: Date): Promise<CheckinMember | null> {
  return (await listCheckinMembers(at)).find((m) => m.slackUserId === slackUserId) ?? null;
}

const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;

// ---------------------------------------------------------------------------
// Números de sistemas del área del equipo
// ---------------------------------------------------------------------------

export async function systemNumbersFor(team: TeamConfig, now: Date): Promise<SystemNumber[]> {
  const quarter = await prisma.quarter.findFirst({ where: { isActive: true }, select: { id: true } });
  if (!quarter) return [];
  const selection = await getQuarterSelection(quarter.id, { now });
  return selection.rows
    .filter((r) => r.areaKey === team.areaKey && metricMatchesTeam(team, r.label))
    .map((r) => ({
      label: r.label,
      valueText: r.pendingConfig ? null : r.valueText,
      targetText: r.pendingConfig ? "pendiente de configurar" : r.targetText,
      periodLabel: r.periodLabel,
    }));
}

async function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), ms);
  });
  try {
    return await Promise.race([promise.catch(() => fallback), timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Cron: invitación (jueves) y recordatorio (viernes)
// ---------------------------------------------------------------------------

export type TeamCheckinRunResult = {
  step: "open" | "remind";
  period: string;
  sent: string[];
  skipped: Array<{ name: string; reason: string }>;
  dryRun: boolean;
};

export async function runTeamCheckin(options: { step: "open" | "remind"; dryRun?: boolean; onlySlackUserId?: string; now?: Date }): Promise<TeamCheckinRunResult> {
  const now = options.now ?? new Date();
  const period = checkinWeek(now);
  const dryRun = options.dryRun ?? false;
  const result: TeamCheckinRunResult = { step: options.step, period: crIsoDate(period), sent: [], skipped: [], dryRun };

  let members = await listCheckinMembers(now);
  if (options.onlySlackUserId) members = members.filter((m) => m.slackUserId === options.onlySlackUserId);

  const [invites, answers] = await Promise.all([
    prisma.teamCheckinInvite.findMany({ where: { periodStart: period } }),
    prisma.teamCheckin.findMany({ where: { periodStart: period }, select: { slackUserId: true } }),
  ]);
  const inviteBy = new Map(invites.map((i) => [i.slackUserId, i]));
  const answered = new Set(answers.map((a) => a.slackUserId));

  for (const m of members) {
    const invite = inviteBy.get(m.slackUserId);
    if (options.step === "open" && invite) {
      result.skipped.push({ name: m.displayName, reason: "ya recibió la invitación" });
      continue;
    }
    if (options.step === "remind") {
      if (answered.has(m.slackUserId)) {
        result.skipped.push({ name: m.displayName, reason: "ya respondió" });
        continue;
      }
      if (invite?.remindedAt) {
        result.skipped.push({ name: m.displayName, reason: "ya se le recordó" });
        continue;
      }
    }
    if (dryRun) {
      result.sent.push(`${m.displayName} (${m.team.name}, dry-run)`);
      continue;
    }
    try {
      const dmChannel =
        invite?.dmChannel ?? String(((await slack("conversations.open", { users: m.slackUserId })).channel as { id?: string })?.id ?? "");
      if (!dmChannel) throw new Error("sin canal de DM");
      const message = inviteBlocks({ firstName: firstName(m.displayName), teamName: m.team.name, periodStart: period, reminder: options.step === "remind", answered: false });
      const posted = await slack("chat.postMessage", { channel: dmChannel, ...message, unfurl_links: false });
      const ts = String(posted.ts ?? "");
      await prisma.teamCheckinInvite.upsert({
        where: { periodStart_slackUserId: { periodStart: period, slackUserId: m.slackUserId } },
        create: {
          periodStart: period, memberId: m.id, slackUserId: m.slackUserId, dmChannel, messageTs: ts || null,
          remindedAt: options.step === "remind" ? now : null,
        },
        update: { messageTs: ts || null, ...(options.step === "remind" ? { remindedAt: now } : {}) },
      });
      result.sent.push(m.displayName);
    } catch (error) {
      result.skipped.push({ name: m.displayName, reason: `no se pudo enviar (${safeErrorLabel(error)})` });
    }
  }

  console.log(`[team-checkin] ${options.step}: enviados ${result.sent.length}, saltados ${result.skipped.length}${dryRun ? " (dry-run)" : ""}`);
  return result;
}

// ---------------------------------------------------------------------------
// Botón → modal
// ---------------------------------------------------------------------------

function toExisting(row: {
  result: string; learning: string; extra: string | null; blocker: string | null; commitment: string;
  previousCommitmentStatus: string | null; numbers: unknown;
}): ExistingAnswers {
  const numbers = Array.isArray(row.numbers) ? (row.numbers as Array<{ key: string; value: number | null }>) : [];
  return { ...row, numbers };
}

async function previousCommitmentFor(slackUserId: string, period: Date): Promise<string | null> {
  const prev = await prisma.teamCheckin.findFirst({
    where: { slackUserId, periodStart: { lt: period, gte: new Date(period.getTime() - 21 * DAY_MS) } },
    orderBy: { periodStart: "desc" },
    select: { commitment: true },
  });
  return prev?.commitment ?? null;
}

export async function openTeamCheckinModal(input: { triggerId: string; slackUserId: string; buttonValue: string | undefined; now?: Date }): Promise<void> {
  const now = input.now ?? new Date();
  let periodIso: string | null = null;
  try {
    periodIso = (JSON.parse(input.buttonValue ?? "{}") as { p?: string }).p ?? null;
  } catch {
    periodIso = null;
  }
  const period = (periodIso && periodFromIso(periodIso)) || checkinWeek(now);

  const member = await memberBySlackId(input.slackUserId, now);
  if (!member) {
    await slack("views.open", {
      trigger_id: input.triggerId,
      view: {
        type: "modal",
        title: { type: "plain_text", text: "Check-in semanal" },
        close: { type: "plain_text", text: "Cerrar" },
        blocks: [{ type: "section", text: { type: "mrkdwn", text: "No encontré tu equipo en EOS. Avisale a quien administra el check-in para que te agregue." } }],
      },
    });
    return;
  }

  const [existing, previousCommitment, systemNumbers] = await Promise.all([
    prisma.teamCheckin.findUnique({ where: { periodStart_slackUserId: { periodStart: period, slackUserId: member.slackUserId } } }),
    previousCommitmentFor(member.slackUserId, period),
    // El trigger de Slack vence a los 3 s: si los números tardan, se abre sin ellos.
    withTimeout(systemNumbersFor(member.team, now), 1500, [] as SystemNumber[]),
  ]);

  const view = buildModal({
    team: member.team,
    periodStart: period,
    firstName: firstName(member.displayName),
    systemNumbers,
    previousCommitment,
    existing: existing ? toExisting(existing) : null,
    memberId: member.id,
  });
  await slack("views.open", { trigger_id: input.triggerId, view });
}

// ---------------------------------------------------------------------------
// Envío del modal
// ---------------------------------------------------------------------------

export type SubmitOutcome =
  | { kind: "errors"; errors: Record<string, string> }
  | { kind: "saved"; checkinId: string; followUp: () => Promise<void> }
  | { kind: "rejected"; reason: string };

export async function submitTeamCheckin(input: {
  slackUserId: string;
  privateMetadata: unknown;
  values: Record<string, Record<string, { value?: string | null; selected_option?: { value?: string } | null }>>;
  now?: Date;
}): Promise<SubmitOutcome> {
  const now = input.now ?? new Date();
  const meta = parseMetadata(input.privateMetadata);
  const period = meta ? periodFromIso(meta.p) : null;
  if (!meta || !period) return { kind: "rejected", reason: "metadata" };

  const memberRow = await prisma.reportMember.findUnique({ where: { id: meta.m }, include: { area: { select: { key: true } } } });
  // El formulario es de quien lo abrió: el id de Slack del envío debe coincidir.
  if (!memberRow || memberRow.slackUserId !== input.slackUserId || !memberRow.identityVerified) return { kind: "rejected", reason: "member" };
  const team = teamConfig(memberRow.teamKey);
  if (!team) return { kind: "rejected", reason: "team" };

  const previousCommitment = await previousCommitmentFor(input.slackUserId, period);
  const parsed = parseSubmission(team, input.values, !!previousCommitment);
  if (!parsed.ok) return { kind: "errors", errors: parsed.errors };
  const s = parsed.submission;

  const saved = await saveCheckin({
    period, now, team, previousCommitment, submission: s,
    member: { id: memberRow.id, displayName: memberRow.displayName, slackUserId: input.slackUserId, userId: memberRow.userId, areaKey: memberRow.area.key },
  });

  return {
    kind: "saved",
    checkinId: saved.id,
    followUp: async () => {
      await markInviteAnswered(period, input.slackUserId, memberRow.displayName, team.name);
      await syncNotion(saved.id, team);
    },
  };
}

type SaveInput = {
  period: Date;
  now: Date;
  team: TeamConfig;
  previousCommitment: string | null;
  submission: Submission;
  member: { id: string; displayName: string; slackUserId: string; userId: string | null; areaKey: string };
};

export async function saveCheckin(input: SaveInput) {
  const { period, now, team, submission: s, member } = input;
  const key = { periodStart_slackUserId: { periodStart: period, slackUserId: member.slackUserId } };
  const current = await prisma.teamCheckin.findUnique({ where: key });
  const revisions = current
    ? [
        ...(Array.isArray(current.revisions) ? (current.revisions as unknown[]) : []),
        { at: current.updatedAt.toISOString(), result: current.result, learning: current.learning, extra: current.extra, blocker: current.blocker, commitment: current.commitment },
      ].slice(-10)
    : [];

  const data = {
    memberId: member.id,
    userId: member.userId,
    areaKey: member.areaKey,
    teamKey: team.key,
    authorName: member.displayName,
    result: s.result,
    learning: s.learning,
    extra: s.extra,
    blocker: s.blocker,
    commitment: s.commitment,
    previousCommitment: input.previousCommitment,
    previousCommitmentStatus: s.previousCommitmentStatus,
    numbers: s.numbers as unknown as object,
    submittedAt: now,
  };
  const row = await prisma.teamCheckin.upsert({
    where: key,
    create: { periodStart: period, slackUserId: member.slackUserId, ...data },
    update: { ...data, revisions: revisions as unknown as object },
  });

  // Reflejo en la evidencia del check-in: resultado = win, bloqueo = reto.
  const evidenceKey = { channelId_messageTs: { channelId: FORM_CHANNEL, messageTs: `${crIsoDate(period)}:${member.slackUserId}` } };
  const evidence = await prisma.checkinEvidence.upsert({
    where: evidenceKey,
    create: {
      channelId: FORM_CHANNEL,
      messageTs: `${crIsoDate(period)}:${member.slackUserId}`,
      slackUserId: member.slackUserId,
      userId: member.userId,
      areaKey: member.areaKey,
      authorName: member.displayName,
      periodStart: period,
      reportedAt: now,
      originalText: submissionText(team, s, input.previousCommitment),
      win: s.result,
      challenge: s.blocker,
    },
    update: {
      originalText: submissionText(team, s, input.previousCommitment),
      win: s.result,
      challenge: s.blocker,
      deletedAt: null,
    },
  });
  if (row.evidenceId !== evidence.id) {
    await prisma.teamCheckin.update({ where: { id: row.id }, data: { evidenceId: evidence.id } });
  }
  return row;
}

async function markInviteAnswered(period: Date, slackUserId: string, name: string, teamName: string): Promise<void> {
  const invite = await prisma.teamCheckinInvite.findUnique({ where: { periodStart_slackUserId: { periodStart: period, slackUserId } } });
  if (!invite?.messageTs) return;
  try {
    const message = inviteBlocks({ firstName: firstName(name), teamName, periodStart: period, reminder: false, answered: true });
    await slack("chat.update", { channel: invite.dmChannel, ts: invite.messageTs, ...message });
  } catch (error) {
    console.error(`[team-checkin] No se pudo marcar la invitación como respondida (${safeErrorLabel(error)})`);
  }
}

async function syncNotion(checkinId: string, team: TeamConfig): Promise<void> {
  const row = await prisma.teamCheckin.findUnique({ where: { id: checkinId } });
  if (!row) return;
  try {
    const numbers = Array.isArray(row.numbers) ? (row.numbers as Submission["numbers"]) : [];
    const pageId = await upsertTeamCheckinNotion(
      {
        title: `Check-in — ${row.authorName} — ${crIsoDate(row.periodStart)}`,
        person: row.authorName,
        date: crIsoDate(row.submittedAt),
        team: team.name,
        result: row.result,
        learning: row.learning,
        extra: row.extra,
        blocker: row.blocker,
        commitment: row.commitment,
        previous: row.previousCommitment
          ? `${PREVIOUS_STATUS_LABEL[row.previousCommitmentStatus ?? ""] ?? "Sin marcar"}: ${oneLine(row.previousCommitment, 300)}`
          : null,
        numbers: numbersText(numbers),
      },
      row.notionPageId,
    );
    if (pageId && pageId !== row.notionPageId) await prisma.teamCheckin.update({ where: { id: row.id }, data: { notionPageId: pageId } });
  } catch (error) {
    // EOS ya tiene la respuesta; Notion es solo la copia.
    console.error(`[team-checkin] Notion falló (${safeErrorLabel(error)})`);
  }
}

// ---------------------------------------------------------------------------
// Estado de la semana (página Semana)
// ---------------------------------------------------------------------------

export async function weekParticipation(period: Date, at: Date) {
  const [members, answers] = await Promise.all([
    listCheckinMembers(at),
    prisma.teamCheckin.findMany({ where: { periodStart: period } }),
  ]);
  const answeredIds = new Set(answers.map((a) => a.slackUserId));
  return {
    members,
    answers,
    pending: members.filter((m) => !answeredIds.has(m.slackUserId)),
  };
}
