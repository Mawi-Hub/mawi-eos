import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

const VALID_TARGETS = new Set(["rock", "metric", "win", "challenge"]);
const VALID_TAGS = new Set(["clarificar", "discutir"]);

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { meetingId, targetType, targetId, tag, comment } = await request.json();

  if (!VALID_TARGETS.has(targetType)) {
    return NextResponse.json({ error: "targetType inválido" }, { status: 400 });
  }
  if (!VALID_TAGS.has(tag)) {
    return NextResponse.json({ error: "tag debe ser 'clarificar' o 'discutir'" }, { status: 400 });
  }
  if (!comment?.trim()) {
    return NextResponse.json({ error: "Comentario requerido" }, { status: 400 });
  }

  const annotation = await prisma.l10Annotation.create({
    data: {
      meetingId,
      authorId: session.user.id,
      targetType,
      targetId,
      tag,
      comment: comment.trim(),
    },
  });

  return NextResponse.json(annotation);
}

export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { annotationId, resolve } = await request.json();

  const annotation = await prisma.l10Annotation.update({
    where: { id: annotationId },
    data: resolve
      ? { resolvedAt: new Date(), resolvedById: session.user.id }
      : { resolvedAt: null, resolvedById: null },
  });

  return NextResponse.json(annotation);
}

export async function DELETE(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { annotationId } = await request.json();
  const existing = await prisma.l10Annotation.findUnique({ where: { id: annotationId } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (existing.authorId !== session.user.id && session.user.role !== "ceo") {
    return NextResponse.json({ error: "Solo el autor o CEO pueden borrar" }, { status: 403 });
  }

  await prisma.l10Annotation.delete({ where: { id: annotationId } });
  return NextResponse.json({ success: true });
}
