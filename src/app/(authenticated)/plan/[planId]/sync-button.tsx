"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function PlanSyncButton({ planId }: { planId: string }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    updated: number;
    skipped: number;
    errors: string[];
  } | null>(null);
  const router = useRouter();

  async function handleSync() {
    setLoading(true);
    setResult(null);
    const res = await fetch("/api/sync/plan-kpis", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ planId }),
    });
    const data = await res.json();
    setResult(data);
    setLoading(false);
    if (res.ok) router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        onClick={handleSync}
        disabled={loading}
        className="rounded-md bg-mawi-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-mawi-700 disabled:opacity-50"
      >
        {loading ? "Sincronizando…" : "Sync ChartMogul"}
      </button>
      {result && (
        <span className="text-xs text-gray-500">
          {result.updated} actualizados · {result.skipped} omitidos
          {result.errors.length > 0 && ` · errores: ${result.errors.join(", ")}`}
        </span>
      )}
    </div>
  );
}
