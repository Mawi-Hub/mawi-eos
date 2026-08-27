"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Los pasos de la reunión de 60 minutos. El campo `phase` ya existía en el
// modelo pero nada lo mostraba: sin esto el facilitador no tiene forma de saber
// —ni de indicarle al equipo— en qué momento de la agenda va.
const PHASES = [
  { key: "preread", label: "Pre-read", minutes: "antes" },
  { key: "voting", label: "Votación", minutes: "0–5" },
  { key: "ids", label: "IDS", minutes: "5–55" },
  { key: "commitments", label: "Compromisos", minutes: "55–60" },
] as const;

export function PhaseStepper({
  meetingId,
  currentPhase,
  canManage,
}: {
  meetingId: string;
  currentPhase: string;
  canManage: boolean;
}) {
  const [loading, setLoading] = useState<string | null>(null);
  const router = useRouter();

  const currentIndex = PHASES.findIndex((p) => p.key === currentPhase);

  async function goTo(phase: string) {
    setLoading(phase);
    await fetch("/api/l10/meetings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ meetingId, phase }),
    });
    router.refresh();
    setLoading(null);
  }

  const next = currentIndex >= 0 && currentIndex < PHASES.length - 1 ? PHASES[currentIndex + 1] : null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3">
      <div className="flex flex-wrap items-center gap-1.5">
        {PHASES.map((phase, i) => {
          const done = currentIndex > i;
          const active = currentIndex === i;
          const base = "rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors";
          const style = active
            ? "bg-mawi-800 text-white"
            : done
              ? "bg-emerald-100 text-emerald-700"
              : "bg-gray-100 text-gray-500";

          return (
            <span key={phase.key} className="flex items-center gap-1.5">
              {canManage ? (
                <button
                  onClick={() => goTo(phase.key)}
                  disabled={loading !== null}
                  className={`${base} ${style} hover:opacity-80 disabled:opacity-50`}
                  title={`Ir a ${phase.label}`}
                >
                  {done ? "✓ " : ""}
                  {phase.label}
                  <span className="ml-1 opacity-60">{phase.minutes}</span>
                </button>
              ) : (
                <span className={`${base} ${style}`}>
                  {done ? "✓ " : ""}
                  {phase.label}
                  <span className="ml-1 opacity-60">{phase.minutes}</span>
                </span>
              )}
              {i < PHASES.length - 1 && <span className="text-gray-300">→</span>}
            </span>
          );
        })}
      </div>

      {canManage && next && (
        <button
          onClick={() => goTo(next.key)}
          disabled={loading !== null}
          className="rounded-lg bg-mawi-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-mawi-700 disabled:opacity-50"
        >
          {loading ? "..." : `Siguiente: ${next.label} →`}
        </button>
      )}
    </div>
  );
}
