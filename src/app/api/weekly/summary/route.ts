import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canManageMeetings } from "@/lib/l10Permissions";
import { periodFromIso } from "@/lib/checkin/teamCheckin";
import { generateDraft, saveDraftText, sendSummary, setManagementHidden, SummaryError } from "@/lib/weekly/summary";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 90;

// Acciones sobre el resumen de una semana (CEO o facilitador):
//   generate  rearmar el borrador con los datos actuales (pisa la edición)
//   save      guardar el texto editado
//   hide      ocultar/mostrar un acuerdo o bloqueo de management
//   send      publicar en #weekly-check-ins
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user || !(await canManageMeetings(session.user))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as { action?: string; week?: string; text?: string; key?: string; hidden?: boolean };
  const period = body.week ? periodFromIso(body.week) : null;
  if (!period) return NextResponse.json({ error: "Semana inválida" }, { status: 400 });

  try {
    if (body.action === "generate") {
      const r = await generateDraft(period, { force: true });
      return NextResponse.json(r);
    }
    if (body.action === "save") {
      if (typeof body.text !== "string") return NextResponse.json({ error: "Falta el texto" }, { status: 400 });
      await saveDraftText(period, body.text);
      return NextResponse.json({ ok: true });
    }
    if (body.action === "hide") {
      if (!body.key || !/^(commitment|issue):[\w-]+$/.test(body.key)) return NextResponse.json({ error: "Ítem inválido" }, { status: 400 });
      await setManagementHidden(period, body.key, !!body.hidden);
      return NextResponse.json({ ok: true });
    }
    if (body.action === "send") {
      if (typeof body.text === "string") await saveDraftText(period, body.text);
      const r = await sendSummary(period, session.user.id!);
      return NextResponse.json({ ok: true, ...r });
    }
    return NextResponse.json({ error: "Acción desconocida" }, { status: 400 });
  } catch (error) {
    if (error instanceof SummaryError) return NextResponse.json({ error: error.message, code: error.code }, { status: 409 });
    console.error("[weekly-summary] Error:", error);
    return NextResponse.json({ error: "No se pudo completar la acción" }, { status: 500 });
  }
}
