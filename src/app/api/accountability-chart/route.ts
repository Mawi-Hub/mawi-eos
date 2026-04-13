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
