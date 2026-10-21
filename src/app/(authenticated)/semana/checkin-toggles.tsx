"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Ocultar o destacar una respuesta para el resumen. No cambia lo que escribió la persona.
export function CheckinToggles({ checkinId, hidden, highlighted }: { checkinId: string; hidden: boolean; highlighted: boolean }) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function patch(data: { hidden?: boolean; highlighted?: boolean }) {
    setLoading(true);
    await fetch(`/api/weekly/checkins/${checkinId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    router.refresh();
    setLoading(false);
  }

  return (
    <div className="flex shrink-0 gap-1.5">
      <button
        onClick={() => patch({ highlighted: !highlighted })}
        disabled={loading || hidden}
        className={`rounded-full px-2.5 py-1 text-xs font-medium transition ${highlighted ? "bg-amber-100 text-amber-800 hover:bg-amber-200" : "border border-gray-200 text-gray-600 hover:bg-gray-50"} disabled:opacity-50`}
        title="Lo destacado va primero en el resumen"
      >
        {highlighted ? "★ Destacado" : "☆ Destacar"}
      </button>
      <button
        onClick={() => patch({ hidden: !hidden })}
        disabled={loading}
        className={`rounded-full px-2.5 py-1 text-xs font-medium transition ${hidden ? "bg-gray-800 text-white hover:bg-gray-700" : "border border-gray-200 text-gray-600 hover:bg-gray-50"} disabled:opacity-50`}
        title="Lo oculto no se publica ni se usa para redactar el resumen"
      >
        {hidden ? "Oculto · mostrar" : "Ocultar"}
      </button>
    </div>
  );
}

export function ManagementToggle({ week, itemKey, hidden }: { week: string; itemKey: string; hidden: boolean }) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function toggle() {
    setLoading(true);
    await fetch("/api/weekly/summary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "hide", week, key: itemKey, hidden: !hidden }),
    });
    router.refresh();
    setLoading(false);
  }

  return (
    <button
      onClick={toggle}
      disabled={loading}
      className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium transition ${hidden ? "bg-gray-800 text-white hover:bg-gray-700" : "border border-gray-200 text-gray-600 hover:bg-gray-50"} disabled:opacity-50`}
    >
      {hidden ? "Oculto · mostrar" : "Ocultar"}
    </button>
  );
}
