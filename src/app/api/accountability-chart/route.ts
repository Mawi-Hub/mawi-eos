import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "ceo") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();

  // keyMetrics es texto libre: solo se valida la forma, nunca se interpreta
  // como configuración de métricas ni de permisos.
  const lists = ["responsibilities", "decidesAlone", "keyMetrics"] as const;
  const isTextList = (v: unknown) => Array.isArray(v) && v.every((x) => typeof x === "string");
  if (typeof body.userId !== "string" || typeof body.title !== "string" || !body.title.trim()) {
    return NextResponse.json({ error: "Faltan el usuario o el título" }, { status: 400 });
  }
  for (const key of lists) {
    if (!isTextList(body[key])) return NextResponse.json({ error: `${key} debe ser una lista de textos` }, { status: 400 });
  }
  if (body.requiresApproval !== undefined && !isTextList(body.requiresApproval)) {
    return NextResponse.json({ error: "requiresApproval debe ser una lista de textos" }, { status: 400 });
  }

  const role = await prisma.accountabilityRole.upsert({
    where: { userId: body.userId },
    create: {
      userId: body.userId,
      title: body.title,
      responsibilities: body.responsibilities,
      decidesAlone: body.decidesAlone,
      requiresApproval: body.requiresApproval || [],
      keyMetrics: body.keyMetrics,
      sortOrder: body.sortOrder ?? 0,
    },
    update: {
      title: body.title,
      responsibilities: body.responsibilities,
      decidesAlone: body.decidesAlone,
      requiresApproval: body.requiresApproval || [],
      keyMetrics: body.keyMetrics,
      sortOrder: body.sortOrder ?? 0,
    },
  });

  return NextResponse.json(role);
}
