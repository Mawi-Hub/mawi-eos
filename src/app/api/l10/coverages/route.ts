import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { meetingId, sourceType, sourceId, coverageType, issueId, note } = await request.json();

  if (sourceType !== "metric" && sourceType !== "rock") {
    return NextResponse.json({ error: "sourceType debe ser 'metric' o 'rock'" }, { status: 400 });
  }
  if (coverageType === "linked_issue" && !issueId) {
    return NextResponse.json({ error: "Cobertura por issue requiere issueId" }, { status: 400 });
  }
  if (coverageType === "no_action_note" && !note?.trim()) {
    return NextResponse.json({ error: "Cobertura por nota requiere texto" }, { status: 400 });
  }

  // Only the owner of the metric/rock can set its coverage
  const sourceOwnerId = sourceType === "metric"
    ? (await prisma.scorecardMetric.findUnique({ where: { id: sourceId }, select: { ownerId: true } }))?.ownerId
    : (await prisma.rock.findUnique({ where: { id: sourceId }, select: { ownerId: true } }))?.ownerId;
  if (!sourceOwnerId) {
    return NextResponse.json({ error: "No existe la métrica/rock" }, { status: 404 });
  }
  if (sourceOwnerId !== session.user.id) {
    return NextResponse.json({ error: "Solo el owner puede amarrar esta cobertura" }, { status: 403 });
  }

  // If linking to an issue, must be one the current user raised in this meeting
  if (coverageType === "linked_issue") {
    const issue = await prisma.l10Issue.findUnique({
      where: { id: issueId },
      select: { raisedById: true, meetingId: true },
    });
    if (!issue || issue.meetingId !== meetingId) {
      return NextResponse.json({ error: "Issue inválido para esta reunión" }, { status: 400 });
    }
    if (issue.raisedById !== session.user.id) {
      return NextResponse.json({ error: "Solo podés vincular a issues que vos planteaste" }, { status: 403 });
    }
  }

  const coverage = await prisma.l10Coverage.upsert({
    where: {
      meetingId_sourceType_sourceId: { meetingId, sourceType, sourceId },
    },
    create: {
      meetingId,
      sourceType,
      sourceId,
      coverageType,
      issueId: coverageType === "linked_issue" ? issueId : null,
      note: coverageType === "no_action_note" ? note : null,
      createdById: session.user.id,
    },
    update: {
      coverageType,
      issueId: coverageType === "linked_issue" ? issueId : null,
      note: coverageType === "no_action_note" ? note : null,
      createdById: session.user.id,
    },
  });

  return NextResponse.json(coverage);
}

export async function DELETE(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { coverageId } = await request.json();
  const existing = await prisma.l10Coverage.findUnique({ where: { id: coverageId } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const ownerId = existing.sourceType === "metric"
    ? (await prisma.scorecardMetric.findUnique({ where: { id: existing.sourceId }, select: { ownerId: true } }))?.ownerId
    : (await prisma.rock.findUnique({ where: { id: existing.sourceId }, select: { ownerId: true } }))?.ownerId;
  if (ownerId !== session.user.id) {
    return NextResponse.json({ error: "Solo el owner puede quitar su cobertura" }, { status: 403 });
  }

  await prisma.l10Coverage.delete({ where: { id: coverageId } });
  return NextResponse.json({ success: true });
}
