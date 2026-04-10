import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const entry = await prisma.winChallenge.findUnique({ where: { id } });

  if (!entry || entry.userId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();

  const updated = await prisma.winChallenge.update({
    where: { id },
    data: {
      wins: body.wins !== undefined ? body.wins : entry.wins,
      result: body.result !== undefined ? body.result : entry.result,
      keyChallenge: body.keyChallenge !== undefined ? body.keyChallenge : entry.keyChallenge,
      priority: body.priority ?? entry.priority,
      followUpAction: body.followUpAction !== undefined ? body.followUpAction : entry.followUpAction,
    },
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const entry = await prisma.winChallenge.findUnique({ where: { id } });

  if (!entry || entry.userId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await prisma.winChallenge.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
