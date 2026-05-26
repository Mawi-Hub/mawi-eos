"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Entry = { period: string; projected: number; actual: number | null };

export function PlanEntryForm({
  planId,
  kpiId,
  unit,
  entries,
}: {
  planId: string;
  kpiId: string;
  unit: string;
  entries: Entry[];
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState(entries[0]?.period ?? "");
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const form = new FormData(e.currentTarget);
    const rawActual = form.get("actual") as string;
    const note = form.get("note") as string;

    let actualValue: number | null = null;
    if (rawActual !== "") {
      const parsed = parseFloat(rawActual);
      if (Number.isNaN(parsed)) {
        setError("Valor inválido");
        setLoading(false);
        return;
      }
      actualValue = unit === "PCT" && parsed > 1 ? parsed / 100 : parsed;
    }

    const res = await fetch(`/api/plan/${planId}/kpis/${kpiId}/entry`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        period,
        actual: actualValue,
        note: note || undefined,
      }),
    });

    if (!res.ok) {
      const j = await res.json().catch(() => ({ error: "Error" }));
      setError(j.error ?? "Error guardando");
      setLoading(false);
      return;
    }

    setLoading(false);
    router.refresh();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-wrap items-end gap-3 rounded-lg border border-gray-200 bg-gray-50 p-4"
    >
      <div>
        <label className="block text-xs font-medium text-gray-700">Mes</label>
        <select
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          className="mt-1 rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-mawi-600 focus:outline-none"
        >
          {entries.map((e) => (
            <option key={e.period} value={e.period}>
              {new Date(e.period).toLocaleDateString("es", { month: "short", year: "numeric" })}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-700">
          Valor real {unit === "PCT" ? "(% o decimal)" : `(${unit})`}
        </label>
        <input
          name="actual"
          type="number"
          step="any"
          required
          className="mt-1 w-40 rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-mawi-600 focus:outline-none"
        />
      </div>

      <div className="flex-1 min-w-40">
        <label className="block text-xs font-medium text-gray-700">Nota</label>
        <input
          name="note"
          type="text"
          placeholder="ChartMogul Jul 31"
          className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-mawi-600 focus:outline-none"
        />
      </div>

      <button
        type="submit"
        disabled={loading || !period}
        className="rounded-md bg-mawi-800 px-4 py-1.5 text-sm font-medium text-white hover:bg-mawi-700 disabled:opacity-50"
      >
        {loading ? "Guardando…" : "Guardar"}
      </button>

      {error && <div className="w-full text-xs text-red-600">{error}</div>}
    </form>
  );
}
