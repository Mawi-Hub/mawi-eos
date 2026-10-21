import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { runPlanKpiSync } from "@/lib/sync/planKpis";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "ceo") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as { planId?: string };
  if (!body.planId) {
    return NextResponse.json({ error: "planId required" }, { status: 400 });
  }
  return runPlanKpiSync(body.planId);
}
