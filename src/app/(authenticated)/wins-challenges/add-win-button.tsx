"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AddWinButton({ quarterId }: { quarterId: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const fd = new FormData(e.currentTarget);

    const res = await fetch("/api/wins-challenges", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        quarterId,
        entryType: "win",
        wins: fd.get("wins"),
        result: fd.get("result"),
      }),
    });

    if (res.ok) {
      setOpen(false);
      router.refresh();
    }
    setLoading(false);
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700"
      >
        <span className="text-lg leading-none">+</span>
        Registrar Win
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center gap-3">
              <div className="h-3 w-3 rounded-full bg-emerald-500" />
              <h3 className="text-lg font-semibold text-gray-900">Registrar Win</h3>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  ¿Qué hiciste?
                </label>
                <textarea
                  name="wins"
                  required
                  rows={3}
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  placeholder="Describe la acción o logro..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Resultado medible
                </label>
                <textarea
                  name="result"
                  required
                  rows={2}
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  placeholder="Ej: 5 clientes cerrados, +$400 en upgrades, 30% mejora en retención..."
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  {loading ? "Guardando..." : "Guardar Win"}
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
      )}
    </>
  );
}
