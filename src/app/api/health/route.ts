import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  try {
    const userCount = await prisma.user.count();
    const users = await prisma.user.findMany({
      select: { email: true, name: true },
    });
    return NextResponse.json({
      status: "ok",
      db: "connected",
      userCount,
      users: users.map((u) => u.email),
      dbUrl: process.env.DATABASE_URL?.substring(0, 30) + "...",
    });
  } catch (error) {
    return NextResponse.json({
      status: "error",
      error: String(error),
      dbUrl: process.env.DATABASE_URL?.substring(0, 30) + "...",
    }, { status: 500 });
  }
}
