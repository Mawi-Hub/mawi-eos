"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function StartMeetingButton({ meetingId }: { meetingId: string }) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function start() {
    if (!confirm("¿Empezar la reunión?")) return;
    setLoading(true);
    await fetch("/api/l10/meetings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ meetingId, status: "in_progress" }),
    });
    router.refresh();
    setLoading(false);
  }

  return (
    <button
      onClick={start}
      disabled={loading}
      className="rounded-lg bg-mawi-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-mawi-700 disabled:opacity-50"
    >
      {loading ? "..." : "Empezar reunión"}
    </button>
  );
}
