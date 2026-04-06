import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { searchDeals, searchContacts, calculatePipelineMetrics } from "@/lib/integrations/hubspot";

export async function POST() {
  const session = await auth();
  if (!session?.user || session.user.role !== "ceo") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

    const [dealsResult, contactsResult] = await Promise.all([
      searchDeals([
        { propertyName: "createdate", operator: "GTE", value: thirtyDaysAgo },
      ]),
      searchContacts([
        { propertyName: "createdate", operator: "GTE", value: thirtyDaysAgo },
        { propertyName: "lifecyclestage", operator: "EQ", value: "marketingqualifiedlead" },
      ]),
    ]);

    const deals = dealsResult.results?.map((d: { properties: Record<string, string> }) => d.properties) || [];
    const leads = contactsResult.results?.map((c: { properties: Record<string, string> }) => c.properties) || [];

    const metrics = calculatePipelineMetrics(leads, deals, { completed: 0, total: 0 });

    await prisma.apiSyncCache.upsert({
      where: { source_dataKey: { source: "hubspot", dataKey: "pipeline_metrics" } },
      update: { data: metrics as object, syncedAt: new Date() },
      create: { source: "hubspot", dataKey: "pipeline_metrics", data: metrics as object, syncedAt: new Date() },
    });

    return NextResponse.json({ success: true, metrics });
  } catch (error) {
    console.error("HubSpot sync error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
