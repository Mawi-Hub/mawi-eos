import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getMetricScope } from "@/lib/selection/quarterSelection";
import { metricInScope } from "@/lib/l10/scope";
import { validateIssueShare } from "@/lib/l10/share";

const MAX_ISSUES_PER_PERSON = 3;

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { meetingId, title, description, priority, linkedRockId, linkedMetricId, shareable, sharedSummary } = await request.json();

  if (!linkedRockId && !linkedMetricId) {
    return NextResponse.json({ error: "Vincula el issue a un Rock o a una métrica del Scorecard" }, { status: 400 });
  }
  if (linkedRockId && linkedMetricId) {
    return NextResponse.json({ error: "Vincula a Rock o a métrica, no a ambos" }, { status: 400 });
  }

  const share = validateIssueShare({ shareable, sharedSummary });
  if (!share.ok) return NextResponse.json({ error: share.error }, { status: 400 });

  // Con la selección activa, un IDS NUEVO solo se vincula a métricas de la
  // selección del trimestre. Los IDS existentes no se tocan.
  if (linkedMetricId) {
    const meeting = await prisma.l10Meeting.findUnique({ where: { id: meetingId }, select: { quarterId: true } });
    if (!meeting) return NextResponse.json({ error: "Reunión no encontrada" }, { status: 404 });
    const scope = await getMetricScope(meeting.quarterId);
    if (!metricInScope(scope, linkedMetricId)) {
      return NextResponse.json({ error: "Esa métrica no está en la selección del trimestre" }, { status: 400 });
    }
  }

  const existingCount = await prisma.l10Issue.count({
    where: { meetingId, raisedById: session.user.id },
  });
  if (existingCount >= MAX_ISSUES_PER_PERSON) {
    return NextResponse.json(
      { error: `Máximo ${MAX_ISSUES_PER_PERSON} issues por persona en una reunión` },
      { status: 400 },
    );
  }

  const issue = await prisma.l10Issue.create({
    data: {
      meetingId,
      raisedById: session.user.id,
      title,
      description: description || null,
      priority: priority || "medio",
      linkedRockId: linkedRockId || null,
      linkedMetricId: linkedMetricId || null,
      shareable: share.shareable,
      sharedSummary: share.sharedSummary,
      submittedAt: new Date(),
    },
  });

  return NextResponse.json(issue);
}

export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { issueId, idsStatus, resolution, ownerId, dueDate, title, description, priority, shareable, sharedSummary } = await request.json();

  const existing = await prisma.l10Issue.findUnique({ where: { id: issueId } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Qué sale de la sala lo decide quien planteó el IDS (o el CEO).
  let shareData: { shareable: boolean; sharedSummary: string | null } | null = null;
  if (shareable !== undefined || sharedSummary !== undefined) {
    if (existing.raisedById !== session.user.id && session.user.role !== "ceo") {
      return NextResponse.json({ error: "Solo quien planteó el IDS o el CEO pueden decidir qué se comparte" }, { status: 403 });
    }
    const share = validateIssueShare({
      shareable: shareable !== undefined ? shareable : existing.shareable,
      sharedSummary: sharedSummary !== undefined ? sharedSummary : existing.sharedSummary,
    });
    if (!share.ok) return NextResponse.json({ error: share.error }, { status: 400 });
    shareData = { shareable: share.shareable, sharedSummary: share.sharedSummary };
  }

  const issue = await prisma.l10Issue.update({
    where: { id: issueId },
    data: {
      ...(idsStatus !== undefined && { idsStatus }),
      ...(resolution !== undefined && { resolution }),
      ...(ownerId !== undefined && { ownerId }),
      ...(dueDate !== undefined && { dueDate: dueDate ? new Date(dueDate) : null }),
      ...(title !== undefined && { title }),
      ...(description !== undefined && { description }),
      ...(priority !== undefined && { priority }),
      ...(shareData && shareData),
    },
  });

  return NextResponse.json(issue);
}

export async function DELETE(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { issueId } = await request.json();
  const existing = await prisma.l10Issue.findUnique({ where: { id: issueId } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (existing.raisedById !== session.user.id && session.user.role !== "ceo") {
    return NextResponse.json({ error: "Solo el autor o CEO pueden borrar" }, { status: 403 });
  }

  await prisma.l10Issue.delete({ where: { id: issueId } });
  return NextResponse.json({ success: true });
}
