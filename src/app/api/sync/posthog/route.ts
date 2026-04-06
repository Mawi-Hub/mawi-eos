import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { queryHogQL } from "@/lib/integrations/posthog";

export async function POST() {
  const session = await auth();
  if (!session?.user || session.user.role !== "ceo") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const sessionsQuery = `
      SELECT
        person.properties.$group_0 as company_id,
        count(distinct person.id) as active_users,
        count(*) as session_count
      FROM events
      WHERE event = '$pageview'
        AND timestamp >= now() - interval 14 day
      GROUP BY company_id
      HAVING company_id IS NOT NULL
    `;

    const sessionsData = await queryHogQL(sessionsQuery);

    await prisma.apiSyncCache.upsert({
      where: { source_dataKey: { source: "posthog", dataKey: "engagement_data" } },
      update: { data: (sessionsData.results || []) as unknown as object, syncedAt: new Date() },
      create: { source: "posthog", dataKey: "engagement_data", data: (sessionsData.results || []) as unknown as object, syncedAt: new Date() },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("PostHog sync error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
