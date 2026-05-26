import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ planId: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { planId } = await params;
  const proposals = await prisma.planProposal.findMany({
    where: { planId },
    include: {
      owner: { select: { id: true, name: true } },
      milestones: { orderBy: { targetDate: "asc" } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(proposals);
}

type MilestoneInput = {
  quarter: string;
  description: string;
  targetDate: string;
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ planId: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { planId } = await params;
  const body = await request.json();
  const { area, content, resources, milestones } = body as {
    area: string;
    content: string;
    resources: unknown;
    milestones?: MilestoneInput[];
  };

  if (!area || !content) {
    return NextResponse.json({ error: "area and content are required" }, { status: 400 });
  }

  const proposal = await prisma.planProposal.create({
    data: {
      planId,
      ownerId: session.user.id,
      area,
      content,
      resources: (resources as object) ?? {},
      submittedAt: new Date(),
      milestones: milestones?.length
        ? {
            create: milestones.map((m) => ({
              quarter: m.quarter,
              description: m.description,
              targetDate: new Date(m.targetDate),
            })),
          }
        : undefined,
    },
    include: { milestones: true },
  });

  return NextResponse.json(proposal);
}
