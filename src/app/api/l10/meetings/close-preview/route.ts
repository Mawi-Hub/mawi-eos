import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canManageMeetings } from "@/lib/l10Permissions";
import { CloseError, previewClose } from "@/lib/report/close";
import type { InclusionChoice } from "@/lib/report/snapshot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Vista previa del resumen que saldría al cerrar. No escribe nada: sirve para
// que quien envía revise el texto, el destino y qué se incluye.
export async function POST(request: Request) {
  const session = await auth();
  if (!(await canManageMeetings(session?.user))) {
    return NextResponse.json({ error: "Solo el CEO o el facilitador pueden cerrar reuniones" }, { status: 403 });
  }
  const body = (await request.json()) as { meetingId?: string; choice?: InclusionChoice | null };
  if (!body.meetingId) return NextResponse.json({ error: "meetingId requerido" }, { status: 400 });

  try {
    const preview = await previewClose(body.meetingId, body.choice ?? null, session?.user?.name);
    return NextResponse.json(preview);
  } catch (error) {
    if (error instanceof CloseError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.code === "not_found" ? 404 : 409 });
    console.error("[report] Error en la vista previa del cierre:", error instanceof Error ? error.message : "desconocido");
    return NextResponse.json({ error: "No se pudo generar la vista previa" }, { status: 500 });
  }
}
