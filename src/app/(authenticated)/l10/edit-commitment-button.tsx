"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface User { id: string; name: string; }

export default function EditCommitmentButton({
  commitmentId,
  currentAction,
  currentOwnerId,
  currentDueDate,
  currentStatus = "open",
  currentNextStep = "",
  currentAccepted = true,
  currentShareable = false,
  users,
}: {
  commitmentId: string;
  currentAction: string;
  currentOwnerId: string;
  currentDueDate: string;
  currentStatus?: string;
  currentNextStep?: string;
  currentAccepted?: boolean;
  currentShareable?: boolean;
  users: User[];
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dueDate, setDueDate] = useState(currentDueDate);
  const dateMoved = dueDate !== currentDueDate;
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
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
        // Solo viaja el motivo si la fecha cambió; el servidor lo exige.
        dateChangeReason: dateMoved ? fd.get("dateChangeReason") : undefined,
        status: fd.get("status"),
        nextStep: fd.get("nextStep") || null,
        accepted: fd.get("proposed") !== "on",
        shareable: fd.get("shareable") === "on",
      }),
    });
    if (res.ok) {
      setOpen(false);
      router.refresh();
    } else {
      const body = await res.json().catch(() => ({}));
      setError(body.error || "No se pudo guardar el compromiso");
    }
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
              <input name="dueDate" type="date" required value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-mawi-600 focus:outline-none focus:ring-1 focus:ring-mawi-600" />
            </div>
          </div>
          {dateMoved && (
            <div>
              <label className="block text-sm font-medium text-gray-700">Motivo del cambio de fecha</label>
              <input name="dateChangeReason" required maxLength={300} placeholder="Por qué se mueve (queda en el historial)" className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-mawi-600 focus:outline-none focus:ring-1 focus:ring-mawi-600" />
            </div>
          )}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700">Estado</label>
              <select name="status" defaultValue={currentStatus} className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-mawi-600 focus:outline-none focus:ring-1 focus:ring-mawi-600">
                <option value="open">Abierto</option>
                <option value="pending">Pendiente (sigue abierto, con motivo)</option>
                <option value="done">Hecho</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Próximo paso</label>
            <input name="nextStep" maxLength={300} defaultValue={currentNextStep} className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-mawi-600 focus:outline-none focus:ring-1 focus:ring-mawi-600" />
          </div>
          <div className="space-y-2 rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">
            <label className="flex items-start gap-2">
              <input type="checkbox" name="proposed" defaultChecked={!currentAccepted} className="mt-0.5" />
              Propuesto: aún no aceptado por el responsable
            </label>
            <label className="flex items-start gap-2">
              <input type="checkbox" name="shareable" defaultChecked={currentShareable} className="mt-0.5" />
              <span>
                Compartir con la empresa
                <span className="block text-[11px] text-gray-500">La empresa verá el texto de la acción tal cual. Nada sensible.</span>
              </span>
            </label>
          </div>
          {error && <p className="rounded bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
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
