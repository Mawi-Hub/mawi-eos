import { NextResponse } from "next/server";
import { requireCronAuth } from "@/lib/cronAuth";
import { runLeaderNudge } from "@/lib/checkin/leaderNudge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Aviso a los managers con la preparación sin terminar. Vercel Cron los
// viernes 08:45 CR (14:45 UTC). `?dryRun=1` lista a quién le llegaría.
export async function GET(request: Request) {
  const denied = requireCronAuth(request);
  if (denied) return denied;
  try {
    const result = await runLeaderNudge({ dryRun: new URL(request.url).searchParams.get("dryRun") === "1" });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("[leader-nudge] Error:", error);
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
