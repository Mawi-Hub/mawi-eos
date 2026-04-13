"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";

interface AccountabilityRoleData {
  id: string;
  userId: string;
  title: string;
  responsibilities: string[];
  decidesAlone: string[];
  requiresApproval: string[];
  keyMetrics: string[];
  sortOrder: number;
}

export function EditRoleForm({ role }: { role: AccountabilityRoleData }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [title, setTitle] = useState(role.title);
  const [responsibilities, setResponsibilities] = useState(role.responsibilities.join("\n"));
  const [decidesAlone, setDecidesAlone] = useState(role.decidesAlone.join("\n"));
  const [requiresApproval, setRequiresApproval] = useState(role.requiresApproval.join("\n"));
  const [keyMetrics, setKeyMetrics] = useState(role.keyMetrics.join("\n"));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const toArray = (text: string) =>
      text.split("\n").map((s) => s.trim()).filter(Boolean);

    await fetch("/api/accountability-chart", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: role.userId,
        title,
        responsibilities: toArray(responsibilities),
        decidesAlone: toArray(decidesAlone),
        requiresApproval: toArray(requiresApproval),
        keyMetrics: toArray(keyMetrics),
        sortOrder: role.sortOrder,
      }),
    });

    setLoading(false);
    setOpen(false);
    router.refresh();
  };

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="text-gray-400 hover:text-mawi-600">
        <Pencil className="h-4 w-4" />
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-lg bg-white p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Editar Rol</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Título del puesto</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-mawi-500 focus:outline-none focus:ring-1 focus:ring-mawi-500"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Responsabilidades (una por línea)</label>
            <textarea
              value={responsibilities}
              onChange={(e) => setResponsibilities(e.target.value)}
              rows={6}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-mawi-500 focus:outline-none focus:ring-1 focus:ring-mawi-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Decide sin escalar (una por línea)</label>
            <textarea
              value={decidesAlone}
              onChange={(e) => setDecidesAlone(e.target.value)}
              rows={4}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-mawi-500 focus:outline-none focus:ring-1 focus:ring-mawi-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Escala o consulta antes (una por línea)</label>
            <textarea
              value={requiresApproval}
              onChange={(e) => setRequiresApproval(e.target.value)}
              rows={4}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-mawi-500 focus:outline-none focus:ring-1 focus:ring-mawi-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Métricas clave (una por línea)</label>
            <textarea
              value={keyMetrics}
              onChange={(e) => setKeyMetrics(e.target.value)}
              rows={4}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-mawi-500 focus:outline-none focus:ring-1 focus:ring-mawi-500"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="rounded-md bg-mawi-800 px-4 py-2 text-sm font-medium text-white hover:bg-mawi-700 disabled:opacity-50"
            >
              {loading ? "Guardando..." : "Guardar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
