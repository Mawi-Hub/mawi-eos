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

  const entry = await prisma.winChallenge.create({
    data: {
      userId: session.user.id,
      quarterId: body.quarterId,
      reportDate: new Date(),
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
