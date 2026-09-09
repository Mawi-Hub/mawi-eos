import { NextResponse } from "next/server";
import { generateWeeklyDigest } from "@/lib/integrations/checkin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Weekly check-in digest. Triggered by a Vercel Cron (Mondays 08:00 Costa Rica
// = 14:00 UTC). Vercel sends `Authorization: Bearer <CRON_SECRET>` when the
// CRON_SECRET env var is set — we require it so the endpoint isn't public.
// `?dryRun=1` previews the same summary without sending a Slack message.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const dryRun = new URL(request.url).searchParams.get("dryRun") === "1";
    const result = await generateWeeklyDigest({ dryRun });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("[checkin] Error generando digest semanal:", error);
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
