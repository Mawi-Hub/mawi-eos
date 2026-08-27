import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Ciclo de vida automático del L10. Corre los viernes por la mañana (Vercel
// Cron, 13:00 UTC = 07:00 Costa Rica):
//   1. Cierra cualquier reunión que haya quedado abierta de semanas previas.
//   2. Abre la de hoy — la crea si no existe.
//
// Abrir no congela nada: issues, votos y compromisos se siguen agregando
// mientras la reunión está abierta. Cerrar es lo único que la archiva, y el
// facilitador siempre puede reabrirla desde la UI.
//
// `?dryRun=1` reporta qué haría sin tocar nada.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dryRun = new URL(request.url).searchParams.get("dryRun") === "1";

  try {
    const quarter = await prisma.quarter.findFirst({ where: { isActive: true } });
    if (!quarter) {
      return NextResponse.json({ ok: false, error: "No hay trimestre activo" }, { status: 409 });
    }

    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);

    // 1. Cerrar rezagadas: abiertas cuya fecha ya pasó.
    const stale = await prisma.l10Meeting.findMany({
      where: { status: "in_progress", date: { lt: todayStart } },
      select: { id: true, date: true, notes: true },
    });

    if (!dryRun) {
      for (const m of stale) {
        await prisma.l10Meeting.update({
          where: { id: m.id },
          data: {
            status: "completed",
            phase: "closed",
            notes: m.notes
              ? `${m.notes}\n\n(Cerrada automáticamente el ${todayStart.toISOString().split("T")[0]}.)`
              : `Cerrada automáticamente el ${todayStart.toISOString().split("T")[0]}.`,
          },
        });
      }
    }

    // 2. Abrir la de hoy. Reutiliza cualquier reunión sin cerrar sin importar su
    // fecha: el check-in del jueves ya pudo haber creado una para colgarle los
    // challenges, y crear otra acá dejaría esos issues huérfanos.
    const existing = await prisma.l10Meeting.findFirst({
      where: { quarterId: quarter.id, status: { not: "completed" } },
      orderBy: { date: "desc" },
    });

    // Pre-read cerrado la tarde anterior, junto con el check-in de KPIs.
    const prereadDeadline = new Date(todayStart);
    prereadDeadline.setDate(prereadDeadline.getDate() - 1);
    prereadDeadline.setHours(17, 0, 0, 0);

    let opened;
    if (dryRun) {
      opened = existing ? { id: existing.id, action: "abriría la existente" } : { action: "crearía y abriría una nueva" };
    } else if (existing) {
      opened = await prisma.l10Meeting.update({
        where: { id: existing.id },
        // La fecha pasa a ser la de hoy: si la creó el check-in del jueves,
        // la reunión es la de este viernes.
        data: { date: now, status: "in_progress", phase: "preread", prereadDeadline },
      });
    } else {
      opened = await prisma.l10Meeting.create({
        data: {
          quarterId: quarter.id,
          date: now,
          status: "in_progress",
          phase: "preread",
          prereadDeadline,
        },
      });
    }

    console.log(`[l10-cron] Cerradas: ${stale.length}, abierta: ${"id" in opened ? opened.id : "n/a"}${dryRun ? " (dry-run)" : ""}`);
    return NextResponse.json({ ok: true, dryRun, closed: stale.length, opened });
  } catch (error) {
    console.error("[l10-cron] Error en el ciclo de vida del L10:", error);
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
