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
