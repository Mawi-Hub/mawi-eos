import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { meetingId, title, description, priority } = await request.json();

  const issue = await prisma.l10Issue.create({
    data: {
      meetingId,
      raisedById: session.user.id,
      title,
      description: description || null,
      priority: priority || "medio",
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
