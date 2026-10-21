import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { maxRocksPerPerson } from "@/lib/company/config";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();

  // Tope de Rocks por persona y trimestre (ROCKS_PER_PERSON_MAX, 2 por defecto).
  const existingCount = await prisma.rock.count({
    where: { ownerId: session.user.id, quarterId: body.quarterId },
  });

  const max = maxRocksPerPerson();
  if (existingCount >= max) {
    return NextResponse.json({ error: `Máximo ${max} rocks por trimestre` }, { status: 400 });
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
