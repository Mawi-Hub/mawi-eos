"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface User { id: string; name: string; }

const NEXT_STATUS: Record<string, string> = {
  identify: "discuss",
  discuss: "solve",
  solve: "resolved",
};

export function ResolveIssueButton({ issueId, currentStatus, users }: { issueId: string; currentStatus: string; users: User[] }) {
  const [resolving, setResolving] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function advanceStatus() {
    setLoading(true);
    const next = NEXT_STATUS[currentStatus];
    if (next === "resolved") {
      setResolving(true);
      setLoading(false);
      return;
    }
    await fetch(`/api/l10/issues`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ issueId, idsStatus: next }),
    });
    router.refresh();
    setLoading(false);
  }

  async function handleResolve(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    await fetch(`/api/l10/issues`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        issueId,
        idsStatus: "resolved",
        resolution: fd.get("resolution"),
        ownerId: fd.get("ownerId"),
        dueDate: fd.get("dueDate"),
      }),
    });
    setResolving(false);
    router.refresh();
    setLoading(false);
  }

  if (resolving) {
    return (
      <form onSubmit={handleResolve} className="mt-2 space-y-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
        <div>
          <label className="block text-xs font-medium text-gray-700">Resolución — qué se decidió</label>
          <input name="resolution" required className="mt-1 block w-full rounded border border-gray-300 px-2 py-1 text-sm" placeholder="Decisión clara..." />
        </div>
        <div className="flex gap-2">
          <div className="flex-1">
            <label className="block text-xs font-medium text-gray-700">Quién</label>
            <select name="ownerId" required className="mt-1 block w-full rounded border border-gray-300 px-2 py-1 text-sm">
              <option value="">Seleccionar...</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
          <div className="flex-1">
            <label className="block text-xs font-medium text-gray-700">Para cuándo</label>
            <input name="dueDate" type="date" required className="mt-1 block w-full rounded border border-gray-300 px-2 py-1 text-sm" />
          </div>
        </div>
        <div className="flex gap-2">
          <button type="submit" disabled={loading} className="rounded bg-emerald-600 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-700">
            {loading ? "..." : "Resolver"}
          </button>
          <button type="button" onClick={() => setResolving(false)} className="text-xs text-gray-500">Cancelar</button>
        </div>
      </form>
    );
  }

  const nextLabel = currentStatus === "identify" ? "Pasar a Discuss" : currentStatus === "discuss" ? "Pasar a Solve" : "Resolver";
  const nextColor = currentStatus === "solve" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-gray-600 hover:bg-gray-700";

  return (
    <button onClick={advanceStatus} disabled={loading} className={`rounded px-2.5 py-1 text-xs font-medium text-white ${nextColor} disabled:opacity-50`}>
      {loading ? "..." : nextLabel}
    </button>
  );
}
