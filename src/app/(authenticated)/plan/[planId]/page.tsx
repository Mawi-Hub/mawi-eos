import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { Plan3Palancas } from "@/components/plan/Plan3Palancas";
import { PlanNorthStars } from "@/components/plan/PlanNorthStars";
import { PlanRevenueTree } from "@/components/plan/PlanRevenueTree";
import { PlanAreaSection } from "@/components/plan/PlanAreaSection";
import type { KPIDirection } from "@/lib/plan/calculations";
import { overlayScorecardActuals } from "@/lib/plan/scorecardOverlay";
import { PlanSyncButton } from "./sync-button";

const AREAS = ["COMERCIAL", "CUSTOMER_SUCCESS", "PRODUCTO", "INGENIERIA"] as const;
type AreaKey = (typeof AREAS)[number];

export default async function PlanOverviewPage({
  params,
}: {
  params: Promise<{ planId: string }>;
}) {
  const { planId } = await params;
  const session = await auth();

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

  return (
    <div className="space-y-8">
      {session?.user.role === "ceo" && (
        <section>
          <PlanSyncButton planId={planId} />
        </section>
      )}

      <Plan3Palancas kpis={northStarKpis} />

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
          North Stars
        </h2>
        <PlanNorthStars kpis={northStarKpis} />
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
    </div>
  );
}
