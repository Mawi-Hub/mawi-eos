import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import bcrypt from "bcryptjs";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const testEmail = url.searchParams.get("email");
    const testPass = url.searchParams.get("pass");

    const userCount = await prisma.user.count();
    const users = await prisma.user.findMany({
      select: { email: true, name: true },
    });

    const result: Record<string, unknown> = {
      status: "ok",
      db: "connected",
      userCount,
      users: users.map((u) => u.email),
      bcryptVersion: typeof bcrypt.compare,
    };

    if (testEmail && testPass) {
      const user = await prisma.user.findUnique({ where: { email: testEmail } });
      if (user) {
        const isValid = await bcrypt.compare(testPass, user.passwordHash);
        result.loginTest = { email: testEmail, found: true, passwordValid: isValid, hashPrefix: user.passwordHash.substring(0, 7) };
      } else {
        result.loginTest = { email: testEmail, found: false };
      }
    }

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ status: "error", error: String(error) }, { status: 500 });
  }
}
