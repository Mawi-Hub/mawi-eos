import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ planId: string; kpiId: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { planId, kpiId } = await params;
  const kpi = await prisma.planKPI.findUnique({ where: { id: kpiId } });

  if (!kpi || kpi.planId !== planId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (session.user.role !== "ceo" && session.user.id !== kpi.ownerId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const { period, actual, note } = body as {
    period: string;
    actual: number | null;
    note?: string;
  };

  if (!period) {
    return NextResponse.json({ error: "period is required" }, { status: 400 });
  }

  const periodDate = new Date(period);
  const existing = await prisma.planKPIEntry.findUnique({
    where: { kpiId_period: { kpiId, period: periodDate } },
  });

  if (!existing) {
    return NextResponse.json(
      { error: "No projected waypoint for this period" },
      { status: 404 }
    );
  }

  const updated = await prisma.planKPIEntry.update({
    where: { kpiId_period: { kpiId, period: periodDate } },
    data: {
      actual: actual ?? null,
      note: note ?? existing.note,
    },
  });

  return NextResponse.json(updated);
}
