import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { calculateStatus } from "@/lib/utils";
import { normalizeManualEntry } from "@/lib/plan/manualEntry";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const { metricId, quarterId, actualDisplay, notes, statusOverride } = body;
  if (typeof metricId !== "string" || typeof quarterId !== "string") {
    return NextResponse.json({ error: "metricId y quarterId son requeridos" }, { status: 400 });
  }

  // Verify the user owns this metric
  const metric = await prisma.scorecardMetric.findUnique({
    where: { id: metricId },
  });

  if (!metric || metric.ownerId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // La captura manual se acepta para cualquier métrica, esté o no en la
  // selección del trimestre: ocultar una métrica nunca frena el registro.
  const normalized = normalizeManualEntry(
    {
      actualValue: body.actualValue,
      dataState: body.dataState,
      numerator: body.numerator,
      denominator: body.denominator,
      provenance: body.provenance,
    },
    metric,
  );
  if (!normalized.ok) {
    return NextResponse.json({ error: normalized.error }, { status: 400 });
  }
  const { actualValue, dataState, numerator, denominator, provenance } = normalized;

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

  // Sin número (pendiente, sin muestra, error, no aplica) no hay semáforo.
  const status = normalized.noValue
    ? "pending"
    : statusOverride || calculateStatus(actualValue, metric.targetNumeric, metric.targetDirection);
  const display = normalized.noValue ? null : actualDisplay || null;

  const entry = await prisma.scorecardEntry.upsert({
    where: {
      metricId_periodStart: {
        metricId,
        periodStart,
      },
    },
    update: {
      actualValue,
      actualDisplay: display,
      expectedValue: metric.targetNumeric,
      status,
      dataState,
      numerator,
      denominator,
      provenance,
      notes: notes || null,
      enteredById: session.user.id,
    },
    create: {
      metricId,
      quarterId,
      periodStart,
      periodEnd,
      actualValue,
      actualDisplay: display,
      expectedValue: metric.targetNumeric,
      status,
      dataState,
      numerator,
      denominator,
      provenance,
      notes: notes || null,
      enteredById: session.user.id,
    },
  });

  return NextResponse.json(entry);
}
