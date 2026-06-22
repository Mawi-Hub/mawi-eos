"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Annotation {
  id: string;
  authorName: string;
  authorId: string;
  tag: string;
  comment: string;
  resolvedAt: string | null;
  createdAt: string;
}

interface Props {
  meetingId: string;
  targetType: "rock" | "metric" | "win" | "challenge";
  targetId: string;
  targetLabel: string;
  currentUserId: string;
  isCeo: boolean;
  annotations: Annotation[];
}

export function AnnotateButton({ meetingId, targetType, targetId, targetLabel, currentUserId, isCeo, annotations }: Props) {
  const [open, setOpen] = useState(false);
  const [tag, setTag] = useState<"clarificar" | "discutir">("clarificar");
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const unresolvedCount = annotations.filter((a) => !a.resolvedAt).length;

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!comment.trim()) return;
    setLoading(true);
    const res = await fetch("/api/l10/annotations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ meetingId, targetType, targetId, tag, comment }),
    });
    if (res.ok) {
      setComment("");
      router.refresh();
    }
    setLoading(false);
  }

  async function toggleResolve(annotationId: string, currentlyResolved: boolean) {
    setLoading(true);
    await fetch("/api/l10/annotations", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ annotationId, resolve: !currentlyResolved }),
    });
    router.refresh();
    setLoading(false);
  }

  async function handleDelete(annotationId: string) {
    if (!confirm("Borrar comentario?")) return;
    setLoading(true);
    await fetch("/api/l10/annotations", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ annotationId }),
    });
    router.refresh();
    setLoading(false);
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className={`rounded px-2 py-0.5 text-[10px] font-medium ${unresolvedCount > 0 ? "bg-amber-100 text-amber-800 hover:bg-amber-200" : "border border-gray-200 text-gray-500 hover:bg-gray-50"}`}
        title="Anotar / ver comentarios"
      >
        💬 {annotations.length > 0 ? annotations.length : ""}
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
      <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
        <h3 className="text-lg font-semibold text-gray-900">Anotaciones</h3>
        <p className="mt-1 text-xs text-gray-500">{targetLabel}</p>

        {annotations.length > 0 && (
          <div className="mt-4 max-h-72 space-y-2 overflow-y-auto">
            {annotations.map((a) => {
              const tagCfg =
                a.tag === "discutir"
                  ? { label: "Discutir", className: "bg-red-100 text-red-800" }
                  : { label: "Clarificar", className: "bg-amber-100 text-amber-800" };
              const canDelete = a.authorId === currentUserId || isCeo;
              return (
                <div key={a.id} className={`rounded-lg border px-3 py-2 ${a.resolvedAt ? "border-gray-100 bg-gray-50 opacity-70" : "border-gray-200"}`}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${tagCfg.className}`}>{tagCfg.label}</span>
                      <span className="text-xs font-medium text-mawi-700">{a.authorName}</span>
                    </div>
                    <span className="text-[10px] text-gray-400">
                      {new Date(a.createdAt).toLocaleDateString("es", { day: "numeric", month: "short" })}
                    </span>
                  </div>
                  <p className={`mt-1 text-sm text-gray-700 ${a.resolvedAt ? "line-through" : ""}`}>{a.comment}</p>
                  <div className="mt-1 flex items-center gap-2">
                    <button
                      onClick={() => toggleResolve(a.id, !!a.resolvedAt)}
                      disabled={loading}
                      className="text-[11px] text-mawi-700 hover:underline disabled:opacity-50"
                    >
                      {a.resolvedAt ? "Reabrir" : "Marcar resuelto"}
                    </button>
                    {canDelete && (
                      <button
                        onClick={() => handleDelete(a.id)}
                        disabled={loading}
                        className="text-[11px] text-red-600 hover:underline disabled:opacity-50"
                      >
                        Borrar
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <form onSubmit={handleAdd} className="mt-4 space-y-3 border-t border-gray-100 pt-4">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setTag("clarificar")}
              className={`rounded-full px-3 py-1 text-xs font-medium ${tag === "clarificar" ? "bg-amber-100 text-amber-800" : "border border-gray-200 text-gray-500"}`}
            >
              Clarificar
            </button>
            <button
              type="button"
              onClick={() => setTag("discutir")}
              className={`rounded-full px-3 py-1 text-xs font-medium ${tag === "discutir" ? "bg-red-100 text-red-800" : "border border-gray-200 text-gray-500"}`}
            >
              Discutir
            </button>
          </div>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={2}
            placeholder={tag === "clarificar" ? "Pregunta para que el owner responda async..." : "Tema para discutir en la reunión..."}
            className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-mawi-600 focus:outline-none focus:ring-1 focus:ring-mawi-600"
          />
          <div className="flex gap-3">
            <button type="submit" disabled={loading || !comment.trim()} className="flex-1 rounded-lg bg-mawi-800 px-4 py-2 text-sm font-medium text-white hover:bg-mawi-700 disabled:opacity-50">
              {loading ? "..." : "Agregar"}
            </button>
            <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
              Cerrar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
