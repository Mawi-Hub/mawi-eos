import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { canManageMeetings } from "@/lib/l10Permissions";
import { onMeetingReopened } from "@/lib/report/close";

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
  if (status !== undefined && !["upcoming", "in_progress", "completed"].includes(status)) {
    return NextResponse.json({ error: "status inválido" }, { status: 400 });
  }
  // Cerrar una reunión tiene un comando propio (valida versión, fija
  // status+phase juntos y es lo único que puede publicar el resumen).
  if (status === "completed") {
    return NextResponse.json(
      { error: "Para cerrar la reunión usá «Cerrar reunión» (POST /api/l10/meetings/close)." },
      { status: 400 },
    );
  }
  // "closed" tampoco se fija a mano: sin cerrar de verdad dejaría la reunión
  // abierta con la fase de cierre.
  if (phase === "closed") {
    return NextResponse.json({ error: "La fase «closed» solo la fija el cierre de reunión." }, { status: 400 });
  }

  const current = await prisma.l10Meeting.findUnique({ where: { id: meetingId }, select: { status: true, phase: true } });
  if (!current) return NextResponse.json({ error: "Reunión no encontrada" }, { status: 404 });
  const reopening = current.status === "completed" && status === "in_progress";

  const meeting = await prisma.l10Meeting.update({
    where: { id: meetingId },
    data: {
      ...(status !== undefined && { status }),
      ...(notes !== undefined && { notes }),
      // Reabrir deja de ser "closed": vuelve a la última fase de trabajo.
      ...(phase !== undefined ? { phase } : reopening && current.phase === "closed" ? { phase: "commitments" } : {}),
      ...(prereadDeadline !== undefined && { prereadDeadline: prereadDeadline ? new Date(prereadDeadline) : null }),
      version: { increment: 1 },
    },
  });

  // Reabrir antes del envío cancela el trabajo pendiente de esa versión; lo ya
  // publicado queda como registro histórico.
  if (reopening) await onMeetingReopened(meetingId);

  return NextResponse.json(meeting);
}
