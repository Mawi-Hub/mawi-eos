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

  const { issueId, idsStatus, resolution, ownerId, dueDate } = await request.json();

  const issue = await prisma.l10Issue.update({
    where: { id: issueId },
    data: {
      idsStatus,
      ...(resolution !== undefined && { resolution }),
      ...(ownerId !== undefined && { ownerId }),
      ...(dueDate !== undefined && { dueDate: new Date(dueDate) }),
    },
  });

  return NextResponse.json(issue);
}
