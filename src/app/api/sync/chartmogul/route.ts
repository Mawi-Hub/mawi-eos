import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getMRRMetrics, getARPA, getCustomerChurnRate, parseMRREntries } from "@/lib/integrations/chartmogul";

export async function POST() {
  const session = await auth();
  if (!session?.user || session.user.role !== "ceo") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const endDate = new Date().toISOString().split("T")[0];
    const startDate = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

    const [mrrData, arpaData, churnData] = await Promise.all([
      getMRRMetrics(startDate, endDate),
      getARPA(startDate, endDate),
      getCustomerChurnRate(startDate, endDate),
    ]);

    const mrrBreakdown = parseMRREntries(mrrData);

    await Promise.all([
      prisma.apiSyncCache.upsert({
        where: { source_dataKey: { source: "chartmogul", dataKey: "mrr_breakdown" } },
        update: { data: mrrBreakdown as unknown as object, syncedAt: new Date() },
        create: { source: "chartmogul", dataKey: "mrr_breakdown", data: mrrBreakdown as unknown as object, syncedAt: new Date() },
      }),
      prisma.apiSyncCache.upsert({
        where: { source_dataKey: { source: "chartmogul", dataKey: "arpa" } },
        update: { data: (arpaData.entries || []) as unknown as object, syncedAt: new Date() },
        create: { source: "chartmogul", dataKey: "arpa", data: (arpaData.entries || []) as unknown as object, syncedAt: new Date() },
      }),
      prisma.apiSyncCache.upsert({
        where: { source_dataKey: { source: "chartmogul", dataKey: "churn_rate" } },
        update: { data: (churnData.entries || []) as unknown as object, syncedAt: new Date() },
        create: { source: "chartmogul", dataKey: "churn_rate", data: (churnData.entries || []) as unknown as object, syncedAt: new Date() },
      }),
    ]);

    return NextResponse.json({ success: true, lastEntry: mrrBreakdown[mrrBreakdown.length - 1] });
  } catch (error) {
    console.error("ChartMogul sync error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
