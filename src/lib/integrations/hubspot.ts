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

// HubSpot devuelve máximo 100 por página: se pagina TODO el período para que
// ningún conteo quede recortado en silencio.
async function searchAll(
  path: string,
  body: Record<string, unknown>,
  pageSize = 100,
): Promise<Array<{ id: string; properties: Record<string, string> }>> {
  const all: Array<{ id: string; properties: Record<string, string> }> = [];
  let after: string | undefined;
  do {
    const page = await fetchHS(path, {
      method: "POST",
      body: JSON.stringify({ ...body, limit: pageSize, ...(after ? { after } : {}) }),
    });
    all.push(...(page.results ?? []));
    after = page.paging?.next?.after;
  } while (after);
  return all;
}

export async function searchDeals(filters: Record<string, unknown>[] = [], properties: string[] = []) {
  const results = await searchAll("/crm/v3/objects/deals/search", {
    filterGroups: [{ filters }],
    properties: ["dealname", "dealstage", "amount", "closedate", "createdate", "hs_analytics_source", ...properties],
  });
  return { results };
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
  const results = await searchAll("/crm/v3/objects/contacts/search", {
    filterGroups: [{ filters }],
    properties: ["email", "lifecyclestage", "hs_analytics_source", "createdate"],
  });
  return { results };
}

// Citas de demo con su resultado, por fecha de la cita (no de creación), para
// el show rate. Incluye las canceladas: no se borran para mejorar el número.
export type DemoMeeting = {
  id: string;
  title: string;
  startTime: string | null; // ISO
  outcome: string; // SCHEDULED | COMPLETED | RESCHEDULED | NO_SHOW | CANCELED | ""
};

export async function searchDemoMeetingsInPeriod(startISO: string, endISO: string): Promise<DemoMeeting[]> {
  const rows = await searchAll(
    "/crm/v3/objects/meetings/search",
    {
      filterGroups: [
        {
          filters: [
            { propertyName: "hs_meeting_start_time", operator: "GTE", value: startISO },
            { propertyName: "hs_meeting_start_time", operator: "LTE", value: endISO },
            { propertyName: "hs_meeting_title", operator: "CONTAINS_TOKEN", value: DEMO_TITLE_TOKEN },
          ],
        },
      ],
      properties: ["hs_meeting_title", "hs_meeting_start_time", "hs_meeting_outcome"],
    },
    200,
  );
  return rows.map((r) => ({
    id: r.id,
    title: r.properties.hs_meeting_title ?? "",
    startTime: r.properties.hs_meeting_start_time ?? null,
    outcome: (r.properties.hs_meeting_outcome ?? "").toUpperCase(),
  }));
}

export const PIPELINE_FORMULA_VERSION = "draft-1";

// Definición PENDIENTE de validar con Ventas (cancelación y reprogramación).
// Mientras tanto: una cita cancelada o reprogramada no cuenta como programada
// para ocurrir (la nueva reserva cuenta cuando ocurra); un no-show SÍ queda en
// el denominador. Cambiar esto es cambiar esta constante, no el cálculo.
export const SHOW_RATE_EXCLUDED_OUTCOMES: readonly string[] = ["CANCELED", "RESCHEDULED"];

export type RateDetail = { numerator: number; denominator: number };

export interface PipelineMetrics {
  leadsByChannel: Record<string, number>;
  // null = sin muestra (denominador 0). Nunca 0% por falta de datos.
  showRate: number | null;
  showRateDetail: RateDetail;
  closeRate: number | null;
  closeRateDetail: RateDetail;
  avgSalesCycleDays: number;
  period: { start: string; end: string };
  formulaVersion: string;
  // Hasta que Ventas confirme definiciones y metas, el número es informativo.
  definitionStatus: "pending_validation";
}

export function rate(numerator: number, denominator: number): number | null {
  return denominator > 0 ? (numerator / denominator) * 100 : null;
}

function isCanceledMeeting(m: DemoMeeting): boolean {
  return m.outcome === "CANCELED" || /^\s*cancelad/i.test(m.title);
}

// Puro: recibe datos ya traídos y devuelve las métricas del período.
//   show rate  = demos realizadas / demos programadas para ocurrir en el período
//   cierre     = ventas ganadas con fecha de cierre en el período / demos realizadas
//                (cálculo operativo mensual, NO una conversión de cohorte)
export function calculatePipelineMetrics(input: {
  leads: Array<Record<string, string>>;
  wonDealsInPeriod: Array<Record<string, string>>;
  demoMeetings: DemoMeeting[];
  period: { start: string; end: string };
}): PipelineMetrics {
  const { leads, wonDealsInPeriod, demoMeetings, period } = input;

  const leadsByChannel: Record<string, number> = {};
  for (const lead of leads) {
    const source = lead.hs_analytics_source || "Unknown";
    leadsByChannel[source] = (leadsByChannel[source] || 0) + 1;
  }

  const scheduled = demoMeetings.filter(
    (m) => !isCanceledMeeting(m) && !SHOW_RATE_EXCLUDED_OUTCOMES.includes(m.outcome),
  );
  const completed = scheduled.filter((m) => m.outcome === "COMPLETED");
  const showRateDetail = { numerator: completed.length, denominator: scheduled.length };

  // Demos realizadas del mes (todas las completadas, incluso si la cita fue
  // reprogramada antes): es el denominador del cierre operativo.
  const demosDone = demoMeetings.filter((m) => m.outcome === "COMPLETED").length;
  const closeRateDetail = { numerator: wonDealsInPeriod.length, denominator: demosDone };

  const cycleDays = wonDealsInPeriod
    .filter((d) => d.closedate && d.createdate)
    .map((d) => (new Date(d.closedate).getTime() - new Date(d.createdate).getTime()) / 86_400_000);
  const avgSalesCycleDays = cycleDays.length > 0 ? cycleDays.reduce((a, b) => a + b, 0) / cycleDays.length : 0;

  return {
    leadsByChannel,
    showRate: rate(showRateDetail.numerator, showRateDetail.denominator),
    showRateDetail,
    closeRate: rate(closeRateDetail.numerator, closeRateDetail.denominator),
    closeRateDetail,
    avgSalesCycleDays,
    period,
    formulaVersion: PIPELINE_FORMULA_VERSION,
    definitionStatus: "pending_validation",
  };
}
