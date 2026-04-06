const API_BASE = "https://app.posthog.com";

function getHeaders() {
  const key = process.env.POSTHOG_API_KEY;
  if (!key) throw new Error("POSTHOG_API_KEY not set");
  return {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
}

function getProjectId() {
  const id = process.env.POSTHOG_PROJECT_ID;
  if (!id) throw new Error("POSTHOG_PROJECT_ID not set");
  return id;
}

export async function queryHogQL(query: string) {
  const res = await fetch(`${API_BASE}/api/projects/${getProjectId()}/query`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({ query: { kind: "HogQLQuery", query } }),
  });

  if (!res.ok) throw new Error(`PostHog ${res.status}: ${await res.text()}`);
  return res.json();
}

export interface EngagementScoreData {
  companyId: string;
  companyName: string;
  score: number; // 0-4
  sessionsLast14d: number;
  hasActiveBudget: boolean;
  hasExpenseThisWeek: boolean;
  activeUsersCount: number;
  consecutiveLowDays: number;
}

// Product Engagement Score: 0-4 points
// +1 for ≥3 sessions in 14 days
// +1 for ≥1 active budget
// +1 for ≥1 expense this week
// +1 for ≥2 active users
export function calculatePES(data: {
  sessions14d: number;
  hasActiveBudget: boolean;
  hasExpenseThisWeek: boolean;
  activeUsers: number;
}): number {
  let score = 0;
  if (data.sessions14d >= 3) score++;
  if (data.hasActiveBudget) score++;
  if (data.hasExpenseThisWeek) score++;
  if (data.activeUsers >= 2) score++;
  return score;
}
