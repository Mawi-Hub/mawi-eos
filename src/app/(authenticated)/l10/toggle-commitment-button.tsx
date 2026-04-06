"use client";

import { useRouter } from "next/navigation";

export function ToggleCommitmentButton({ commitmentId, done }: { commitmentId: string; done: boolean }) {
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
    <button onClick={toggle} className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 transition-colors ${done ? "border-emerald-500 bg-emerald-500 text-white" : "border-gray-300 hover:border-mawi-400"}`}>
      {done && <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
    </button>
  );
}
