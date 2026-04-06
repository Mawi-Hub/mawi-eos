"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function RockForm({ quarterId }: { quarterId: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const fd = new FormData(e.currentTarget);

    const res = await fetch("/api/rocks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        quarterId,
        title: fd.get("title"),
        description: fd.get("description"),
        deliverable: fd.get("deliverable"),
        doneCriteria: fd.get("doneCriteria"),
      }),
    });

    if (res.ok) {
      setOpen(false);
      router.refresh();
    } else {
      const data = await res.json();
      alert(data.error || "Error creando rock");
    }
    setLoading(false);
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg bg-mawi-800 px-4 py-2 text-sm font-medium text-white hover:bg-mawi-700"
      >
        + Nuevo Rock
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
        <h3 className="mb-4 text-lg font-semibold text-gray-900">Nuevo Rock</h3>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Título corto</label>
            <input name="title" required className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-mawi-600 focus:outline-none focus:ring-1 focus:ring-mawi-600" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Descripción</label>
            <textarea name="description" required rows={3} className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-mawi-600 focus:outline-none focus:ring-1 focus:ring-mawi-600" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Entregable</label>
            <textarea name="deliverable" required rows={2} className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-mawi-600 focus:outline-none focus:ring-1 focus:ring-mawi-600" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Criterio Done/Not Done</label>
            <textarea name="doneCriteria" required rows={2} className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-mawi-600 focus:outline-none focus:ring-1 focus:ring-mawi-600" />
          </div>

          <div className="flex gap-3">
            <button type="submit" disabled={loading} className="flex-1 rounded-lg bg-mawi-800 px-4 py-2 text-sm font-medium text-white hover:bg-mawi-700 disabled:opacity-50">
              {loading ? "Creando..." : "Crear Rock"}
            </button>
            <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
