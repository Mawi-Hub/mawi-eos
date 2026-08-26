import { NextResponse } from "next/server";
import { startKpiCheckins } from "@/lib/integrations/kpiCheckin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Arranque del KPI check-in semanal por DM. Triggered por Vercel Cron los
// jueves 17:00 Costa Rica (= 23:00 UTC). Mismo guard que el digest: Vercel
// manda `Authorization: Bearer <CRON_SECRET>` cuando la env var existe.
// `?dryRun=1` resuelve usuarios de Slack sin abrir DMs ni crear sesiones.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dryRun = new URL(request.url).searchParams.get("dryRun") === "1";

  try {
    const result = await startKpiCheckins({ dryRun });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("[kpi-checkin] Error iniciando check-ins:", error);
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
