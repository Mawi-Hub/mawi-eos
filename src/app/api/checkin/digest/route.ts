import { NextResponse } from "next/server";
import { generateWeeklyDigest } from "@/lib/integrations/checkin";
import { requireCronAuth } from "@/lib/cronAuth";
import { isMondayDigestReplaced } from "@/lib/report/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Weekly check-in digest. Triggered by a Vercel Cron (Mondays 08:00 Costa Rica
// = 14:00 UTC). Vercel sends `Authorization: Bearer <CRON_SECRET>` when the
// CRON_SECRET env var is set — we require it so the endpoint isn't public.
// `?dryRun=1` previews the same summary without sending a Slack message.
export async function GET(request: Request) {
  const denied = requireCronAuth(request);
  if (denied) return denied;

  try {
    const dryRun = new URL(request.url).searchParams.get("dryRun") === "1";
    // Cuando el resumen de management (al cerrar el L10) sustituye este emisor,
    // solo se apaga este job; el L10 privado no se toca.
    if (isMondayDigestReplaced() && !dryRun) {
      console.log("[checkin] Resumen del lunes reemplazado por el reporte de management; no se envía.");
      return NextResponse.json({ ok: true, skipped: "replaced_by_management_report" });
    }
    const result = await generateWeeklyDigest({ dryRun });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("[checkin] Error generando digest semanal:", error);
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
