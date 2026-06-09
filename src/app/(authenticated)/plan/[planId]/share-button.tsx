"use client";

import { useState } from "react";

export function PlanShareButton({ planId }: { planId: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    const url = `${window.location.origin}/share/plan/${planId}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copiá este link:", url);
    }
  }

  return (
    <button
      onClick={handleCopy}
      className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
      title="Copia un link público al portapapeles para compartir con el equipo"
    >
      {copied ? (
        <>
          <span aria-hidden>✓</span>
          <span>Link copiado</span>
        </>
      ) : (
        <>
          <span aria-hidden>🔗</span>
          <span>Copiar link público</span>
        </>
      )}
    </button>
  );
}
