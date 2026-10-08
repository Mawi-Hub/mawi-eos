import { NextResponse } from "next/server";
import { startKpiCheckins } from "@/lib/integrations/kpiCheckin";
import { requireCronAuth } from "@/lib/cronAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Arranque del KPI check-in semanal por DM. Triggered por Vercel Cron los
// jueves 16:00 Costa Rica (= 22:00 UTC). Mismo guard que el digest: Vercel
// manda `Authorization: Bearer <CRON_SECRET>` cuando la env var existe.
// `?dryRun=1` resuelve usuarios de Slack sin abrir DMs ni crear sesiones.
export async function GET(request: Request) {
  const denied = requireCronAuth(request);
  if (denied) return denied;

  const query = new URL(request.url).searchParams;
  const dryRun = query.get("dryRun") === "1";
  const preview = query.get("preview") === "1";
  const onlyEmail = query.get("onlyEmail") ?? undefined;

  try {
    const result = await startKpiCheckins({ dryRun, preview, onlyEmail });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("[kpi-checkin] Error iniciando check-ins:", error);
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
