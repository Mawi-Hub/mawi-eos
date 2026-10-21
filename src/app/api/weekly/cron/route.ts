import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireCronAuth } from "@/lib/cronAuth";
import { postSlackMessage } from "@/lib/integrations/checkin";
import { lookupSlackUserByEmail, openDm } from "@/lib/integrations/kpiCheckin";
import { checkinWeek, weekParticipation } from "@/lib/checkin/teamCheckin";
import { generateDraft, weekUrl } from "@/lib/weekly/summary";
import { weekLabel } from "@/lib/checkin/teamForm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Borrador del resumen semanal. Vercel Cron los viernes 12:00 CR (18:00 UTC):
// arma el borrador con lo que haya y le avisa por DM a quien facilita (o al CEO
// si no hay facilitador) para que lo revise y lo envíe desde la página Semana.
// Nunca publica solo. `?dryRun=1` devuelve el borrador sin guardar ni avisar.
export async function GET(request: Request) {
  const denied = requireCronAuth(request);
  if (denied) return denied;
  const dryRun = new URL(request.url).searchParams.get("dryRun") === "1";

  try {
    const now = new Date();
    const period = checkinWeek(now);
    if (dryRun) {
      const { loadWeek } = await import("@/lib/weekly/summary");
      const { renderWeeklyDraft } = await import("@/lib/weekly/render");
      const week = await loadWeek(period, { now });
      return NextResponse.json({ ok: true, dryRun, draft: renderWeeklyDraft(week.data, null) });
    }

    const draft = await generateDraft(period, { now });
    const { answers, members } = await weekParticipation(period, now);

    let publishers = await prisma.user.findMany({ where: { isFacilitator: true }, select: { name: true, email: true } });
    if (!publishers.length) publishers = await prisma.user.findMany({ where: { role: "ceo" }, select: { name: true, email: true } });
    const notified: string[] = [];
    if (draft.status !== "already_sent") {
      const url = weekUrl(period);
      for (const p of publishers) {
        const slackId = await lookupSlackUserByEmail(p.email);
        const dm = slackId ? await openDm(slackId) : null;
        if (!dm) continue;
        await postSlackMessage(
          dm,
          `📝 ${p.name.split(" ")[0]}, el borrador del resumen de la semana del ${weekLabel(period)} está listo ` +
            `(respondieron ${answers.length} de ${members.length}).\n` +
            `Revisalo, ocultá lo que no va y envialo a #weekly-check-ins antes de las 15:00: ${url ?? "página Semana de EOS"}`,
        );
        notified.push(p.name);
      }
    }
    return NextResponse.json({ ok: true, status: draft.status, usedNarrative: draft.usedNarrative, notified });
  } catch (error) {
    console.error("[weekly-cron] Error:", error);
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
