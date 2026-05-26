import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { PlanNorthStars } from "@/components/plan/PlanNorthStars";
import { PlanRevenueTree } from "@/components/plan/PlanRevenueTree";
import { PlanKPICard } from "@/components/plan/PlanKPICard";
import { PlanProposalCard } from "@/components/plan/PlanProposalCard";
import type { KPIDirection } from "@/lib/plan/calculations";

export default async function PlanOverviewPage({
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
      proposals: {
        include: {
          owner: { select: { id: true, name: true } },
          milestones: { orderBy: { targetDate: "asc" } },
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!plan) notFound();

  const kpisForUI = plan.kpis.map((k) => ({
    id: k.id,
    slug: k.slug,
    name: k.name,
    unit: k.unit,
    direction: k.direction as KPIDirection,
    baseline: k.baseline,
    target: k.target,
    owner: k.owner,
    entries: k.entries,
  }));

  return (
    <div className="space-y-8">
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
          North Stars
        </h2>
        <PlanNorthStars kpis={kpisForUI} />
      </section>

      <section>
        <PlanRevenueTree kpis={kpisForUI} />
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
          KPIs del plan
        </h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {kpisForUI.map((kpi) => (
            <PlanKPICard
              key={kpi.id}
              planId={planId}
              kpiId={kpi.id}
              name={kpi.name}
              unit={kpi.unit}
              direction={kpi.direction}
              target={kpi.target}
              ownerName={kpi.owner.name}
              entries={kpi.entries}
            />
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
          Propuestas del equipo
        </h2>
        {plan.proposals.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-300 bg-white p-6 text-center text-sm text-gray-500">
            Aún no hay propuestas para este plan.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {plan.proposals.map((p) => (
              <PlanProposalCard key={p.id} proposal={p} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
