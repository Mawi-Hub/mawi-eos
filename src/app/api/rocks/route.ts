import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();

  // Check max 2 rocks per person per quarter
  const existingCount = await prisma.rock.count({
    where: { ownerId: session.user.id, quarterId: body.quarterId },
  });

  if (existingCount >= 2) {
    return NextResponse.json({ error: "Máximo 2 rocks por trimestre" }, { status: 400 });
  }

  const rock = await prisma.rock.create({
    data: {
      quarterId: body.quarterId,
      ownerId: session.user.id,
      title: body.title,
      description: body.description,
      deliverable: body.deliverable,
      doneCriteria: body.doneCriteria,
    },
  });

  return NextResponse.json(rock);
}
