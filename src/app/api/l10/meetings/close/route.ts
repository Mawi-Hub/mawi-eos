import { after, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canManageMeetings } from "@/lib/l10Permissions";
import { CloseError, closeMeeting } from "@/lib/report/close";
import { processReportDeliveries } from "@/lib/report/publish";
import type { InclusionChoice } from "@/lib/report/snapshot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// «Cerrar y enviar resumen» / «Cerrar sin enviar». Solo CEO o facilitador (el
// permiso viene de la base, no del cliente). El actor es la sesión: nunca un
// userId enviado por el navegador.
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id || !(await canManageMeetings(session.user))) {
    return NextResponse.json({ error: "Solo el CEO o el facilitador pueden cerrar reuniones" }, { status: 403 });
  }

  const body = (await request.json()) as {
    meetingId?: string;
    expectedVersion?: number;
    publish?: boolean;
    choice?: InclusionChoice | null;
    expectedFingerprint?: string | null;
    skipReason?: string | null;
    updateReason?: string | null;
    notes?: string | null;
  };
  if (!body.meetingId || typeof body.expectedVersion !== "number") {
    return NextResponse.json({ error: "meetingId y expectedVersion son requeridos" }, { status: 400 });
  }

  try {
    const result = await closeMeeting({
      meetingId: body.meetingId,
      actorId: session.user.id,
      expectedVersion: body.expectedVersion,
      publish: body.publish === true,
      choice: body.choice ?? null,
      expectedFingerprint: body.expectedFingerprint ?? null,
      skipReason: body.skipReason ?? null,
      updateReason: body.updateReason ?? null,
      notes: typeof body.notes === "string" ? body.notes : null,
    });

    // El envío corre después de responder; si el proceso muere, la entrega
    // queda persistida y se retoma (ver docs/management-report.md).
    if (result.reportId && result.deliveriesCreated) {
      const reportId = result.reportId;
      after(async () => {
        try {
          await processReportDeliveries(reportId);
        } catch (error) {
          console.error("[report] Error enviando el resumen:", error instanceof Error ? error.message : "desconocido");
        }
      });
    }
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof CloseError) {
      const status = error.code === "not_found" ? 404 : error.code === "skip_reason_required" ? 400 : 409;
      return NextResponse.json({ error: error.message, code: error.code, ...error.extra }, { status });
    }
    console.error("[report] Error cerrando la reunión:", error instanceof Error ? error.message : "desconocido");
    return NextResponse.json({ error: "No se pudo cerrar la reunión" }, { status: 500 });
  }
}
