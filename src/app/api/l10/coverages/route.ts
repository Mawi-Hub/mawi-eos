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
  await prisma.l10Coverage.delete({ where: { id: coverageId } });
  return NextResponse.json({ success: true });
}
