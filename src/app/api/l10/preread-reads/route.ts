import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { meetingId } = await request.json();

  const read = await prisma.l10PreReadRead.upsert({
    where: { meetingId_userId: { meetingId, userId: session.user.id } },
    create: { meetingId, userId: session.user.id },
    update: { readAt: new Date() },
  });

  return NextResponse.json(read);
}

export async function DELETE(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { meetingId } = await request.json();
  await prisma.l10PreReadRead.deleteMany({
    where: { meetingId, userId: session.user.id },
  });
  return NextResponse.json({ success: true });
}
