import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { runChartmogulSync } from "@/lib/sync/chartmogul";

export async function POST() {
  const session = await auth();
  if (!session?.user || session.user.role !== "ceo") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return runChartmogulSync();
}
