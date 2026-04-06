"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function CreateMeetingButton({ quarterId }: { quarterId: string }) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleCreate() {
    setLoading(true);
    const res = await fetch("/api/l10/meetings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quarterId }),
    });
    if (res.ok) router.refresh();
    setLoading(false);
  }

  return (
    <button
      onClick={handleCreate}
      disabled={loading}
      className="rounded-lg bg-mawi-800 px-4 py-2 text-sm font-medium text-white hover:bg-mawi-700 disabled:opacity-50"
    >
      {loading ? "Creando..." : "+ Nueva Reunión L10"}
    </button>
  );
}
