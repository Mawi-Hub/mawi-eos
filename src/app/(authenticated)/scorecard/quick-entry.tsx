"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Carga rápida en la misma fila: número + Enter. Para estados especiales
// (pendiente, sin muestra, nota) está el formulario completo al lado.
export function QuickEntry({ metricId, quarterId, unit, placeholder }: { metricId: string; quarterId: string; unit: string | null; placeholder: string }) {
  const [value, setValue] = useState("");
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function save() {
    const n = Number(value.replace(",", "."));
    if (value.trim() === "" || !Number.isFinite(n)) return;
    setState("saving");
    setError(null);
    const res = await fetch("/api/scorecard", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ metricId, quarterId, actualValue: n, actualDisplay: null, notes: null }),
    });
    if (res.ok) {
      setValue("");
      setState("saved");
      router.refresh();
      setTimeout(() => setState("idle"), 1500);
    } else {
      const j = await res.json().catch(() => null);
      setError(j?.error ?? "No se pudo guardar");
      setState("error");
    }
  }

  return (
    <form
      className="flex items-center gap-1"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        inputMode="decimal"
        placeholder={placeholder}
        aria-label="Nuevo valor"
        title={error ?? (unit ? `Valor en ${unit}` : "Valor")}
        className={`w-20 rounded-md border px-2 py-1 text-xs focus:border-mawi-500 focus:outline-none ${state === "error" ? "border-red-300" : "border-gray-200"}`}
      />
      <button
        type="submit"
        disabled={state === "saving" || value.trim() === ""}
        className="rounded-md bg-mawi-700 px-2 py-1 text-xs font-medium text-white hover:bg-mawi-800 disabled:opacity-40"
      >
        {state === "saving" ? "…" : state === "saved" ? "✓" : "Guardar"}
      </button>
    </form>
  );
}
