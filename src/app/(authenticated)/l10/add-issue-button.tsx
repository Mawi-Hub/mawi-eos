"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface User { id: string; name: string; }
interface RockOption { id: string; title: string; }
interface MetricOption { id: string; name: string; }

interface Props {
  meetingId: string;
  users: User[];
  rocks: RockOption[];
  metrics: MetricOption[];
  remaining: number;
}

export function AddIssueButton({ meetingId, rocks, metrics, remaining }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [linkKind, setLinkKind] = useState<"rock" | "metric">("rock");
  const [linkId, setLinkId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!linkId) {
      setError("Vincula a un Rock o métrica");
      return;
    }
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    const res = await fetch("/api/l10/issues", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        meetingId,
        title: fd.get("title"),
        description: fd.get("description"),
        priority: fd.get("priority"),
        linkedRockId: linkKind === "rock" ? linkId : undefined,
        linkedMetricId: linkKind === "metric" ? linkId : undefined,
      }),
    });
    if (res.ok) {
      setOpen(false);
      setLinkId("");
      router.refresh();
    } else {
      const body = await res.json().catch(() => ({}));
      setError(body.error || "Error al crear issue");
    }
    setLoading(false);
  }

  const disabled = remaining <= 0;

  if (!open) {
    return (
      <button
        onClick={() => !disabled && setOpen(true)}
        disabled={disabled}
        className={`rounded px-3 py-1 text-xs font-medium ${disabled ? "bg-gray-100 text-gray-400" : "bg-mawi-800 text-white hover:bg-mawi-700"}`}
        title={disabled ? "Llegaste al máximo de 3 issues" : "Agregar issue"}
      >
        + Issue ({remaining}/3 disponibles)
      </button>
    );
  }

  const linkOptions = linkKind === "rock" ? rocks.map((r) => ({ id: r.id, label: r.title })) : metrics.map((m) => ({ id: m.id, label: m.name }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <h3 className="mb-4 text-lg font-semibold text-gray-900">Nuevo Issue</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">¿Cuál es el problema?</label>
            <input name="title" required className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-mawi-600 focus:outline-none focus:ring-1 focus:ring-mawi-600" placeholder="Problema real, no síntoma..." />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Contexto (opcional)</label>
            <textarea name="description" rows={2} className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-mawi-600 focus:outline-none focus:ring-1 focus:ring-mawi-600" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Vincular a</label>
            <div className="mt-1 flex gap-2">
              <button type="button" onClick={() => { setLinkKind("rock"); setLinkId(""); }} className={`flex-1 rounded-lg border px-3 py-2 text-xs font-medium ${linkKind === "rock" ? "border-mawi-600 bg-mawi-50 text-mawi-800" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}>Rock</button>
              <button type="button" onClick={() => { setLinkKind("metric"); setLinkId(""); }} className={`flex-1 rounded-lg border px-3 py-2 text-xs font-medium ${linkKind === "metric" ? "border-mawi-600 bg-mawi-50 text-mawi-800" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}>Métrica</button>
            </div>
            <select value={linkId} onChange={(e) => setLinkId(e.target.value)} required className="mt-2 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-mawi-600 focus:outline-none focus:ring-1 focus:ring-mawi-600">
              <option value="">— Seleccionar {linkKind === "rock" ? "Rock" : "métrica"} —</option>
              {linkOptions.map((o) => (
                <option key={o.id} value={o.id}>{o.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Prioridad</label>
            <select name="priority" defaultValue="medio" className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-mawi-600 focus:outline-none focus:ring-1 focus:ring-mawi-600">
              <option value="alto">Alto</option>
              <option value="medio">Medio</option>
              <option value="bajo">Bajo</option>
            </select>
          </div>

          {error && <p className="rounded bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}

          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={loading} className="flex-1 rounded-lg bg-mawi-800 px-4 py-2 text-sm font-medium text-white hover:bg-mawi-700 disabled:opacity-50">
              {loading ? "..." : "Agregar Issue"}
            </button>
            <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Cancelar</button>
          </div>
        </form>
      </div>
    </div>
  );
}
