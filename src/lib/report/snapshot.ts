// Arma el snapshot del resumen de management de UNA reunión concreta (por
// meetingId y su quarterId), nunca "la reunión más reciente no completada".
// Todo lo que sale es una lista explícita de campos: no hay forma de que una
// nota privada del L10 llegue acá sin pasar por un campo compartible.

import crypto from "crypto";
import { prisma } from "@/lib/db";
import { crIsoDate, reportPeriodFor } from "@/lib/time/costaRica";
import { getQuarterSelection } from "@/lib/selection/quarterSelection";
import { formatMetricValue } from "@/lib/metrics/format";
import { isActionableState, resolveDataState } from "@/lib/metrics/dataState";
import { appUrl, companyMetricNames } from "./config";
import { neutralizeSlack, oneLine, screenSensitive } from "./privacy";
import {
  SNAPSHOT_SCHEMA,
  type AgreementItem,
  type AreaBlock,
  type BlockerItem,
  type ContributionItem,
  type MeetingReportSnapshot,
  type MetricLine,
  type RockStatusLabel,
  type WinItem,
} from "./types";

export type InclusionChoice = {
  wins?: string[];
  contributions?: string[];
  issues?: string[];
  commitments?: string[];
};

export type ExcludedItem = {
  kind: "win" | "contribution" | "issue" | "commitment";
  id: string;
  label: string;
  reason: string;
  // true = no se puede incluir aunque se pida (dato sensible).
  locked: boolean;
};

export type Candidate = {
  kind: "win" | "contribution" | "issue" | "commitment";
  id: string;
  label: string;
  included: boolean;
  locked: boolean;
  reason: string | null;
};

export type BuildResult = {
  snapshot: MeetingReportSnapshot;
  fingerprint: string;
  candidates: Candidate[];
};

const ROCK_LABEL: Record<string, RockStatusLabel> = {
  on_track: "en_camino",
  riesgo: "en_riesgo",
  off_track: "en_riesgo",
  done: "completado",
};

// Huella del contenido PUBLICABLE: excluye lo volátil (hora de corte, quién
// cerró, versión de la reunión) para que "no cambió el contenido" sea cierto.
export function contentFingerprint(snapshot: MeetingReportSnapshot): string {
  const { period, closedByName: _closedBy, update: _update, meetingVersion: _v, ...rest } = snapshot;
  void _closedBy;
  void _update;
  void _v;
  const stable = { ...rest, period: { start: period.start, end: period.end } };
  return crypto.createHash("sha256").update(canonicalJson(stable)).digest("hex");
}

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

type Options = {
  now?: Date;
  choice?: InclusionChoice | null;
  closedByName?: string;
  // Si ya hay una versión publicada, la nueva es una actualización.
  previous?: { version: number; cutAt: Date; contentFingerprint?: string } | null;
  updateReason?: string | null;
};

export async function buildMeetingSnapshot(meetingId: string, options: Options = {}): Promise<BuildResult> {
  const now = options.now ?? new Date();

  const meeting = await prisma.l10Meeting.findUnique({
    where: { id: meetingId },
    include: { quarter: true, closedBy: { select: { name: true } } },
  });
  if (!meeting) throw new Error("Reunión no encontrada");

  const period =
    meeting.periodStart && meeting.periodEnd
      ? { start: meeting.periodStart, end: meeting.periodEnd }
      : reportPeriodFor(meeting.date);
  const cutAt = options.now ?? meeting.cutAt ?? meeting.closedAt ?? now;
  const quarter = meeting.quarter;
  const quarterLabel = `Q${quarter.quarter} ${quarter.year}`;
  const choice = options.choice ?? null;
  const hasPublished = !!options.previous;

  const [areas, areaConfigs, preps, selection, wins, evidence, issues, commitments] = await Promise.all([
    prisma.reportArea.findMany({
      where: { active: true },
      include: { leader: { select: { id: true, name: true } } },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.areaQuarterConfig.findMany({ where: { quarterId: quarter.id } }),
    prisma.leaderPrep.findMany({ where: { meetingId } }),
    getQuarterSelection(quarter.id, { now: cutAt, cutAt }),
    prisma.winChallenge.findMany({
      where: {
        quarterId: quarter.id,
        entryType: "win",
        highlighted: true,
        reportDate: { gte: period.start, lte: cutAt },
      },
      include: { user: { select: { name: true } } },
      orderBy: [{ reportDate: "asc" }, { id: "asc" }],
    }),
    prisma.checkinEvidence.findMany({
      where: { periodStart: { gte: period.start, lte: period.end }, deletedAt: null },
      orderBy: [{ areaKey: "asc" }, { authorName: "asc" }, { messageTs: "asc" }],
    }),
    prisma.l10Issue.findMany({
      where: { meetingId },
      include: { owner: { select: { name: true } } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    }),
    prisma.l10Commitment.findMany({
      where: {
        OR: [
          { meetingId },
          { meeting: { quarterId: quarter.id }, status: { not: "done" } },
          { meeting: { quarterId: quarter.id }, status: "done", updatedAt: { gte: period.start } },
        ],
      },
      include: { owner: { select: { name: true } } },
      orderBy: [{ dueDate: "asc" }, { id: "asc" }],
    }),
  ]);

  const rockIds = areaConfigs.map((c) => c.principalRockId).filter((v): v is string => !!v);
  const leaderIds = areas.map((a) => a.leaderId).filter((v): v is string => !!v);
  const rocks = await prisma.rock.findMany({
    where: { quarterId: quarter.id, OR: [{ id: { in: rockIds } }, { ownerId: { in: leaderIds }, finalStatus: null }] },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  const rockById = new Map(rocks.map((r) => [r.id, r]));
  const configByArea = new Map(areaConfigs.map((c) => [c.areaId, c]));
  const prepByArea = new Map(preps.map((p) => [p.areaId, p]));
  const areaByKey = new Map(areas.map((a) => [a.key, a]));

  const candidates: Candidate[] = [];

  // ---- Áreas: Rock principal + scorecard seleccionado ---------------------
  const areaBlocks: AreaBlock[] = areas.map((area) => {
    const cfg = configByArea.get(area.id);
    const rock =
      (cfg?.principalRockId ? rockById.get(cfg.principalRockId) : undefined) ??
      rocks.find((r) => r.ownerId === area.leaderId) ??
      null;
    const prep = prepByArea.get(area.id);
    const blocks = (prep?.blocks ?? {}) as { rock?: { advance?: string | null; nextStep?: string | null } };
    const rows = selection.rows.filter((r) => r.areaId === area.id);
    const metrics: MetricLine[] = rows.map((r) => ({
      selectionId: r.selectionId,
      label: r.label,
      valueText: r.valueText,
      nOverN: r.nOverN,
      targetText: r.targetText,
      periodLabel: r.periodLabel,
      dataState: r.dataState,
      lastValid: r.lastValid,
      ownerName: r.reportOwnerName,
      pendingConfig: r.pendingConfig,
      signal: r.signal,
    }));
    return {
      areaKey: area.key,
      areaName: area.name,
      leaderName: area.leader?.name ?? null,
      rock: rock
        ? { title: neutralizeSlack(rock.title), status: ROCK_LABEL[rock.status] ?? "sin_estado", progress: rock.progress }
        : null,
      advance: blocks.rock?.advance ? oneLine(blocks.rock.advance, 400) : null,
      nextStep: blocks.rock?.nextStep ? oneLine(blocks.rock.nextStep, 300) : null,
      prepStatus: prep ? (prep.status === "confirmed" ? "confirmed" : "draft") : "missing",
      metrics,
    };
  });

  // ---- Métricas de empresa (solo si están configuradas para esta audiencia) ----
  const companyMetrics: MetricLine[] = [];
  const names = companyMetricNames();
  if (names.length) {
    const found = await prisma.scorecardMetric.findMany({
      where: { name: { in: names } },
      include: { entries: { where: { periodStart: { lte: cutAt } }, orderBy: { periodStart: "desc" }, take: 1 } },
    });
    for (const name of names) {
      const m = found.find((x) => x.name === name);
      if (!m) continue;
      const entry = m.entries[0] ?? null;
      const state = resolveDataState(entry, { frequency: m.frequency, now: cutAt, autoSynced: m.dataSource !== "manual" });
      companyMetrics.push({
        selectionId: `company:${m.id}`,
        label: m.name,
        valueText: isActionableState(state) && entry ? entry.actualDisplay ?? formatMetricValue(entry.actualValue, m.unit) : null,
        nOverN: null,
        targetText: null,
        periodLabel: entry ? `período ${crIsoDate(entry.periodStart)}` : "sin dato del período",
        dataState: state,
        lastValid: null,
        ownerName: null,
        pendingConfig: false,
        signal: null,
      });
    }
  }

  // ---- Wins destacados ------------------------------------------------------
  const winItems: WinItem[] = [];
  for (const w of wins) {
    const text = [w.wins, w.result].filter(Boolean).join(" — ");
    const screen = screenSensitive(text);
    const defaultInclude = !screen.sensitive;
    const included = !screen.sensitive && (choice?.wins ? choice.wins.includes(w.id) : defaultInclude);
    candidates.push({
      kind: "win",
      id: w.id,
      label: `${w.user.name}: ${oneLine(text, 120)}`,
      included,
      locked: screen.sensitive,
      reason: screen.sensitive ? `Posible dato sensible (${screen.categories.join(", ")})` : null,
    });
    if (!included) continue;
    const memberArea = areas.find((a) => a.leaderId === w.userId);
    winItems.push({
      id: w.id,
      areaKey: memberArea?.key ?? null,
      text: oneLine(w.wins ?? "", 300),
      result: w.result ? oneLine(w.result, 200) : null,
      contributors: [w.user.name],
      why: null,
    });
  }

  // ---- Contribuciones del equipo ---------------------------------------------
  const contributionItems: ContributionItem[] = [];
  for (const e of evidence) {
    const raw = [e.win, e.challenge ? `Reto: ${e.challenge}` : null].filter(Boolean).join(" · ");
    if (!raw) continue; // sin contenido profesional que compartir
    // Solo se publica lo extraído (win/reto laboral), nunca el texto original;
    // aun así se revisa por si la extracción arrastró algo sensible.
    const screen = screenSensitive(raw);
    const defaultInclude = hasPublished ? e.shareable : true;
    const included = !screen.sensitive && (choice?.contributions ? choice.contributions.includes(e.id) : defaultInclude);
    candidates.push({
      kind: "contribution",
      id: e.id,
      label: `${e.authorName}: ${oneLine(raw, 120)}`,
      included,
      locked: screen.sensitive,
      reason: screen.sensitive ? `Posible dato sensible (${screen.categories.join(", ")})` : null,
    });
    if (!included) continue;
    const area = e.areaKey ? areaByKey.get(e.areaKey) : undefined;
    contributionItems.push({
      id: e.id,
      areaKey: area?.key ?? null,
      areaName: area?.name ?? null,
      name: neutralizeSlack(e.authorName),
      text: oneLine(raw, 320),
      link: null,
      late: !!options.previous && e.reportedAt > options.previous.cutAt,
    });
  }

  // ---- Bloqueos y decisiones compartibles -----------------------------------
  const blockerItems: BlockerItem[] = [];
  for (const i of issues) {
    const summary = i.sharedSummary?.trim() ?? "";
    const screen = screenSensitive(summary);
    const hasSummary = summary.length > 0;
    const defaultInclude = i.shareable && hasSummary;
    const included = hasSummary && !screen.sensitive && (choice?.issues ? choice.issues.includes(i.id) : defaultInclude);
    if (!hasSummary && !i.shareable) continue; // IDS 100% privado: ni aparece como candidato
    candidates.push({
      kind: "issue",
      id: i.id,
      label: hasSummary ? oneLine(summary, 120) : `${oneLine(i.title, 100)} (sin resumen compartible)`,
      included,
      locked: !hasSummary || screen.sensitive,
      reason: !hasSummary
        ? "Falta el resumen que verá la empresa"
        : screen.sensitive
          ? `Posible dato sensible (${screen.categories.join(", ")})`
          : null,
    });
    if (!included) continue;
    blockerItems.push({
      id: i.id,
      text: oneLine(summary, 400),
      impact: null,
      decision: null,
      helpFrom: i.owner?.name ?? null,
      neededBy: i.dueDate ? crIsoDate(i.dueDate) : null,
      resolved: i.idsStatus === "resolved",
    });
  }

  // ---- Acuerdos ---------------------------------------------------------------
  const agreementItems: AgreementItem[] = [];
  for (const c of commitments) {
    if (!c.shareable && !choice?.commitments?.includes(c.id)) {
      // Visible como candidato solo si es de esta reunión: así se puede marcar.
      if (c.meetingId === meetingId) {
        candidates.push({ kind: "commitment", id: c.id, label: oneLine(c.action, 120), included: false, locked: false, reason: null });
      }
      continue;
    }
    const screen = screenSensitive(`${c.action} ${c.nextStep ?? ""}`);
    const included = !screen.sensitive && (choice?.commitments ? choice.commitments.includes(c.id) : c.shareable);
    candidates.push({
      kind: "commitment",
      id: c.id,
      label: oneLine(c.action, 120),
      included,
      locked: screen.sensitive,
      reason: screen.sensitive ? `Posible dato sensible (${screen.categories.join(", ")})` : null,
    });
    if (!included) continue;
    const changes = Array.isArray(c.dateChanges) ? (c.dateChanges as Array<{ reason?: string }>) : [];
    const moved = c.originalDueDate && crIsoDate(c.originalDueDate) !== crIsoDate(c.dueDate);
    agreementItems.push({
      id: c.id,
      action: oneLine(c.action, 300),
      ownerName: c.owner.name,
      dueDate: crIsoDate(c.dueDate),
      originalDueDate: moved ? crIsoDate(c.originalDueDate as Date) : null,
      dateChangeReason: moved && changes.length ? changes[changes.length - 1]?.reason ?? null : null,
      status: c.status === "done" || c.done ? "done" : c.status === "pending" ? "pending" : "open",
      accepted: c.accepted,
      nextStep: c.nextStep ? oneLine(c.nextStep, 200) : null,
      previous: c.meetingId !== meetingId,
    });
  }

  const detail = appUrl();
  const snapshot: MeetingReportSnapshot = {
    schema: SNAPSHOT_SCHEMA,
    meetingId,
    meetingVersion: meeting.version,
    quarterLabel,
    meetingDate: meeting.date.toISOString(),
    period: { start: period.start.toISOString(), end: period.end.toISOString(), cutAt: cutAt.toISOString() },
    objective: quarter.objective ? oneLine(quarter.objective, 400) : null,
    closedByName: options.closedByName ?? meeting.closedBy?.name ?? "—",
    selectionStatus: selection.hasSelection ? "ok" : "legacy_no_selection",
    companyMetrics,
    areas: areaBlocks,
    wins: winItems,
    contributions: contributionItems,
    blockers: blockerItems,
    agreements: agreementItems,
    detailUrl: detail ? `${detail}/l10` : null,
    notionUrl: null,
    update: options.previous ? { ofVersion: options.previous.version, reason: options.updateReason ?? null } : null,
  };

  return { snapshot, fingerprint: contentFingerprint(snapshot), candidates };
}
