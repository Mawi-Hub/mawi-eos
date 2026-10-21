import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { runHubspotSync } from "@/lib/sync/hubspot";

export async function POST() {
  const session = await auth();
  if (!session?.user || session.user.role !== "ceo") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return runHubspotSync();
}
