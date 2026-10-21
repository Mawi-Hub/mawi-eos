import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isLeaderRole } from "@/lib/access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UNITS = ["%", "$", "count", "days", "hours", "ratio", "months", "boolean"];
const FREQUENCIES = ["weekly", "biweekly", "monthly"];
const DIRECTIONS = ["above", "below", "equal"];
const AGGREGATIONS = ["last", "sum", "avg", "max"];
const SOURCES = ["manual", "hubspot", "chartmogul", "posthog"];

type Body = {
  label?: string;
  group?: string | null;
  description?: string | null;
  numerator?: string | null;
  denominator?: string | null;
  unit?: string;
  frequency?: string;
  direction?: string;
  aggregation?: string;
  target?: number | null;
  targetText?: string | null;
  targetConfirmed?: boolean;
  approved?: boolean;
  notes?: string | null;
  // De la métrica (compartido con otros trimestres):
  dataSource?: string;
  ownerId?: string;
};

const text = (v: unknown, max = 400) => (typeof v === "string" ? v.trim().slice(0, max) || null : v === null ? null : undefined);

// Cómo se calcula una métrica del trimestre: solo el CEO. Cambia la definición
// de esta selección (etiqueta, fórmula, unidad, frecuencia, dirección, meta) y,
// si se pide, la fuente y el responsable de la métrica.
export async function PATCH(request: Request, ctx: { params: Promise<{ selectionId: string }> }) {
  const session = await auth();
  if (session?.user?.role !== "ceo") return NextResponse.json({ error: "Solo el CEO" }, { status: 403 });
  const { selectionId } = await ctx.params;
  const body = (await request.json().catch(() => null)) as Body | null;
  if (!body) return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 });

  const sel = await prisma.quarterMetricSelection.findUnique({ where: { id: selectionId } });
  if (!sel) return NextResponse.json({ error: "No encontrada" }, { status: 404 });

  const bad = (field: string) => NextResponse.json({ error: `Valor inválido: ${field}` }, { status: 400 });
  if (body.unit !== undefined && !UNITS.includes(body.unit)) return bad("unidad");
  if (body.frequency !== undefined && !FREQUENCIES.includes(body.frequency)) return bad("frecuencia");
  if (body.direction !== undefined && !DIRECTIONS.includes(body.direction)) return bad("dirección");
  if (body.aggregation !== undefined && !AGGREGATIONS.includes(body.aggregation)) return bad("agregación");
  if (body.dataSource !== undefined && !SOURCES.includes(body.dataSource)) return bad("fuente");
  if (body.target !== undefined && body.target !== null && !Number.isFinite(body.target)) return bad("meta");

  const prev = (sel.definition ?? {}) as Record<string, unknown>;
  const next: Record<string, unknown> = { ...prev };
  const set = (key: string, value: unknown) => {
    if (value === undefined) return;
    if (value === null) delete next[key];
    else next[key] = value;
  };
  set("label", text(body.label, 120));
  set("group", text(body.group, 40));
  set("description", text(body.description, 600));
  set("numerator", text(body.numerator));
  set("denominator", text(body.denominator));
  set("unit", body.unit);
  set("frequency", body.frequency);
  set("direction", body.direction);
  set("aggregation", body.aggregation);
  set("target", body.target);
  set("targetText", text(body.targetText, 80));
  set("notes", text(body.notes, 600));
  if (body.targetConfirmed !== undefined) next.targetConfirmed = !!body.targetConfirmed;
  next.editedBy = session.user.name;
  next.editedAt = new Date().toISOString();

  if (body.ownerId !== undefined) {
    const owner = await prisma.user.findUnique({ where: { id: body.ownerId }, select: { role: true } });
    if (!owner || !isLeaderRole(owner.role)) return bad("responsable");
  }

  const label = text(body.label, 120);
  await prisma.$transaction(async (tx) => {
    await tx.quarterMetricSelection.update({
      where: { id: sel.id },
      data: {
        definition: next as object,
        ...(label ? { displayLabel: label } : {}),
        ...(body.approved !== undefined ? { approvalStatus: body.approved ? "approved" : "pending" } : {}),
      },
    });
    if (sel.scorecardMetricId && (body.dataSource !== undefined || body.ownerId !== undefined || body.aggregation !== undefined)) {
      await tx.scorecardMetric.update({
        where: { id: sel.scorecardMetricId },
        data: {
          ...(body.dataSource !== undefined ? { dataSource: body.dataSource } : {}),
          ...(body.ownerId !== undefined ? { ownerId: body.ownerId } : {}),
          ...(body.aggregation !== undefined ? { aggregation: body.aggregation } : {}),
        },
      });
    }
  });
  return NextResponse.json({ ok: true });
}
