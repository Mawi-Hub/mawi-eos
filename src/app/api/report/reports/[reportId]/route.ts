import { after, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { canManageMeetings } from "@/lib/l10Permissions";
import { CloseError, publishSkippedReport } from "@/lib/report/close";
import { processReportDeliveries } from "@/lib/report/publish";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Estado de un reporte y sus entregas (sin contenido personal ni secretos).
export async function GET(_req: Request, ctx: { params: Promise<{ reportId: string }> }) {
  const session = await auth();
  if (!(await canManageMeetings(session?.user))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { reportId } = await ctx.params;
  const report = await prisma.meetingReport.findUnique({
    where: { id: reportId },
    select: {
      id: true, meetingId: true, version: true, kind: true, status: true, closedAt: true, channel: true, skipReason: true,
      deliveries: { select: { id: true, destination: true, partIndex: true, status: true, attempts: true, lastError: true, sentAt: true }, orderBy: [{ destination: "asc" }, { partIndex: "asc" }] },
    },
  });
  if (!report) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  return NextResponse.json(report);
}

// action: "publish_skipped" (publicar un reporte cerrado sin enviar) o
// "process" (retomar entregas pendientes/fallidas).
export async function POST(request: Request, ctx: { params: Promise<{ reportId: string }> }) {
  const session = await auth();
  if (!(await canManageMeetings(session?.user))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { reportId } = await ctx.params;
  const { action } = (await request.json()) as { action?: string };

  try {
    if (action === "publish_skipped") await publishSkippedReport(reportId);
    else if (action !== "process") return NextResponse.json({ error: "action inválida" }, { status: 400 });
    after(async () => {
      try {
        await processReportDeliveries(reportId);
      } catch (error) {
        console.error("[report] Error procesando entregas:", error instanceof Error ? error.message : "desconocido");
      }
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof CloseError) return NextResponse.json({ error: error.message, code: error.code }, { status: 409 });
    return NextResponse.json({ error: "No se pudo completar la acción" }, { status: 500 });
  }
}
