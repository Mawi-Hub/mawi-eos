import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireCronAuth } from "@/lib/cronAuth";
import { runChartmogulSync } from "@/lib/sync/chartmogul";
import { runHubspotSync } from "@/lib/sync/hubspot";
import { runPosthogSync } from "@/lib/sync/posthog";
import { runPlanKpiSync } from "@/lib/sync/planKpis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Sincroniza las fuentes antes de la preparación de los managers, para que los
// números del check-in y del scorecard ya vengan cargados. Vercel Cron los
// viernes 07:00 CR (13:00 UTC). Es lo mismo que apretar los botones de sync:
// ChartMogul, HubSpot y PostHog, y después los KPIs del plan del trimestre
// activo. Una fuente que falla no frena a las demás.
export async function GET(request: Request) {
  const denied = requireCronAuth(request);
  if (denied) return denied;

  const results: Record<string, { ok: boolean; status: number; error?: string }> = {};
  const run = async (name: string, task: () => Promise<Response>) => {
    try {
      const res = await task();
      results[name] = { ok: res.ok, status: res.status, ...(res.ok ? {} : { error: String(((await res.json().catch(() => ({}))) as { error?: unknown }).error ?? "") }) };
    } catch (error) {
      results[name] = { ok: false, status: 500, error: String(error) };
    }
  };

  await run("chartmogul", runChartmogulSync);
  await run("hubspot", runHubspotSync);
  await run("posthog", runPosthogSync);

  const quarter = await prisma.quarter.findFirst({ where: { isActive: true }, select: { planId: true } });
  if (quarter?.planId) await run("plan-kpis", () => runPlanKpiSync(quarter.planId!));
  else results["plan-kpis"] = { ok: false, status: 409, error: "El trimestre activo no tiene plan" };

  const ok = Object.values(results).every((r) => r.ok);
  console.log(`[sync-cron] ${Object.entries(results).map(([k, v]) => `${k}:${v.ok ? "ok" : v.status}`).join(" ")}`);
  return NextResponse.json({ ok, results }, { status: ok ? 200 : 207 });
}
