import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { canManageMeetings } from "@/lib/l10Permissions";
import {
  appendDateChange,
  dayKey,
  optionalBoolean,
  parseDueDate,
  resolveStatus,
  validateDateChangeReason,
  validateNextStep,
  isCommitmentStatus,
} from "@/lib/l10/commitments";
import { validateCommitmentShare } from "@/lib/l10/share";

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { meetingId, ownerId, action } = body;

  if (typeof meetingId !== "string" || typeof ownerId !== "string") return bad("Faltan la reunión o el responsable");
  if (typeof action !== "string" || !action.trim()) return bad("Escribí la acción del acuerdo");
  const dueDate = parseDueDate(body.dueDate);
  if (!dueDate) return bad("Fecha inválida");

  const status = body.status === undefined ? "open" : body.status;
  if (!isCommitmentStatus(status)) return bad("status debe ser open, done o pending");
  const nextStep = validateNextStep(body.nextStep);
  if (!nextStep.ok) return bad(nextStep.error);
  const accepted = optionalBoolean(body.accepted, "accepted");
  if (!accepted.ok) return bad(accepted.error);
  const shareable = optionalBoolean(body.shareable, "shareable");
  if (!shareable.ok) return bad(shareable.error);

  const share = validateCommitmentShare({ shareable: shareable.value === true, action });
  if (!share.ok) return bad(share.error);

  const commitment = await prisma.l10Commitment.create({
    data: {
      meetingId,
      ownerId,
      action: action.trim(),
      dueDate,
      // La fecha con la que nace el acuerdo no se vuelve a tocar.
      originalDueDate: dueDate,
      status,
      done: status === "done",
      nextStep: nextStep.nextStep,
      accepted: accepted.value ?? true,
      shareable: shareable.value === true,
    },
  });

  return NextResponse.json(commitment);
}

export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { commitmentId, action, ownerId } = body;
  if (typeof commitmentId !== "string") return bad("Falta el acuerdo");

  const existing = await prisma.l10Commitment.findUnique({ where: { id: commitmentId } });
  if (!existing) return bad("Not found", 404);

  // Mismo criterio que la interfaz: responsable, CEO o quien facilita.
  const allowed =
    existing.ownerId === session.user.id || session.user.role === "ceo" || (await canManageMeetings(session.user));
  if (!allowed) return bad("Solo el responsable, quien facilita o el CEO pueden cambiar este acuerdo", 403);

  const data: Record<string, unknown> = {};

  const resolved = resolveStatus(body, existing.status as "open" | "done" | "pending");
  if (!resolved.ok) return bad(resolved.error);
  if (resolved.changed) {
    data.status = resolved.status;
    data.done = resolved.done;
  }

  if (action !== undefined) {
    if (typeof action !== "string" || !action.trim()) return bad("La acción no puede quedar vacía");
    data.action = action.trim();
  }
  if (ownerId !== undefined) {
    if (typeof ownerId !== "string" || !ownerId) return bad("Responsable inválido");
    data.ownerId = ownerId;
  }

  if (body.nextStep !== undefined) {
    const nextStep = validateNextStep(body.nextStep);
    if (!nextStep.ok) return bad(nextStep.error);
    data.nextStep = nextStep.nextStep;
  }
  const accepted = optionalBoolean(body.accepted, "accepted");
  if (!accepted.ok) return bad(accepted.error);
  if (accepted.value !== undefined) data.accepted = accepted.value;
  const shareable = optionalBoolean(body.shareable, "shareable");
  if (!shareable.ok) return bad(shareable.error);
  if (shareable.value !== undefined) data.shareable = shareable.value;

  // Cambiar la fecha exige motivo; el historial solo crece y la original no se toca.
  if (body.dueDate !== undefined) {
    const nextDue = parseDueDate(body.dueDate);
    if (!nextDue) return bad("Fecha inválida");
    if (dayKey(nextDue) !== dayKey(existing.dueDate)) {
      const reason = validateDateChangeReason(body.dateChangeReason);
      if (!reason.ok) return bad(reason.error);
      const history = appendDateChange(existing.dateChanges, {
        from: existing.dueDate,
        to: nextDue,
        reason: reason.reason,
        byId: session.user.id,
      });
      data.dueDate = nextDue;
      if (history) data.dateChanges = history;
      if (!existing.originalDueDate) data.originalDueDate = existing.dueDate;
    }
  }

  // Un acuerdo compartible muestra su acción a la empresa: se revisa el texto
  // resultante cada vez que cambia el texto o se activa el flag.
  const finalShareable = (data.shareable as boolean | undefined) ?? existing.shareable;
  const finalAction = (data.action as string | undefined) ?? existing.action;
  if (finalShareable && (data.action !== undefined || data.shareable !== undefined)) {
    const share = validateCommitmentShare({ shareable: true, action: finalAction });
    if (!share.ok) return bad(share.error);
  }

  const commitment = await prisma.l10Commitment.update({ where: { id: commitmentId }, data });
  return NextResponse.json(commitment);
}

export async function DELETE(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { commitmentId } = await request.json();
  await prisma.l10Commitment.delete({ where: { id: commitmentId } });
  return NextResponse.json({ success: true });
}
