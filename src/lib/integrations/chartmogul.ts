const API_BASE = "https://api.chartmogul.com";

function getAuthHeader() {
  const key = process.env.CHARTMOGUL_API_KEY;
  if (!key) throw new Error("CHARTMOGUL_API_KEY not set");
  return "Basic " + Buffer.from(key + ":").toString("base64");
}

async function fetchCM(path: string, params: Record<string, string> = {}) {
  const url = new URL(path, API_BASE);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  const res = await fetch(url.toString(), {
    headers: { Authorization: getAuthHeader() },
  });

  if (!res.ok) throw new Error(`ChartMogul ${res.status}: ${await res.text()}`);
  return res.json();
}

export async function getMRRMetrics(startDate: string, endDate: string) {
  return fetchCM("/v1/metrics/mrr", {
    "start-date": startDate,
    "end-date": endDate,
    interval: "month",
  });
}

export async function getARPA(startDate: string, endDate: string) {
  return fetchCM("/v1/metrics/arpa", {
    "start-date": startDate,
    "end-date": endDate,
    interval: "month",
  });
}

export async function getCustomerChurnRate(startDate: string, endDate: string) {
  return fetchCM("/v1/metrics/customer-churn-rate", {
    "start-date": startDate,
    "end-date": endDate,
    interval: "month",
  });
}

export async function getCustomerCount(startDate: string, endDate: string) {
  return fetchCM("/v1/metrics/customer-count", {
    "start-date": startDate,
    "end-date": endDate,
    interval: "month",
  });
}

// New-business activities (one entry per new subscription). Cursor-paginated,
// unlike the /metrics endpoints — we follow `cursor` while `has_more`. Used to
// count distinct customers that started in a given month ("Nuevos clientes").
export async function getNewBizActivities(startDate: string, endDate: string) {
  const all: Array<Record<string, unknown>> = [];
  let cursor: string | undefined;
  // Safety cap: 50 pages × 200 = 10k activities, well beyond any month's volume.
  for (let i = 0; i < 50; i++) {
    const params: Record<string, string> = {
      "start-date": startDate,
      "end-date": endDate,
      type: "new_biz",
      "per-page": "200",
    };
    if (cursor) params.cursor = cursor;
    const data = (await fetchCM("/v1/activities", params)) as {
      entries?: Array<Record<string, unknown>>;
      has_more?: boolean;
      cursor?: string;
    };
    if (Array.isArray(data.entries)) all.push(...data.entries);
    if (!data.has_more || !data.cursor) break;
    cursor = data.cursor;
  }
  return all;
}

export async function getMRRChurnRate(startDate: string, endDate: string) {
  return fetchCM("/v1/metrics/mrr-churn-rate", {
    "start-date": startDate,
    "end-date": endDate,
    interval: "month",
  });
}

export async function getASPMetric(startDate: string, endDate: string) {
  return fetchCM("/v1/metrics/asp", {
    "start-date": startDate,
    "end-date": endDate,
    interval: "month",
  });
}

export interface MRRBreakdown {
  date: string;
  mrr: number;
  mrrNewBusiness: number;
  mrrExpansion: number;
  mrrContraction: number;
  mrrChurn: number;
  mrrReactivation: number;
}

export function parseMRREntries(data: { entries: Array<Record<string, number | string>> }): MRRBreakdown[] {
  return data.entries.map((e) => ({
    date: e.date as string,
    mrr: (e.mrr as number) / 100,
    mrrNewBusiness: (e["mrr-new-business"] as number) / 100,
    mrrExpansion: (e["mrr-expansion"] as number) / 100,
    mrrContraction: (e["mrr-contraction"] as number) / 100,
    mrrChurn: (e["mrr-churn"] as number) / 100,
    mrrReactivation: (e["mrr-reactivation"] as number) / 100,
  }));
}

export function parseARPAEntries(data: { entries: Array<Record<string, number | string>> }) {
  return data.entries.map((e) => ({
    date: e.date as string,
    arpa: (e.arpa as number) / 100,
  }));
}

export function parseCustomerChurnEntries(
  data: { entries: Array<Record<string, number | string>> }
) {
  return data.entries.map((e) => ({
    date: e.date as string,
    customerChurnRate: (e["customer-churn-rate"] as number) / 100,
  }));
}

export function parseCustomerCountEntries(
  data: { entries: Array<Record<string, number | string>> }
) {
  return data.entries.map((e) => ({
    date: e.date as string,
    // ChartMogul returns this metric under the `customers` key (not
    // `customer-count`, which is only the path segment).
    customerCount: e.customers as number,
  }));
}

// Flattens new_biz activities to (month-anchor date, customer uuid) pairs so the
// caller can count distinct customers per month.
export function parseNewBizCustomers(
  entries: Array<Record<string, unknown>>
): { date: string; customerUuid: string }[] {
  return entries
    .map((e) => ({
      date: e.date as string,
      customerUuid: (e["customer-uuid"] as string) ?? "",
    }))
    .filter((e) => e.date && e.customerUuid);
}

export function parseMRRChurnRateEntries(
  data: { entries: Array<Record<string, number | string>> }
) {
  return data.entries.map((e) => ({
    date: e.date as string,
    mrrChurnRate: (e["mrr-churn-rate"] as number) / 100,
  }));
}

export function parseASPEntries(
  data: { entries: Array<Record<string, number | string>> }
) {
  return data.entries.map((e) => ({
    date: e.date as string,
    asp: (e.asp as number) / 100,
  }));
}

export function computeMonthlyNDR(entries: MRRBreakdown[]): { date: string; ndr: number | null }[] {
  return entries.map((e, i) => {
    if (i === 0) return { date: e.date, ndr: null };
    const prev = entries[i - 1];
    if (prev.mrr === 0) return { date: e.date, ndr: null };
    const expansion = Math.abs(e.mrrExpansion);
    const reactivation = Math.abs(e.mrrReactivation);
    const churn = Math.abs(e.mrrChurn);
    const contraction = Math.abs(e.mrrContraction);
    const ndr = (prev.mrr + expansion + reactivation - churn - contraction) / prev.mrr;
    return { date: e.date, ndr };
  });
}
