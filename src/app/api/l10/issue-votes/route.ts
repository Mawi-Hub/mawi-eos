import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { issueId } = await request.json();
  const userId = session.user.id;

  const existing = await prisma.l10IssueVote.findUnique({
    where: { issueId_userId: { issueId, userId } },
  });

  if (existing) {
    await prisma.l10IssueVote.delete({ where: { id: existing.id } });
    return NextResponse.json({ voted: false });
  }

  await prisma.l10IssueVote.create({ data: { issueId, userId } });
  return NextResponse.json({ voted: true });
}
