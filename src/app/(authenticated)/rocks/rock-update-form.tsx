"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function RockUpdateForm({
  rockId,
  currentProgress,
  currentStatus,
  currentRisk,
}: {
  rockId: string;
  currentProgress: number;
  currentStatus: string;
  currentRisk: string;
}) {
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const fd = new FormData(e.currentTarget);

    const res = await fetch(`/api/rocks/${rockId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        progress: parseInt(fd.get("progress") as string),
        status: fd.get("status"),
        risk: fd.get("risk"),
      }),
    });

    if (res.ok) {
      setEditing(false);
      router.refresh();
    }
    setLoading(false);
  }

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="text-xs font-medium text-mawi-600 hover:text-mawi-800"
      >
        Actualizar progreso
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="flex gap-3">
        <div className="flex-1">
          <label className="block text-xs font-medium text-gray-600">% Avance</label>
          <input name="progress" type="number" min="0" max="100" defaultValue={currentProgress} className="mt-1 block w-full rounded border border-gray-300 px-2 py-1 text-sm focus:border-mawi-600 focus:outline-none" />
        </div>
        <div className="flex-1">
          <label className="block text-xs font-medium text-gray-600">Estado</label>
          <select name="status" defaultValue={currentStatus} className="mt-1 block w-full rounded border border-gray-300 px-2 py-1 text-sm focus:border-mawi-600 focus:outline-none">
            <option value="on_track">On Track</option>
            <option value="off_track">Off Track</option>
            <option value="riesgo">Riesgo</option>
          </select>
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600">Riesgo principal</label>
        <input name="risk" type="text" defaultValue={currentRisk} className="mt-1 block w-full rounded border border-gray-300 px-2 py-1 text-sm focus:border-mawi-600 focus:outline-none" />
      </div>
      <div className="flex gap-2">
        <button type="submit" disabled={loading} className="rounded bg-mawi-800 px-3 py-1 text-xs font-medium text-white hover:bg-mawi-700 disabled:opacity-50">
          {loading ? "..." : "Guardar"}
        </button>
        <button type="button" onClick={() => setEditing(false)} className="text-xs text-gray-500 hover:text-gray-700">
          Cancelar
        </button>
      </div>
    </form>
  );
}
