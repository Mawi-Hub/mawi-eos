"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface IssueOption { id: string; title: string; }
interface ExistingCoverage {
  id: string;
  coverageType: string;
  issueId: string | null;
  note: string | null;
}

interface Props {
  meetingId: string;
  sourceType: "metric" | "rock";
  sourceId: string;
  sourceLabel: string;
  issues: IssueOption[];
  existing: ExistingCoverage | null;
}

export function SetCoverageButton({ meetingId, sourceType, sourceId, sourceLabel, issues, existing }: Props) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"linked_issue" | "no_action_note">(
    existing?.coverageType === "no_action_note" ? "no_action_note" : "linked_issue",
  );
  const [issueId, setIssueId] = useState(existing?.issueId || "");
  const [note, setNote] = useState(existing?.note || "");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const res = await fetch("/api/l10/coverages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        meetingId,
        sourceType,
        sourceId,
        coverageType: mode,
        issueId: mode === "linked_issue" ? issueId : undefined,
        note: mode === "no_action_note" ? note : undefined,
      }),
    });
    if (res.ok) {
      setOpen(false);
      router.refresh();
    }
    setLoading(false);
  }

  async function handleRemove() {
    if (!existing) return;
    if (!confirm("Quitar cobertura?")) return;
    setLoading(true);
    await fetch("/api/l10/coverages", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ coverageId: existing.id }),
    });
    setOpen(false);
    router.refresh();
    setLoading(false);
  }

  const labelText = existing ? "Editar cobertura" : "Amarrar";
  const labelClass = existing
    ? "rounded border border-gray-200 px-2 py-0.5 text-[10px] font-medium text-gray-600 hover:bg-gray-50"
    : "rounded bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800 hover:bg-amber-200";

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className={labelClass}>
        {labelText}
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <h3 className="text-lg font-semibold text-gray-900">Cobertura</h3>
        <p className="mt-1 text-xs text-gray-500">{sourceLabel}</p>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setMode("linked_issue")}
              className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${mode === "linked_issue" ? "border-mawi-600 bg-mawi-50 text-mawi-800" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}
            >
              Vincular a Issue
            </button>
            <button
              type="button"
              onClick={() => setMode("no_action_note")}
              className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${mode === "no_action_note" ? "border-mawi-600 bg-mawi-50 text-mawi-800" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}
            >
              No action por...
            </button>
          </div>

          {mode === "linked_issue" ? (
            <div>
              <label className="block text-sm font-medium text-gray-700">Issue</label>
              {issues.length === 0 ? (
                <p className="mt-1 rounded bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  Aún no hay issues en esta reunión. Crea uno primero.
                </p>
              ) : (
                <select
                  value={issueId}
                  onChange={(e) => setIssueId(e.target.value)}
                  required
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-mawi-600 focus:outline-none focus:ring-1 focus:ring-mawi-600"
                >
                  <option value="">— Seleccionar issue —</option>
                  {issues.map((iss) => (
                    <option key={iss.id} value={iss.id}>{iss.title}</option>
                  ))}
                </select>
              )}
            </div>
          ) : (
            <div>
              <label className="block text-sm font-medium text-gray-700">Justificación</label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                required
                rows={3}
                placeholder="Ej: ya hay plan en curso, recovery esperado en 2 semanas"
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-mawi-600 focus:outline-none focus:ring-1 focus:ring-mawi-600"
              />
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={loading || (mode === "linked_issue" && (issues.length === 0 || !issueId))} className="flex-1 rounded-lg bg-mawi-800 px-4 py-2 text-sm font-medium text-white hover:bg-mawi-700 disabled:opacity-50">
              {loading ? "..." : "Guardar"}
            </button>
            {existing && (
              <button type="button" onClick={handleRemove} disabled={loading} className="rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50">
                Quitar
              </button>
            )}
            <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
