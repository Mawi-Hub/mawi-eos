import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { canManageMeetings } from "@/lib/l10Permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Curaduría de una respuesta del check-in para el resumen: ocultar o destacar.
// No cambia lo que la persona escribió.
export async function PATCH(request: Request, ctx: { params: Promise<{ checkinId: string }> }) {
  const session = await auth();
  if (!session?.user || !(await canManageMeetings(session.user))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { checkinId } = await ctx.params;
  const body = (await request.json().catch(() => ({}))) as { hidden?: boolean; highlighted?: boolean };
  const data: { hidden?: boolean; highlighted?: boolean } = {};
  if (typeof body.hidden === "boolean") data.hidden = body.hidden;
  if (typeof body.highlighted === "boolean") data.highlighted = body.highlighted;
  if (!Object.keys(data).length) return NextResponse.json({ error: "Nada que cambiar" }, { status: 400 });
  try {
    const row = await prisma.teamCheckin.update({ where: { id: checkinId }, data, select: { id: true, hidden: true, highlighted: true } });
    return NextResponse.json(row);
  } catch {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }
}
