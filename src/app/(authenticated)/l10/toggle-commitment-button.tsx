"use client";

import { useRouter } from "next/navigation";

// Marcar/desmarcar es una acción explícita de una persona: el servidor traduce
// done → status ("done" / "open"). Cerrar la reunión nunca llama a esto.
export function ToggleCommitmentButton({ commitmentId, done, pending = false }: { commitmentId: string; done: boolean; pending?: boolean }) {
  const router = useRouter();

  async function toggle() {
    await fetch("/api/l10/commitments", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ commitmentId, done: !done }),
    });
    router.refresh();
  }

  return (
    <button
      onClick={toggle}
      title={done ? "Hecho" : pending ? "Pendiente (sigue abierto)" : "Marcar como hecho"}
      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 transition-colors ${done ? "border-emerald-500 bg-emerald-500 text-white" : pending ? "border-amber-400 hover:border-mawi-400" : "border-gray-300 hover:border-mawi-400"}`}
    >
      {done && <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
    </button>
  );
}
