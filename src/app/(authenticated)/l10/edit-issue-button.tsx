"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function EditIssueButton({
  issueId,
  currentTitle,
  currentDescription,
  currentPriority,
  currentShareable = false,
  currentSharedSummary = "",
}: {
  issueId: string;
  currentTitle: string;
  currentDescription: string;
  currentPriority: string;
  currentShareable?: boolean;
  currentSharedSummary?: string;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shareable, setShareable] = useState(currentShareable);
  const [sharedSummary, setSharedSummary] = useState(currentSharedSummary);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    const res = await fetch("/api/l10/issues", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        issueId,
        title: fd.get("title"),
        description: fd.get("description"),
        priority: fd.get("priority"),
        shareable,
        sharedSummary: shareable ? sharedSummary : null,
      }),
    });
    if (res.ok) {
      setOpen(false);
      router.refresh();
    } else {
      const body = await res.json().catch(() => ({}));
      setError(body.error || "No se pudo guardar el issue");
    }
    setLoading(false);
  }

  async function handleDelete() {
    if (!confirm("¿Eliminar este issue?")) return;
    setLoading(true);
    const res = await fetch("/api/l10/issues", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ issueId }),
    });
    if (res.ok) { setOpen(false); router.refresh(); }
    setLoading(false);
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="text-[10px] text-gray-400 hover:text-gray-700">
        Editar
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <h3 className="mb-4 text-lg font-semibold text-gray-900">Editar Issue</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Título</label>
            <input name="title" required defaultValue={currentTitle} className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-mawi-600 focus:outline-none focus:ring-1 focus:ring-mawi-600" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Contexto</label>
            <textarea name="description" rows={2} defaultValue={currentDescription} className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-mawi-600 focus:outline-none focus:ring-1 focus:ring-mawi-600" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Prioridad</label>
            <select name="priority" defaultValue={currentPriority} className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-mawi-600 focus:outline-none focus:ring-1 focus:ring-mawi-600">
              <option value="alto">Alto</option>
              <option value="medio">Medio</option>
              <option value="bajo">Bajo</option>
            </select>
          </div>

          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
            <label className="flex items-start gap-2 text-sm font-medium text-gray-700">
              <input type="checkbox" checked={shareable} onChange={(e) => setShareable(e.target.checked)} className="mt-0.5" />
              Compartir resumen con la empresa
            </label>
            {shareable && (
              <div className="mt-2">
                <textarea
                  value={sharedSummary}
                  onChange={(e) => setSharedSummary(e.target.value)}
                  rows={2}
                  maxLength={400}
                  required
                  placeholder="Lo que verá la empresa. El detalle del IDS sigue privado"
                  className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-mawi-600 focus:outline-none focus:ring-1 focus:ring-mawi-600"
                />
                <p className="mt-1 text-[11px] text-gray-500">
                  Lo que verá la empresa. El detalle del IDS sigue privado. Sin salud, compensación, evaluaciones ni temas personales ({sharedSummary.length}/400).
                </p>
              </div>
            )}
          </div>

          {error && <p className="rounded bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={loading} className="flex-1 rounded-lg bg-mawi-800 px-4 py-2 text-sm font-medium text-white hover:bg-mawi-700 disabled:opacity-50">
              {loading ? "..." : "Guardar"}
            </button>
            <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Cancelar</button>
            <button type="button" onClick={handleDelete} disabled={loading} className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50">Eliminar</button>
          </div>
        </form>
      </div>
    </div>
  );
}
