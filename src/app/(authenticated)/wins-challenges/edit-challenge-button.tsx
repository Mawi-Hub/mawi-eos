"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function EditChallengeButton({
  id,
  currentKeyChallenge,
  currentFollowUpAction,
  currentPriority,
}: {
  id: string;
  currentKeyChallenge: string;
  currentFollowUpAction: string;
  currentPriority: string;
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
      body: JSON.stringify({
        keyChallenge: fd.get("keyChallenge"),
        followUpAction: fd.get("followUpAction"),
        priority: fd.get("priority"),
      }),
    });
    if (res.ok) { setOpen(false); router.refresh(); }
    setLoading(false);
  }

  async function handleDelete() {
    if (!confirm("¿Eliminar este challenge?")) return;
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
          <div className="h-3 w-3 rounded-full bg-amber-500" />
          <h3 className="text-lg font-semibold text-gray-900">Editar Challenge</h3>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">¿Cuál es el challenge?</label>
            <textarea name="keyChallenge" required rows={3} defaultValue={currentKeyChallenge} className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Acción siguiente</label>
            <input name="followUpAction" required type="text" defaultValue={currentFollowUpAction} className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Prioridad</label>
            <select name="priority" defaultValue={currentPriority} className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500">
              <option value="alto">Alto</option>
              <option value="medio">Medio</option>
              <option value="bajo">Bajo</option>
            </select>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={loading} className="flex-1 rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50">
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
