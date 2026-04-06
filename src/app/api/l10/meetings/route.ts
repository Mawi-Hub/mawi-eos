import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { quarterId } = await request.json();

  const meeting = await prisma.l10Meeting.create({
    data: {
      quarterId,
      date: new Date(),
      status: "upcoming",
    },
  });

  return NextResponse.json(meeting);
}
