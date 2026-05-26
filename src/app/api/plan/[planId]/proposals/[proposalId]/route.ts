import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

type ProposalStatus = "RECEIVED" | "REVIEWING" | "APPROVED" | "REJECTED";

const VALID_STATUSES: ProposalStatus[] = ["RECEIVED", "REVIEWING", "APPROVED", "REJECTED"];

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ planId: string; proposalId: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (session.user.role !== "ceo") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { planId, proposalId } = await params;
  const proposal = await prisma.planProposal.findUnique({ where: { id: proposalId } });
  if (!proposal || proposal.planId !== planId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await request.json();
  const { status } = body as { status?: ProposalStatus };

  if (!status || !VALID_STATUSES.includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const updated = await prisma.planProposal.update({
    where: { id: proposalId },
    data: { status },
  });

  return NextResponse.json(updated);
}
