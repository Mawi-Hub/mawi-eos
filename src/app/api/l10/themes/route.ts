import { NextResponse } from "next/server";
import { requireCronAuth } from "@/lib/cronAuth";
import { deliverToLeadership } from "@/lib/integrations/l10Digest";
import { checkinWeek } from "@/lib/checkin/teamCheckin";
import { generateTeamThemes, themesSlackText } from "@/lib/weekly/themes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Lo que se repite en el equipo. Vercel Cron los viernes 10:15 CR (16:15 UTC):
// arma los temas desde los check-ins de la semana, los deja en la página de la
// L10 y avisa a management (canal de la L10 o DM a cada líder). Nunca crea IDS
// solo. `?dryRun=1` arma los temas y el texto sin guardar ni enviar.
export async function GET(request: Request) {
  const denied = requireCronAuth(request);
  if (denied) return denied;
  const dryRun = new URL(request.url).searchParams.get("dryRun") === "1";

  try {
    const period = checkinWeek(new Date());
    if (dryRun) {
      const { loadThemeInputs, parseThemes, themesPrompt } = await import("@/lib/weekly/themes");
      const { claudeJson } = await import("@/lib/weekly/claude");
      const { crIsoDate } = await import("@/lib/time/costaRica");
      const input = await loadThemeInputs(period);
      const themes = parseThemes(await claudeJson(themesPrompt(input.answers, input.previous), 2500), { ...input, week: crIsoDate(period) });
      return NextResponse.json({ ok: true, dryRun, answers: input.answers.length, themes });
    }
    const { themes, answers } = await generateTeamThemes(period);
    const url = process.env.NEXTAUTH_URL ? `${process.env.NEXTAUTH_URL}/l10` : null;
    const recipients = themes.length ? await deliverToLeadership(themesSlackText(themes, url), false) : [];
    return NextResponse.json({ ok: true, answers, themes: themes.length, recipients });
  } catch (error) {
    console.error("[l10-themes] Error:", error);
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
