"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface ReadItem {
  key: string;
  label: string;
}

interface Props {
  meetingId: string;
  alreadyRead: boolean;
  items: ReadItem[];
}

export function MarkAsReadButton({ meetingId, alreadyRead, items }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const router = useRouter();

  async function unmark() {
    setLoading(true);
    await fetch("/api/l10/preread-reads", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ meetingId }),
    });
    router.refresh();
    setLoading(false);
  }

  async function confirmRead() {
    setLoading(true);
    await fetch("/api/l10/preread-reads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ meetingId }),
    });
    setOpen(false);
    setChecked({});
    router.refresh();
    setLoading(false);
  }

  function toggle(key: string) {
    setChecked((c) => ({ ...c, [key]: !c[key] }));
  }

  const allChecked = items.length > 0 && items.every((i) => checked[i.key]);

  if (alreadyRead) {
    return (
      <button
        onClick={unmark}
        disabled={loading}
        className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
      >
        {loading ? "..." : "Leído ✓"}
      </button>
    );
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-full bg-mawi-800 px-3 py-1 text-xs font-medium text-white hover:bg-mawi-700"
      >
        Marcar leído
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <h3 className="text-lg font-semibold text-gray-900">Confirmá que leíste el pre-read</h3>
        <p className="mt-1 text-sm text-gray-500">
          Marcá cada sección que ya revisaste. El sistema confía en vos — pero la mesa también.
        </p>

        <div className="mt-4 space-y-2">
          {items.map((item) => (
            <label
              key={item.key}
              className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 text-sm transition ${
                checked[item.key] ? "border-emerald-300 bg-emerald-50" : "border-gray-200 hover:bg-gray-50"
              }`}
            >
              <input
                type="checkbox"
                checked={!!checked[item.key]}
                onChange={() => toggle(item.key)}
                className="h-4 w-4 rounded border-gray-300 text-mawi-700 focus:ring-mawi-600"
              />
              <span className={checked[item.key] ? "text-emerald-800" : "text-gray-800"}>{item.label}</span>
            </label>
          ))}
        </div>

        <div className="mt-5 flex gap-3">
          <button
            type="button"
            onClick={confirmRead}
            disabled={loading || !allChecked}
            className="flex-1 rounded-lg bg-mawi-800 px-4 py-2 text-sm font-medium text-white hover:bg-mawi-700 disabled:opacity-50"
          >
            {loading ? "..." : "Marqué leído"}
          </button>
          <button
            type="button"
            onClick={() => { setOpen(false); setChecked({}); }}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
