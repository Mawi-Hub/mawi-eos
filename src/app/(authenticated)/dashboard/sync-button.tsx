"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function SyncButton() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const router = useRouter();

  async function handleSync() {
    setLoading(true);
    setResult(null);

    const sources = ["chartmogul", "hubspot", "posthog"];
    const results: string[] = [];

    for (const source of sources) {
      try {
        const res = await fetch(`/api/sync/${source}`, { method: "POST" });
        if (res.ok) {
          results.push(`${source}: OK`);
        } else {
          const data = await res.json();
          results.push(`${source}: ${data.error || "Error"}`);
        }
      } catch {
        results.push(`${source}: Sin API key configurada`);
      }
    }

    setResult(results.join(" · "));
    setLoading(false);
    router.refresh();
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={handleSync}
        disabled={loading}
        className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
      >
        {loading ? "Sincronizando..." : "Sincronizar APIs"}
      </button>
      {result && <p className="text-xs text-gray-400">{result}</p>}
    </div>
  );
}
