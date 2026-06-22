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
  canEdit: boolean;
}

export function PhaseControl({ meetingId, currentPhase, canEdit }: Props) {
  const [loading, setLoading] = useState(false);
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

  return (
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
  );
}
