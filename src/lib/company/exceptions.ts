// Lo que el CEO necesita mirar antes de la L10: solo lo que se desvía.

import { prisma } from "@/lib/db";
import { quarterOverview, type AreaRock } from "@/lib/company/areas";
import { checkinWeek, weekParticipation } from "@/lib/checkin/teamCheckin";
import { summarizeEnergy, ENERGY_MIN_SAMPLE } from "@/lib/weekly/render";
import { crIsoDate } from "@/lib/time/costaRica";

const DAY_MS = 24 * 60 * 60 * 1000;
const STALE_ROCK_DAYS = 14;

export type CeoExceptions = {
  rocksAtRisk: Array<AreaRock & { areaName: string }>;
  rocksStale: Array<AreaRock & { areaName: string; daysSinceUpdate: number }>;
  redMetrics: Array<{ areaName: string; label: string; valueText: string | null; targetText: string | null; signal: string }>;
  missingMetrics: Array<{ areaName: string; label: string; owner: string | null }>;
  overdueCommitments: Array<{ id: string; action: string; ownerName: string; dueDate: string; daysLate: number }>;
  openIssues: Array<{ id: string; title: string; raisedBy: string; votes: number; linked: string | null }>;
  checkin: { answered: number; expected: number; pending: Array<{ name: string; team: string }> };
  preps: Array<{ areaName: string; leaderName: string | null; status: "confirmed" | "draft" | "missing" }>;
  energyByArea: Array<{ areaName: string; average: number | null; count: number; low: number }>;
  weekIso: string;
};

export async function ceoExceptions(now = new Date()): Promise<CeoExceptions> {
  const period = checkinWeek(now);
  const [overview, participation, commitments, meeting] = await Promise.all([
    quarterOverview(null, { now }),
    weekParticipation(period, now),
    prisma.l10Commitment.findMany({
      where: { done: false, status: { not: "done" }, dueDate: { lt: now }, accepted: true },
      include: { owner: { select: { name: true } } },
      orderBy: { dueDate: "asc" },
    }),
    prisma.l10Meeting.findFirst({ where: { status: { not: "completed" } }, orderBy: { date: "desc" } }),
  ]);

  const issues = meeting
    ? await prisma.l10Issue.findMany({
        where: { meetingId: meeting.id, idsStatus: { not: "resolved" } },
        include: { raisedBy: { select: { name: true } }, linkedRock: { select: { title: true } }, linkedMetric: { select: { name: true } }, votes: true },
      })
    : [];
  const preps = meeting ? await prisma.leaderPrep.findMany({ where: { meetingId: meeting.id } }) : [];

  const allRocks = overview.areas.flatMap((a) => a.rocks.map((r) => ({ ...r, areaName: a.name })));
  const rockRows = await prisma.rock.findMany({ where: { id: { in: allRocks.map((r) => r.id) } }, select: { id: true, updatedAt: true } });
  const updatedAt = new Map(rockRows.map((r) => [r.id, r.updatedAt]));

  const energyByArea = overview.areas.map((a) => {
    const values = participation.answers.filter((c) => c.areaKey === a.key).map((c) => c.energy);
    const s = summarizeEnergy(values);
    // Con menos de 3 respuestas en el área no se muestra el promedio.
    return { areaName: a.name, average: s && s.count >= ENERGY_MIN_SAMPLE ? s.average : null, count: s?.count ?? 0, low: s && s.count >= ENERGY_MIN_SAMPLE ? s.low : 0 };
  });

  return {
    weekIso: crIsoDate(period),
    rocksAtRisk: allRocks.filter((r) => r.status === "riesgo" || r.status === "off_track"),
    rocksStale: allRocks
      .filter((r) => r.status !== "done")
      .map((r) => ({ ...r, daysSinceUpdate: Math.floor((now.getTime() - (updatedAt.get(r.id)?.getTime() ?? now.getTime())) / DAY_MS) }))
      .filter((r) => r.daysSinceUpdate >= STALE_ROCK_DAYS),
    redMetrics: overview.areas.flatMap((a) =>
      a.metrics
        .filter((m) => m.signal === "off_track" || m.signal === "riesgo")
        .map((m) => ({ areaName: a.name, label: m.label, valueText: m.valueText, targetText: m.targetText, signal: m.signal! })),
    ),
    missingMetrics: overview.areas.flatMap((a) =>
      a.metrics.filter((m) => !m.pendingConfig && m.valueText === null).map((m) => ({ areaName: a.name, label: m.label, owner: m.reportOwnerName })),
    ),
    overdueCommitments: commitments.map((c) => ({
      id: c.id,
      action: c.action,
      ownerName: c.owner.name,
      dueDate: crIsoDate(c.dueDate),
      daysLate: Math.max(1, Math.floor((now.getTime() - c.dueDate.getTime()) / DAY_MS)),
    })),
    openIssues: issues
      .map((i) => ({ id: i.id, title: i.title, raisedBy: i.raisedBy.name, votes: i.votes.length, linked: i.linkedRock?.title ?? i.linkedMetric?.name ?? null }))
      .sort((a, b) => b.votes - a.votes),
    checkin: {
      answered: participation.answers.length,
      expected: participation.members.length,
      pending: participation.pending.map((m) => ({ name: m.displayName, team: m.team.name })),
    },
    preps: overview.areas.map((a) => {
      const p = preps.find((x) => x.areaId === a.id);
      return { areaName: a.name, leaderName: a.leader?.name ?? null, status: p ? (p.status === "confirmed" ? "confirmed" : "draft") : "missing" };
    }),
    energyByArea,
  };
}
