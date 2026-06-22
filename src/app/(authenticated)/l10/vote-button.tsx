"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  issueId: string;
  voted: boolean;
  count: number;
  disabled?: boolean;
}

export function VoteButton({ issueId, voted, count, disabled }: Props) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function toggle() {
    if (disabled) return;
    setLoading(true);
    await fetch("/api/l10/issue-votes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ issueId }),
    });
    router.refresh();
    setLoading(false);
  }

  return (
    <button
      onClick={toggle}
      disabled={loading || disabled}
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium transition ${voted ? "bg-mawi-700 text-white hover:bg-mawi-800" : "border border-gray-200 text-gray-600 hover:bg-gray-50"} ${disabled ? "cursor-not-allowed opacity-50" : ""}`}
      title={disabled ? "Voto cerrado" : voted ? "Quitar voto" : "Votar"}
    >
      <span>▲</span>
      <span>{count}</span>
    </button>
  );
}
