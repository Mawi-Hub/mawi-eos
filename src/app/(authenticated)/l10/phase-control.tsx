"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const PHASES: Array<{ key: string; label: string }> = [
  { key: "preread", label: "Pre-read" },
  { key: "voting", label: "Votación" },
  { key: "ids", label: "IDS" },
  { key: "commitments", label: "Compromisos" },
  { key: "closed", label: "Cerrada" },
];

interface Props {
  meetingId: string;
  currentPhase: string;
  prereadDeadline: string | null;
  canEdit: boolean;
}

export function PhaseControl({ meetingId, currentPhase, prereadDeadline, canEdit }: Props) {
  const [loading, setLoading] = useState(false);
  const [editingDeadline, setEditingDeadline] = useState(false);
  const router = useRouter();

  async function setPhase(phase: string) {
    if (!canEdit) return;
    setLoading(true);
    await fetch("/api/l10/meetings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ meetingId, phase }),
    });
    router.refresh();
    setLoading(false);
  }

  async function saveDeadline(value: string) {
    setLoading(true);
    await fetch("/api/l10/meetings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ meetingId, prereadDeadline: value || null }),
    });
    setEditingDeadline(false);
    router.refresh();
    setLoading(false);
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {PHASES.map((p, idx) => {
          const active = p.key === currentPhase;
          const passed = PHASES.findIndex((x) => x.key === currentPhase) > idx;
          return (
            <button
              key={p.key}
              onClick={() => setPhase(p.key)}
              disabled={!canEdit || loading}
              className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium transition ${
                active
                  ? "bg-mawi-800 text-white"
                  : passed
                    ? "bg-emerald-100 text-emerald-800"
                    : "border border-gray-200 text-gray-500"
              } ${!canEdit ? "cursor-default" : "hover:opacity-80"}`}
            >
              {idx + 1}. {p.label}
            </button>
          );
        })}
      </div>
      {canEdit && (
        <div className="text-xs text-mawi-600">
          {editingDeadline ? (
            <input
              type="datetime-local"
              defaultValue={prereadDeadline ? prereadDeadline.slice(0, 16) : ""}
              autoFocus
              onBlur={(e) => saveDeadline(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveDeadline((e.target as HTMLInputElement).value);
                if (e.key === "Escape") setEditingDeadline(false);
              }}
              className="rounded border border-gray-300 px-2 py-0.5 text-xs"
            />
          ) : (
            <button onClick={() => setEditingDeadline(true)} className="text-mawi-700 hover:underline">
              {prereadDeadline
                ? `Deadline pre-read: ${new Date(prereadDeadline).toLocaleString("es", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} — editar`
                : "+ Configurar deadline de pre-read"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
