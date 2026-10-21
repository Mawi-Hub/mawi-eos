import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { queryHogQL } from "@/lib/integrations/posthog";

// Lógica de la sincronización, compartida por el botón (POST con sesión de CEO)
// y el cron del viernes (/api/sync/cron).
export async function runPosthogSync(): Promise<Response> {
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
