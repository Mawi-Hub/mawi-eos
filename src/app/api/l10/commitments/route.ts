import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { meetingId, ownerId, action, dueDate } = await request.json();

  const commitment = await prisma.l10Commitment.create({
    data: {
      meetingId,
      ownerId,
      action,
      dueDate: new Date(dueDate),
    },
  });

  return NextResponse.json(commitment);
}

export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { commitmentId, done } = await request.json();

  const commitment = await prisma.l10Commitment.update({
    where: { id: commitmentId },
    data: { done },
  });

  return NextResponse.json(commitment);
}
