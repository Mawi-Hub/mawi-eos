const API_BASE = "https://api.hubapi.com";

function getHeaders() {
  const key = process.env.HUBSPOT_API_KEY;
  if (!key) throw new Error("HUBSPOT_API_KEY not set");
  return {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
}

async function fetchHS(path: string, options: RequestInit = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { ...getHeaders(), ...options.headers },
  });

  if (!res.ok) throw new Error(`HubSpot ${res.status}: ${await res.text()}`);
  return res.json();
}

export async function searchDeals(filters: Record<string, unknown>[] = [], properties: string[] = []) {
  return fetchHS("/crm/v3/objects/deals/search", {
    method: "POST",
    body: JSON.stringify({
      filterGroups: [{ filters }],
      properties: ["dealname", "dealstage", "amount", "closedate", "createdate", "hs_analytics_source", ...properties],
      limit: 100,
    }),
  });
}

// Demo meetings are booked through the "¡Decisiones acertadas...!" HubSpot
// scheduler pages, so the title token is the only stable marker for them.
// Canceled bookings keep the title but gain a "Cancelado:" prefix.
const DEMO_TITLE_TOKEN = "Decisiones";
const CANCELED_TITLE_TOKEN = "Cancelado";

export async function searchDemoMeetings(createdSince: string) {
  const meetings: Array<Record<string, string>> = [];
  let after: string | undefined;

  do {
    const page = await fetchHS("/crm/v3/objects/meetings/search", {
      method: "POST",
      body: JSON.stringify({
        filterGroups: [
          {
            filters: [
              { propertyName: "hs_createdate", operator: "GTE", value: createdSince },
              { propertyName: "hs_meeting_title", operator: "CONTAINS_TOKEN", value: DEMO_TITLE_TOKEN },
              { propertyName: "hs_meeting_title", operator: "NOT_CONTAINS_TOKEN", value: CANCELED_TITLE_TOKEN },
            ],
          },
        ],
        properties: ["hs_meeting_title", "hs_createdate"],
        limit: 200,
        ...(after ? { after } : {}),
      }),
    });

    meetings.push(
      ...(page.results?.map((m: { properties: Record<string, string> }) => m.properties) ?? [])
    );
    after = page.paging?.next?.after;
  } while (after);

  return meetings;
}

export async function searchContacts(filters: Record<string, unknown>[] = []) {
  return fetchHS("/crm/v3/objects/contacts/search", {
    method: "POST",
    body: JSON.stringify({
      filterGroups: [{ filters }],
      properties: ["email", "lifecyclestage", "hs_analytics_source", "createdate"],
      limit: 100,
    }),
  });
}

export interface PipelineMetrics {
  leadsByChannel: Record<string, number>;
  showRate: number;
  closeRate: number;
  avgSalesCycleDays: number;
}

export function calculatePipelineMetrics(
  leads: Array<Record<string, string>>,
  deals: Array<Record<string, string>>,
  meetings: { completed: number; total: number }
): PipelineMetrics {
  // Leads by channel
  const leadsByChannel: Record<string, number> = {};
  for (const lead of leads) {
    const source = lead.hs_analytics_source || "Unknown";
    leadsByChannel[source] = (leadsByChannel[source] || 0) + 1;
  }

  // Show rate
  const showRate = meetings.total > 0 ? (meetings.completed / meetings.total) * 100 : 0;

  // Close rate
  const wonDeals = deals.filter((d) => d.dealstage === "closedwon");
  const closeRate = deals.length > 0 ? (wonDeals.length / deals.length) * 100 : 0;

  // Average sales cycle
  const cycleDays = wonDeals
    .filter((d) => d.closedate && d.createdate)
    .map((d) => {
      const close = new Date(d.closedate).getTime();
      const create = new Date(d.createdate).getTime();
      return (close - create) / (1000 * 60 * 60 * 24);
    });

  const avgSalesCycleDays = cycleDays.length > 0
    ? cycleDays.reduce((a, b) => a + b, 0) / cycleDays.length
    : 0;

  return { leadsByChannel, showRate, closeRate, avgSalesCycleDays };
}
