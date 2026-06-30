"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function DeleteIssueButton({ issueId }: { issueId: string }) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleDelete() {
    if (!confirm("¿Eliminar este IDS?")) return;
    setLoading(true);
    const res = await fetch("/api/l10/issues", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ issueId }),
    });
    if (res.ok) router.refresh();
    setLoading(false);
  }

  return (
    <button
      onClick={handleDelete}
      disabled={loading}
      className="text-[10px] text-red-500 hover:text-red-700 disabled:opacity-50"
    >
      {loading ? "..." : "Borrar"}
    </button>
  );
}
