// Implementación real (Prisma) del acceso a datos del check-in v2.
// La lógica vive en leaderPrep.ts; acá solo hay consultas y escrituras.

import { prisma } from "@/lib/db";
import { getQuarterSelection } from "@/lib/selection/quarterSelection";
import { saveManualEntry } from "./manualEntry";
import type { PrepBlocks, PrepData, PrepRow, PrepStep } from "./leaderPrep";

type PrepDbRow = { id: string; leaderId: string; status: string; blocks: unknown };

function toRow(row: PrepDbRow): PrepRow {
  const blocks = row.blocks && typeof row.blocks === "object" && !Array.isArray(row.blocks) ? (row.blocks as PrepBlocks) : {};
  return { id: row.id, leaderId: row.leaderId, status: row.status === "confirmed" ? "confirmed" : "draft", blocks };
}

export const prismaPrepData: PrepData = {
  async ensurePrep(meetingId, areaId, leaderId) {
    const where = { meetingId_areaId: { meetingId, areaId } };
    const existing = await prisma.leaderPrep.findUnique({ where });
    if (existing) return toRow(existing);
    try {
      return toRow(await prisma.leaderPrep.create({ data: { meetingId, areaId, leaderId, status: "draft", blocks: {} } }));
    } catch (error) {
      if ((error as { code?: string }).code !== "P2002") throw error;
      const raced = await prisma.leaderPrep.findUnique({ where });
      if (!raced) throw error;
      return toRow(raced);
    }
  },

  async loadPrep(meetingId, areaId) {
    const row = await prisma.leaderPrep.findUnique({ where: { meetingId_areaId: { meetingId, areaId } } });
    return row ? toRow(row) : null;
  },

  async savePrep(id, data) {
    await prisma.leaderPrep.update({
      where: { id },
      data: {
        blocks: data.blocks as unknown as object,
        ...(data.status ? { status: data.status } : {}),
        ...(data.confirmedAt !== undefined ? { confirmedAt: data.confirmedAt } : {}),
      },
    });
  },

  async setStep(sessionId, step: PrepStep) {
    await prisma.kpiCheckinSession.update({ where: { id: sessionId }, data: { step } });
  },

  async getRock(quarterId, areaId, userId) {
    const config = await prisma.areaQuarterConfig.findUnique({ where: { quarterId_areaId: { quarterId, areaId } } });
    const select = { id: true, title: true, status: true } as const;
    if (config?.principalRockId) {
      const principal = await prisma.rock.findFirst({ where: { id: config.principalRockId, quarterId }, select });
      if (principal) return principal;
    }
    return prisma.rock.findFirst({ where: { quarterId, ownerId: userId }, orderBy: { createdAt: "asc" }, select });
  },

  async updateRockStatus(rockId, status) {
    await prisma.rock.update({ where: { id: rockId }, data: { status } });
  },

  async getAreaMetrics(quarterId, areaId) {
    const selection = await getQuarterSelection(quarterId);
    return { hasSelection: selection.hasSelection, rows: selection.rows.filter((r) => r.areaId === areaId) };
  },

  saveManualEntry(metric, value, display, userId) {
    return saveManualEntry(metric, value, display, userId);
  },

  async getAreaEvidence(areaKey, periodStart) {
    const rows = await prisma.checkinEvidence.findMany({
      where: { areaKey, periodStart, deletedAt: null, win: { not: null } },
      orderBy: { reportedAt: "asc" },
      take: 30,
      select: { id: true, authorName: true, win: true },
    });
    return rows;
  },

  async createWin(userId, quarterId, text) {
    const row = await prisma.winChallenge.create({
      data: {
        userId,
        quarterId,
        reportDate: new Date(),
        entryType: "win",
        wins: text,
        highlighted: true,
        shareable: false,
      },
    });
    return row.id;
  },

  async listOpenCommitments(areaId, leaderId, excludeMeetingId, limit) {
    const now = new Date();
    const members = await prisma.reportMember.findMany({
      where: { areaId, userId: { not: null }, validFrom: { lte: now }, OR: [{ validTo: null }, { validTo: { gt: now } }] },
      select: { userId: true },
    });
    const ownerIds = [...new Set([leaderId, ...members.map((m) => m.userId).filter((v): v is string => !!v)])];
    const rows = await prisma.l10Commitment.findMany({
      where: {
        ownerId: { in: ownerIds },
        meetingId: { not: excludeMeetingId },
        done: false,
        status: { in: ["open", "pending"] },
        accepted: true,
      },
      include: { owner: { select: { name: true } } },
      orderBy: { dueDate: "asc" },
      take: limit,
    });
    return rows.map((r) => ({ id: r.id, action: r.action, ownerId: r.ownerId, ownerName: r.owner.name, dueDate: r.dueDate }));
  },

  async getCommitment(id) {
    const row = await prisma.l10Commitment.findUnique({ where: { id } });
    return row
      ? { dueDate: row.dueDate, originalDueDate: row.originalDueDate, dateChanges: row.dateChanges, done: row.done, status: row.status }
      : null;
  },

  async updateCommitment(id, patch) {
    await prisma.l10Commitment.update({
      where: { id },
      data: {
        done: patch.done,
        status: patch.status,
        ...(patch.nextStep !== undefined ? { nextStep: patch.nextStep } : {}),
        ...(patch.dueDate ? { dueDate: patch.dueDate } : {}),
        ...(patch.originalDueDate ? { originalDueDate: patch.originalDueDate } : {}),
        ...(patch.dateChanges ? { dateChanges: patch.dateChanges as unknown as object } : {}),
      },
    });
  },

  async getLinkOptions(quarterId, areaId, userId) {
    const config = await prisma.areaQuarterConfig.findUnique({ where: { quarterId_areaId: { quarterId, areaId } } });
    const rocks = await prisma.rock.findMany({
      where: { quarterId, OR: [{ ownerId: userId }, ...(config?.principalRockId ? [{ id: config.principalRockId }] : [])] },
      select: { id: true, title: true },
      orderBy: { createdAt: "asc" },
    });
    const selection = await getQuarterSelection(quarterId);
    const fromSelection = selection.rows
      .filter((r) => r.areaId === areaId && r.metric)
      .map((r) => ({ id: r.metric!.id, name: r.label }));
    const metrics = selection.hasSelection
      ? fromSelection
      : await prisma.scorecardMetric.findMany({ where: { isActive: true }, select: { id: true, name: true }, orderBy: { sortOrder: "asc" } });
    return { rocks, metrics };
  },

  countIssues(meetingId, userId) {
    return prisma.l10Issue.count({ where: { meetingId, raisedById: userId } });
  },

  async createIssue(issue) {
    const row = await prisma.l10Issue.create({
      data: {
        meetingId: issue.meetingId,
        raisedById: issue.raisedById,
        title: issue.title,
        description: issue.description || null,
        priority: issue.priority,
        linkedRockId: issue.linkedRockId,
        linkedMetricId: issue.linkedMetricId,
        dueDate: issue.dueDate,
        submittedAt: new Date(),
        shareable: false,
        sharedSummary: null,
      },
    });
    return row.id;
  },
};
