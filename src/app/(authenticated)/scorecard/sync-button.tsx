"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ScorecardSyncButton({ planId }: { planId: string | null }) {
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const router = useRouter();

  async function handleSync() {
    if (!planId) {
      setFeedback("Sin plan activo");
      return;
    }
    setLoading(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/sync/plan-kpis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        updated?: number;
        skipped?: number;
        errors?: string[];
        error?: string;
      };
      if (!res.ok) {
        setFeedback(data.error || `Error ${res.status}`);
      } else {
        const parts = [`✓ ${data.updated ?? 0} actualizados`];
        if (data.skipped) parts.push(`${data.skipped} omitidos`);
        if (data.errors && data.errors.length > 0)
          parts.push(`errores: ${data.errors.join(", ")}`);
        setFeedback(parts.join(" · "));
        router.refresh();
      }
    } catch (err) {
      setFeedback((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        onClick={handleSync}
        disabled={loading || !planId}
        className="rounded-md bg-mawi-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-mawi-700 disabled:opacity-50"
      >
        {loading ? "Sincronizando…" : "Sincronizar ChartMogul"}
      </button>
      {feedback && <span className="text-xs text-gray-500">{feedback}</span>}
    </div>
  );
}
