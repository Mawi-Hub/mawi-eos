"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Source = "chartmogul" | "hubspot" | "posthog" | "chat" | "manual";

const ROUTE_BY_SOURCE: Partial<Record<Source, string>> = {
  chartmogul: "/api/sync/plan-kpis",
};

export function ScorecardSyncButton({
  dataSource,
  planId,
}: {
  dataSource: Source;
  planId: string | null;
}) {
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const router = useRouter();

  const route = ROUTE_BY_SOURCE[dataSource];
  const wired = Boolean(route) && Boolean(planId);

  async function handleSync() {
    if (!wired || !route) return;
    setLoading(true);
    setFeedback(null);
    try {
      const res = await fetch(route, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        updated?: number;
        errors?: string[];
        error?: string;
      };
      if (!res.ok) {
        setFeedback(data.error || `Error ${res.status}`);
      } else {
        setFeedback(`✓ ${data.updated ?? 0} actualizado${(data.updated ?? 0) === 1 ? "" : "s"}`);
        router.refresh();
      }
    } catch (err) {
      setFeedback((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  if (!wired) {
    return (
      <span
        className="inline-flex cursor-not-allowed items-center rounded-md bg-gray-50 px-3 py-1 text-xs text-gray-400"
        title="Auto-sync pendiente para esta fuente"
      >
        Sincronizar
      </span>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={handleSync}
        disabled={loading}
        className="rounded-md bg-mawi-50 px-3 py-1 text-xs font-medium text-mawi-700 hover:bg-mawi-100 disabled:opacity-50"
      >
        {loading ? "Sincronizando…" : "Sincronizar"}
      </button>
      {feedback && <span className="text-[11px] text-gray-500">{feedback}</span>}
    </div>
  );
}
