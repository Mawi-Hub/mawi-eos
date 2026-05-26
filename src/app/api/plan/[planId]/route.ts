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
      quarters: { orderBy: [{ year: "asc" }, { quarter: "asc" }] },
    },
  });

  if (!plan) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(plan);
}
