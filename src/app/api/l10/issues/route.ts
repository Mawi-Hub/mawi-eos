import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

const MAX_ISSUES_PER_PERSON = 3;

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { meetingId, title, description, priority, linkedRockId, linkedMetricId } = await request.json();

  if (!linkedRockId && !linkedMetricId) {
    return NextResponse.json({ error: "Vincula el issue a un Rock o a una métrica del Scorecard" }, { status: 400 });
  }
  if (linkedRockId && linkedMetricId) {
    return NextResponse.json({ error: "Vincula a Rock o a métrica, no a ambos" }, { status: 400 });
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
      submittedAt: new Date(),
    },
  });

  return NextResponse.json(issue);
}

export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { issueId, idsStatus, resolution, ownerId, dueDate, title, description, priority } = await request.json();

  const existing = await prisma.l10Issue.findUnique({ where: { id: issueId } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

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
    },
  });

  return NextResponse.json(issue);
}

export async function DELETE(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { issueId } = await request.json();
  await prisma.l10Issue.delete({ where: { id: issueId } });
  return NextResponse.json({ success: true });
}
