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
    customerCount: e["customer-count"] as number,
  }));
}

export function computeMonthlyNDR(entries: MRRBreakdown[]): { date: string; ndr: number | null }[] {
  return entries.map((e, i) => {
    if (i === 0) return { date: e.date, ndr: null };
    const prev = entries[i - 1];
    if (prev.mrr === 0) return { date: e.date, ndr: null };
    const ndr = (prev.mrr + e.mrrExpansion - e.mrrChurn - e.mrrContraction) / prev.mrr;
    return { date: e.date, ndr };
  });
}
