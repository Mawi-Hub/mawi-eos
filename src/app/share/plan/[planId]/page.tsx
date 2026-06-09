import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { Plan3Palancas } from "@/components/plan/Plan3Palancas";
import { PlanNorthStars } from "@/components/plan/PlanNorthStars";
import { PlanRevenueTree } from "@/components/plan/PlanRevenueTree";
import { PlanAreaSection } from "@/components/plan/PlanAreaSection";
import type { KPIDirection } from "@/lib/plan/calculations";
import { overlayScorecardActuals } from "@/lib/plan/scorecardOverlay";

const AREAS = ["COMERCIAL", "CUSTOMER_SUCCESS", "PRODUCTO", "INGENIERIA"] as const;
type AreaKey = (typeof AREAS)[number];

export const metadata = {
  title: "Plan H2 — Mawi",
  description: "Plan de crecimiento Segundo Semestre 2026",
};

export default async function PublicPlanPage({
  params,
}: {
  params: Promise<{ planId: string }>;
}) {
  const { planId } = await params;

  const plan = await prisma.plan.findUnique({
    where: { id: planId },
    include: {
      kpis: {
        include: {
          entries: { orderBy: { period: "asc" } },
          owner: { select: { id: true, name: true, role: true } },
        },
        orderBy: { displayOrder: "asc" },
      },
      actions: {
        include: { owner: { select: { id: true, name: true } } },
        orderBy: { displayOrder: "asc" },
      },
      risks: { orderBy: { displayOrder: "asc" } },
    },
  });

  if (!plan) notFound();

  const kpisRaw = plan.kpis.map((k) => ({
    id: k.id,
    slug: k.slug,
    name: k.name,
    unit: k.unit,
    direction: k.direction as KPIDirection,
    baseline: k.baseline,
    target: k.target,
    area: k.area as "NORTH_STAR" | AreaKey,
    isPrincipal: k.isPrincipal,
    sourceType: k.sourceType as string,
    sourceKey: k.sourceKey as string | null,
    owner: k.owner,
    entries: k.entries.map((e) => ({
      period: e.period,
      projected: e.projected,
      actual: e.actual,
    })),
  }));

  const kpisForUI = await overlayScorecardActuals(kpisRaw);

  const northStarKpis = kpisForUI.filter((k) => k.area === "NORTH_STAR");
  const byArea: Record<AreaKey, typeof kpisForUI> = {
    COMERCIAL: [],
    CUSTOMER_SUCCESS: [],
    PRODUCTO: [],
    INGENIERIA: [],
  };
  for (const kpi of kpisForUI) {
    if (kpi.area !== "NORTH_STAR") byArea[kpi.area].push(kpi);
  }

  const actionsByArea: Record<AreaKey, typeof plan.actions> = {
    COMERCIAL: [],
    CUSTOMER_SUCCESS: [],
    PRODUCTO: [],
    INGENIERIA: [],
  };
  for (const action of plan.actions) {
    const area = action.area as AreaKey | "NORTH_STAR";
    if (area !== "NORTH_STAR") actionsByArea[area].push(action);
  }

  const risksByArea: Record<AreaKey, typeof plan.risks> = {
    COMERCIAL: [],
    CUSTOMER_SUCCESS: [],
    PRODUCTO: [],
    INGENIERIA: [],
  };
  for (const risk of plan.risks) {
    const area = risk.area as AreaKey | "NORTH_STAR";
    if (area !== "NORTH_STAR") risksByArea[area].push(risk);
  }

  function ownerNameForArea(area: AreaKey): string {
    const principal = byArea[area].find((k) => k.isPrincipal);
    if (principal) return principal.owner.name;
    const action = actionsByArea[area].find((a) => a.owner);
    if (action?.owner) return action.owner.name;
    const anyKpi = byArea[area][0];
    return anyKpi?.owner.name ?? "—";
  }

  const now = new Date();
  const monthsLeft = Math.max(
    0,
    (plan.endDate.getUTCFullYear() - now.getUTCFullYear()) * 12 +
      (plan.endDate.getUTCMonth() - now.getUTCMonth())
  );
  const monthsLabel =
    monthsLeft === 0 ? "último mes" : `${monthsLeft} ${monthsLeft === 1 ? "mes" : "meses"} para la meta`;
  const startFmt = plan.startDate.toLocaleDateString("es", { month: "short", year: "numeric" });
  const endFmt = plan.endDate.toLocaleDateString("es", { month: "short", year: "numeric" });

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-8 md:px-8">
      <div className="mx-auto max-w-6xl space-y-8">
        <header>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-mawi-700">
                Mawi · Vista compartida
              </p>
              <h1 className="mt-1 text-2xl font-bold text-gray-900">{plan.name}</h1>
              <p className="mt-1 text-sm text-gray-500">
                {startFmt} → {endFmt} · {monthsLabel}
              </p>
            </div>
          </div>
        </header>

        <Plan3Palancas kpis={northStarKpis} endDate={plan.endDate} />

        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
            North Stars
          </h2>
          <PlanNorthStars kpis={northStarKpis} subtitleOverride="Compañía" />
        </section>

        <section>
          <PlanRevenueTree kpis={kpisForUI} />
        </section>

        <section className="space-y-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
            Cuatro áreas, una sola misión
          </h2>
          {AREAS.map((area) => (
            <PlanAreaSection
              key={area}
              planId={planId}
              area={area}
              ownerName={ownerNameForArea(area)}
              kpis={byArea[area]}
              actions={actionsByArea[area]}
              risks={risksByArea[area]}
              linkableKpis={false}
              showAreaAsSubtitle
            />
          ))}
        </section>

        <section className="rounded-2xl border border-gray-200 bg-gradient-to-r from-mawi-50 to-white p-6 text-center">
          <p className="text-sm font-medium text-mawi-900">
            Si el NDR sube, todos ganamos.
            <br />
            Si el NDR baja, todos somos responsables.
          </p>
        </section>

        <footer className="pt-4 text-center text-xs text-gray-400">
          Mawi EOS · Vista compartida read-only
        </footer>
      </div>
    </div>
  );
}
