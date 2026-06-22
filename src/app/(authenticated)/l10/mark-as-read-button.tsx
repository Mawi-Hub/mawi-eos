"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function MarkAsReadButton({ meetingId, alreadyRead }: { meetingId: string; alreadyRead: boolean }) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function toggle() {
    setLoading(true);
    await fetch("/api/l10/preread-reads", {
      method: alreadyRead ? "DELETE" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ meetingId }),
    });
    router.refresh();
    setLoading(false);
  }

  return (
    <button
      onClick={toggle}
      disabled={loading}
      className={
        alreadyRead
          ? "rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
          : "rounded-full bg-mawi-800 px-3 py-1 text-xs font-medium text-white hover:bg-mawi-700 disabled:opacity-50"
      }
    >
      {loading ? "..." : alreadyRead ? "Leído ✓" : "Marcar leído"}
    </button>
  );
}
