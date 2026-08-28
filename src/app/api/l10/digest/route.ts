import { NextResponse } from "next/server";
import { sendL10Digest } from "@/lib/integrations/l10Digest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Pre-read del L10 en Slack. Vercel Cron los viernes 15:15 UTC = 09:15 Costa
// Rica, 15 minutos antes de la reunión. `?dryRun=1` devuelve el texto que
// mandaría sin postear nada.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dryRun = new URL(request.url).searchParams.get("dryRun") === "1";

  try {
    const result = await sendL10Digest({ dryRun });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("[l10-digest] Error enviando el pre-read:", error);
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
