import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const entryType = body.entryType || "win";
  const reportDate = new Date();

  // Bucket the entry into the quarter that actually contains its report date —
  // the latest quarter that has already started (quarters are contiguous) —
  // rather than trusting the client's active-quarter id, which goes stale the
  // moment a quarter boundary is crossed and makes entries "disappear".
  const quarter =
    (await prisma.quarter.findFirst({
      where: { startDate: { lte: reportDate } },
      orderBy: { startDate: "desc" },
    })) ??
    (body.quarterId
      ? await prisma.quarter.findUnique({ where: { id: body.quarterId } })
      : null);
  if (!quarter) {
    return NextResponse.json({ error: "No quarter for report date" }, { status: 400 });
  }

  const entry = await prisma.winChallenge.create({
    data: {
      userId: session.user.id,
      quarterId: quarter.id,
      reportDate,
      entryType,
      wins: entryType === "win" ? body.wins || null : null,
      result: entryType === "win" ? body.result || null : null,
      keyChallenge: entryType === "challenge" ? body.keyChallenge || null : null,
      priority: entryType === "challenge" ? body.priority || "medio" : "medio",
      followUpAction: entryType === "challenge" ? body.followUpAction || null : null,
    },
  });

  return NextResponse.json(entry);
}
