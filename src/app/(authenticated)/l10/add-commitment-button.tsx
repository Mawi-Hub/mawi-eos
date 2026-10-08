"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface User { id: string; name: string; }

export function AddCommitmentButton({ meetingId, users }: { meetingId: string; users: User[] }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    const res = await fetch("/api/l10/commitments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        meetingId,
        ownerId: fd.get("ownerId"),
        action: fd.get("action"),
        dueDate: fd.get("dueDate"),
        nextStep: fd.get("nextStep") || null,
        // "Propuesto" = aún no aceptado por el responsable.
        accepted: fd.get("proposed") !== "on",
        shareable: fd.get("shareable") === "on",
      }),
    });
    if (res.ok) {
      setOpen(false);
      router.refresh();
    } else {
      const body = await res.json().catch(() => ({}));
      setError(body.error || "No se pudo crear el compromiso");
    }
    setLoading(false);
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="rounded bg-gray-800 px-3 py-1 text-xs font-medium text-white hover:bg-gray-700">
        + Compromiso
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <h3 className="mb-4 text-lg font-semibold text-gray-900">Nuevo Compromiso</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Acción</label>
            <input name="action" required className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-mawi-600 focus:outline-none focus:ring-1 focus:ring-mawi-600" placeholder="Ej: Nuevo flujo de confirmación de demos listo" />
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700">Quién</label>
              <select name="ownerId" required className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-mawi-600 focus:outline-none focus:ring-1 focus:ring-mawi-600">
                <option value="">Seleccionar...</option>
                {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700">Para cuándo</label>
              <input name="dueDate" type="date" required className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-mawi-600 focus:outline-none focus:ring-1 focus:ring-mawi-600" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Próximo paso (opcional)</label>
            <input name="nextStep" maxLength={300} className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-mawi-600 focus:outline-none focus:ring-1 focus:ring-mawi-600" />
          </div>
          <div className="space-y-2 rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">
            <label className="flex items-start gap-2">
              <input type="checkbox" name="proposed" className="mt-0.5" />
              Propuesto: aún no aceptado por el responsable
            </label>
            <label className="flex items-start gap-2">
              <input type="checkbox" name="shareable" className="mt-0.5" />
              <span>
                Compartir con la empresa
                <span className="block text-[11px] text-gray-500">La empresa verá el texto de la acción tal cual. Nada sensible.</span>
              </span>
            </label>
          </div>
          {error && <p className="rounded bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={loading} className="flex-1 rounded-lg bg-gray-800 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50">
              {loading ? "..." : "Agregar Compromiso"}
            </button>
            <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Cancelar</button>
          </div>
        </form>
      </div>
    </div>
  );
}
