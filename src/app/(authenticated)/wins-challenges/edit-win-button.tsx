"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function EditWinButton({
  id,
  currentWins,
  currentResult,
}: {
  id: string;
  currentWins: string;
  currentResult: string;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    const res = await fetch(`/api/wins-challenges/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ wins: fd.get("wins"), result: fd.get("result") }),
    });
    if (res.ok) { setOpen(false); router.refresh(); }
    setLoading(false);
  }

  async function handleDelete() {
    if (!confirm("¿Eliminar este win?")) return;
    setLoading(true);
    const res = await fetch(`/api/wins-challenges/${id}`, { method: "DELETE" });
    if (res.ok) { setOpen(false); router.refresh(); }
    setLoading(false);
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="text-xs text-gray-400 hover:text-gray-700">
        Editar
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
      <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center gap-3">
          <div className="h-3 w-3 rounded-full bg-emerald-500" />
          <h3 className="text-lg font-semibold text-gray-900">Editar Win</h3>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">¿Qué hiciste?</label>
            <textarea name="wins" required rows={3} defaultValue={currentWins} className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Resultado medible</label>
            <textarea name="result" required rows={2} defaultValue={currentResult} className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500" />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={loading} className="flex-1 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
              {loading ? "Guardando..." : "Guardar"}
            </button>
            <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
              Cancelar
            </button>
            <button type="button" onClick={handleDelete} disabled={loading} className="rounded-lg border border-red-300 px-4 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50">
              Eliminar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
