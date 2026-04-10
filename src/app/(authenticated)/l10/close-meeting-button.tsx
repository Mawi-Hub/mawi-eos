"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function CloseMeetingButton({
  meetingId,
  currentNotes,
  isCompleted,
}: {
  meetingId: string;
  currentNotes: string;
  isCompleted: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    const res = await fetch("/api/l10/meetings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        meetingId,
        status: "completed",
        notes: fd.get("notes"),
      }),
    });
    if (res.ok) { setOpen(false); router.refresh(); }
    setLoading(false);
  }

  async function handleReopen() {
    setLoading(true);
    await fetch("/api/l10/meetings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ meetingId, status: "in_progress" }),
    });
    router.refresh();
    setLoading(false);
  }

  if (isCompleted) {
    return (
      <button
        onClick={handleReopen}
        disabled={loading}
        className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
      >
        {loading ? "..." : "Reabrir reunión"}
      </button>
    );
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
      >
        Cerrar reunión
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
      <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
        <h3 className="mb-2 text-lg font-semibold text-gray-900">Cerrar reunión L10</h3>
        <p className="mb-4 text-sm text-gray-500">
          Registra el resumen de lo que se discutió y las decisiones clave.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Resumen y decisiones
            </label>
            <textarea
              name="notes"
              required
              rows={8}
              defaultValue={currentNotes}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              placeholder="- Qué se discutió&#10;- Principales decisiones&#10;- Aprendizajes o bloqueos&#10;- Cualquier contexto relevante"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {loading ? "Cerrando..." : "Cerrar reunión"}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
