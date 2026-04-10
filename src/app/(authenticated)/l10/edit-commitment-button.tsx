"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface User { id: string; name: string; }

export default function EditCommitmentButton({
  commitmentId,
  currentAction,
  currentOwnerId,
  currentDueDate,
  users,
}: {
  commitmentId: string;
  currentAction: string;
  currentOwnerId: string;
  currentDueDate: string;
  users: User[];
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    const res = await fetch("/api/l10/commitments", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        commitmentId,
        action: fd.get("action"),
        ownerId: fd.get("ownerId"),
        dueDate: fd.get("dueDate"),
      }),
    });
    if (res.ok) { setOpen(false); router.refresh(); }
    setLoading(false);
  }

  async function handleDelete() {
    if (!confirm("¿Eliminar este compromiso?")) return;
    setLoading(true);
    const res = await fetch("/api/l10/commitments", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ commitmentId }),
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
        <h3 className="mb-4 text-lg font-semibold text-gray-900">Editar Compromiso</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Acción</label>
            <input name="action" required defaultValue={currentAction} className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-mawi-600 focus:outline-none focus:ring-1 focus:ring-mawi-600" />
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700">Quién</label>
              <select name="ownerId" required defaultValue={currentOwnerId} className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-mawi-600 focus:outline-none focus:ring-1 focus:ring-mawi-600">
                {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700">Para cuándo</label>
              <input name="dueDate" type="date" required defaultValue={currentDueDate} className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-mawi-600 focus:outline-none focus:ring-1 focus:ring-mawi-600" />
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={loading} className="flex-1 rounded-lg bg-gray-800 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50">
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
