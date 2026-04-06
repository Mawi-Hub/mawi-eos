"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ScorecardEntryForm({
  metricId,
  metricName,
  quarterId,
  unit,
  targetNumeric,
  targetDirection,
}: {
  metricId: string;
  metricName: string;
  quarterId: string;
  unit: string | null;
  targetNumeric: number | null;
  targetDirection: string;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const formData = new FormData(e.currentTarget);

    const res = await fetch("/api/scorecard", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        metricId,
        quarterId,
        actualValue: parseFloat(formData.get("actualValue") as string),
        actualDisplay: formData.get("actualDisplay") as string,
        notes: formData.get("notes") as string,
        statusOverride: formData.get("statusOverride") as string || undefined,
      }),
    });

    if (res.ok) {
      setOpen(false);
      router.refresh();
    }
    setLoading(false);
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-md bg-mawi-50 px-3 py-1 text-xs font-medium text-mawi-700 hover:bg-mawi-100"
      >
        Actualizar
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <h3 className="mb-4 text-lg font-semibold text-gray-900">
          Actualizar: {metricName}
        </h3>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Valor actual {unit && `(${unit})`}
            </label>
            <input
              name="actualValue"
              type="number"
              step="any"
              required
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-mawi-600 focus:outline-none focus:ring-1 focus:ring-mawi-600"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Valor display (opcional, ej: &quot;5:1&quot;, &quot;$2,000&quot;)
            </label>
            <input
              name="actualDisplay"
              type="text"
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-mawi-600 focus:outline-none focus:ring-1 focus:ring-mawi-600"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Override status (dejar vacío para auto-calcular)
            </label>
            <select
              name="statusOverride"
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-mawi-600 focus:outline-none focus:ring-1 focus:ring-mawi-600"
            >
              <option value="">Auto-calcular</option>
              <option value="on_track">On Track</option>
              <option value="off_track">Off Track</option>
              <option value="riesgo">Riesgo</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Notas</label>
            <textarea
              name="notes"
              rows={2}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-mawi-600 focus:outline-none focus:ring-1 focus:ring-mawi-600"
            />
          </div>

          <div className="flex gap-3">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 rounded-lg bg-mawi-800 px-4 py-2 text-sm font-medium text-white hover:bg-mawi-700 disabled:opacity-50"
            >
              {loading ? "Guardando..." : "Guardar"}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
