import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canManageMeetings } from "@/lib/l10Permissions";
import { operatorResolve } from "@/lib/report/publish";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Acciones del operador sobre una entrega: reintentar una fallida, o resolver
// una incierta tras verificar en Slack/Notion si el mensaje salió.
export async function POST(request: Request, ctx: { params: Promise<{ deliveryId: string }> }) {
  const session = await auth();
  if (!(await canManageMeetings(session?.user))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { deliveryId } = await ctx.params;
  const body = (await request.json()) as { action?: string; messageTs?: string };
  if (body.action !== "retry" && body.action !== "confirm_sent" && body.action !== "confirm_not_sent") {
    return NextResponse.json({ error: "action inválida" }, { status: 400 });
  }
  try {
    await operatorResolve(deliveryId, body.action, { messageTs: body.messageTs });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo completar" }, { status: 409 });
  }
}
