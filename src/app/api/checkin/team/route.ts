import { NextResponse } from "next/server";
import { requireCronAuth } from "@/lib/cronAuth";
import { runTeamCheckin } from "@/lib/checkin/teamCheckin";
import { runChannelReminder, runManagerFollowUp } from "@/lib/checkin/followUp";
import { weeklyChannel } from "@/lib/weekly/summary";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Check-in semanal del equipo por DM. Vercel Cron:
//   jueves 15:00 CR (21:00 UTC)  ?step=open    invitación con el formulario
//   viernes 08:00 CR (14:00 UTC) ?step=remind  recordatorio a quien no respondió
//   viernes 10:00 CR (16:00 UTC) ?step=managers DM a cada manager con su gente pendiente
//   viernes 11:00 CR (17:00 UTC) ?step=channel  aviso en #weekly-check-ins (solo el conteo)
// `?dryRun=1` lista a quién le llegaría sin enviar. `?only=U123` limita a una
// persona (para probar).
export async function GET(request: Request) {
  const denied = requireCronAuth(request);
  if (denied) return denied;

  const query = new URL(request.url).searchParams;
  const step = query.get("step");
  const dryRun = query.get("dryRun") === "1";
  try {
    if (step === "managers") return NextResponse.json({ ok: true, ...(await runManagerFollowUp({ dryRun })) });
    if (step === "channel") return NextResponse.json({ ok: true, ...(await runChannelReminder({ channel: weeklyChannel(), dryRun })) });
    const result = await runTeamCheckin({
      step: step === "remind" ? "remind" : "open",
      dryRun,
      onlySlackUserId: query.get("only") ?? undefined,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("[team-checkin] Error:", error);
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
