import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { PlanProposalCard } from "@/components/plan/PlanProposalCard";

export default async function PlanProposalsPage({
  params,
}: {
  params: Promise<{ planId: string }>;
}) {
  const { planId } = await params;
  const plan = await prisma.plan.findUnique({
    where: { id: planId },
    include: {
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

  if (plan.proposals.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 bg-white p-10 text-center text-sm text-gray-500">
        Aún no hay propuestas para este plan.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {plan.proposals.map((p) => (
        <PlanProposalCard key={p.id} proposal={p} />
      ))}
    </div>
  );
}
