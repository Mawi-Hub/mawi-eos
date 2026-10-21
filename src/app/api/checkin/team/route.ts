import { NextResponse } from "next/server";
import { requireCronAuth } from "@/lib/cronAuth";
import { runTeamCheckin } from "@/lib/checkin/teamCheckin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Check-in semanal del equipo por DM. Vercel Cron:
//   jueves 15:00 CR (21:00 UTC)  ?step=open    invitación con el formulario
//   viernes 08:00 CR (14:00 UTC) ?step=remind  recordatorio a quien no respondió
// `?dryRun=1` lista a quién le llegaría sin enviar. `?only=U123` limita a una
// persona (para probar).
export async function GET(request: Request) {
  const denied = requireCronAuth(request);
  if (denied) return denied;

  const query = new URL(request.url).searchParams;
  const step = query.get("step") === "remind" ? "remind" : "open";
  try {
    const result = await runTeamCheckin({
      step,
      dryRun: query.get("dryRun") === "1",
      onlySlackUserId: query.get("only") ?? undefined,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("[team-checkin] Error:", error);
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
