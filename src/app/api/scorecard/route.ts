import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { calculateStatus } from "@/lib/utils";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { metricId, quarterId, actualValue, actualDisplay, notes, statusOverride } = body;

  // Verify the user owns this metric
  const metric = await prisma.scorecardMetric.findUnique({
    where: { id: metricId },
  });

  if (!metric || metric.ownerId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  // For weekly metrics, use current week boundaries
  if (metric.frequency === "weekly") {
    const day = now.getDay();
    const mondayOffset = day === 0 ? -6 : 1 - day;
    periodStart.setTime(now.getTime());
    periodStart.setDate(now.getDate() + mondayOffset);
    periodStart.setHours(0, 0, 0, 0);
    periodEnd.setTime(periodStart.getTime() + 6 * 24 * 60 * 60 * 1000);
  }

  const status = statusOverride || calculateStatus(actualValue, metric.targetNumeric, metric.targetDirection);

  const entry = await prisma.scorecardEntry.upsert({
    where: {
      metricId_periodStart: {
        metricId,
        periodStart,
      },
    },
    update: {
      actualValue,
      actualDisplay: actualDisplay || null,
      status,
      notes: notes || null,
      enteredById: session.user.id,
    },
    create: {
      metricId,
      quarterId,
      periodStart,
      periodEnd,
      actualValue,
      actualDisplay: actualDisplay || null,
      status,
      notes: notes || null,
      enteredById: session.user.id,
    },
  });

  return NextResponse.json(entry);
}
