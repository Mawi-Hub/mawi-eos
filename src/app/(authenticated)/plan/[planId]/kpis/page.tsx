import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { PlanKPICard } from "@/components/plan/PlanKPICard";
import type { KPIDirection } from "@/lib/plan/calculations";

export default async function PlanKPIsPage({
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
          owner: { select: { id: true, name: true } },
        },
        orderBy: { displayOrder: "asc" },
      },
    },
  });

  if (!plan) notFound();

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {plan.kpis.map((kpi) => (
        <PlanKPICard
          key={kpi.id}
          planId={planId}
          kpiId={kpi.id}
          name={kpi.name}
          unit={kpi.unit}
          direction={kpi.direction as KPIDirection}
          target={kpi.target}
          ownerName={kpi.owner.name}
          entries={kpi.entries}
        />
      ))}
    </div>
  );
}
