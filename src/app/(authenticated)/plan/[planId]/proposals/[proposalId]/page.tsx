import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { PlanProposalCard } from "@/components/plan/PlanProposalCard";

export default async function PlanProposalDetailPage({
  params,
}: {
  params: Promise<{ planId: string; proposalId: string }>;
}) {
  const { planId, proposalId } = await params;
  const proposal = await prisma.planProposal.findUnique({
    where: { id: proposalId },
    include: {
      owner: { select: { id: true, name: true } },
      milestones: { orderBy: { targetDate: "asc" } },
    },
  });

  if (!proposal || proposal.planId !== planId) notFound();

  return (
    <div className="space-y-4">
      <Link
        href={`/plan/${planId}/proposals`}
        className="text-xs text-gray-500 hover:text-gray-700"
      >
        ← Volver a propuestas
      </Link>
      <PlanProposalCard proposal={proposal} />
    </div>
  );
}
