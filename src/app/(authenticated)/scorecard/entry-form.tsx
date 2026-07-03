"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type EntryPayload = {
  actualValue: number;
  actualDisplay: string | null;
  notes: string | null;
  statusOverride?: string;
};

export function ScorecardEntryForm({
  metricId,
  metricName,
  quarterId,
  unit,
  prompt,
  targetNumeric,
  targetDirection,
}: {
  metricId: string;
  metricName: string;
  quarterId: string;
  unit: string | null;
  prompt?: string | null;
  targetNumeric: number | null;
  targetDirection: string;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notes, setNotes] = useState("");
  const router = useRouter();

  const isBoolean = unit === "boolean";

  async function post(payload: EntryPayload) {
    setLoading(true);
    const res = await fetch("/api/scorecard", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ metricId, quarterId, ...payload }),
    });
    if (res.ok) {
      setOpen(false);
      setNotes("");
      router.refresh();
    }
    setLoading(false);
  }

  // Boolean metrics (e.g. Shipping Cadence) are a simple Sí/No, so we map the
  // answer to a value + display + status directly and skip the numeric form.
  function submitBoolean(done: boolean) {
    void post({
      actualValue: done ? 1 : 0,
      actualDisplay: done ? "Sí" : "No",
      notes: notes.trim() || null,
      statusOverride: done ? "on_track" : "off_track",
    });
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    void post({
      actualValue: parseFloat(formData.get("actualValue") as string),
      actualDisplay: (formData.get("actualDisplay") as string) || null,
      notes: (formData.get("notes") as string) || null,
      statusOverride: (formData.get("statusOverride") as string) || undefined,
    });
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

  if (isBoolean) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
        <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
          <h3 className="text-lg font-semibold text-gray-900">{metricName}</h3>
          <p className="mt-1 text-sm text-gray-500">
            {prompt || "¿Se cumplió esta semana?"}
          </p>

          <div className="mt-5 grid grid-cols-2 gap-3">
            <button
              type="button"
              disabled={loading}
              onClick={() => submitBoolean(true)}
              className="rounded-lg bg-emerald-600 px-4 py-4 text-base font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              ✓ Sí
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={() => submitBoolean(false)}
              className="rounded-lg bg-red-600 px-4 py-4 text-base font-semibold text-white hover:bg-red-700 disabled:opacity-50"
            >
              ✗ No
            </button>
          </div>

          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700">
              Nota (opcional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Ej: se movió el deadline de X por…"
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-mawi-600 focus:outline-none focus:ring-1 focus:ring-mawi-600"
            />
          </div>

          <button
            type="button"
            onClick={() => setOpen(false)}
            disabled={loading}
            className="mt-4 w-full rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Cancelar
          </button>
        </div>
      </div>
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
