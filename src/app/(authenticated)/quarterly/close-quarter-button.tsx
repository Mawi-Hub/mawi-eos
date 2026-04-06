"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function CloseQuarterButton({
  quarterId,
  year,
  quarter,
}: {
  quarterId: string;
  year: number;
  quarter: number;
}) {
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const router = useRouter();

  async function handleClose() {
    setLoading(true);
    const res = await fetch("/api/quarterly/transition", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quarterId }),
    });

    if (res.ok) {
      setConfirming(false);
      router.refresh();
    } else {
      const data = await res.json();
      alert(data.error || "Error cerrando trimestre");
    }
    setLoading(false);
  }

  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        className="rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
      >
        Cerrar Trimestre
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <h3 className="text-lg font-semibold text-gray-900">
          Cerrar Q{quarter} {year}
        </h3>
        <p className="mt-2 text-sm text-gray-600">
          Esto va a:
        </p>
        <ul className="mt-2 space-y-1 text-sm text-gray-600">
          <li>- Marcar este trimestre como cerrado</li>
          <li>- Crear el siguiente trimestre (Q{quarter === 4 ? 1 : quarter + 1} {quarter === 4 ? year + 1 : year})</li>
          <li>- Los rocks que no estén marcados como Done quedarán como Not Done</li>
        </ul>

        <div className="mt-6 flex gap-3">
          <button
            onClick={handleClose}
            disabled={loading}
            className="flex-1 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            {loading ? "Cerrando..." : "Confirmar Cierre"}
          </button>
          <button
            onClick={() => setConfirming(false)}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
