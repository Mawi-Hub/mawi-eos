import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { canManageMeetings } from "@/lib/l10Permissions";

export async function POST(request: Request) {
  const session = await auth();
  if (!(await canManageMeetings(session?.user))) {
    return NextResponse.json(
      { error: "Solo el CEO o el facilitador pueden crear reuniones L10" },
      { status: 403 },
    );
  }

  const { quarterId } = await request.json();

  const meeting = await prisma.l10Meeting.create({
    data: {
      quarterId,
      date: new Date(),
      status: "upcoming",
    },
  });

  return NextResponse.json(meeting);
}

const VALID_PHASES = new Set(["preread", "voting", "ids", "commitments", "closed"]);

export async function PATCH(request: Request) {
  const session = await auth();
  if (!(await canManageMeetings(session?.user))) {
    return NextResponse.json(
      { error: "Solo el CEO o el facilitador pueden modificar reuniones" },
      { status: 403 },
    );
  }

  const { meetingId, status, notes, phase, prereadDeadline } = await request.json();

  if (phase !== undefined && !VALID_PHASES.has(phase)) {
    return NextResponse.json({ error: "phase inválido" }, { status: 400 });
  }

  const meeting = await prisma.l10Meeting.update({
    where: { id: meetingId },
    data: {
      ...(status !== undefined && { status }),
      ...(notes !== undefined && { notes }),
      ...(phase !== undefined && { phase }),
      ...(prereadDeadline !== undefined && { prereadDeadline: prereadDeadline ? new Date(prereadDeadline) : null }),
    },
  });

  return NextResponse.json(meeting);
}
