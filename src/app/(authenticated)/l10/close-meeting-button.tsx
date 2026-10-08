"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";

type Candidate = {
  kind: "win" | "contribution" | "issue" | "commitment";
  id: string;
  label: string;
  included: boolean;
  locked: boolean;
  reason: string | null;
};

type Preview = {
  meetingVersion: number;
  fingerprint: string;
  parts: string[];
  candidates: Candidate[];
  channel: string | null;
  publishBlocker: string | null;
  previousVersion: number | null;
  unchangedSincePublished: boolean;
};

const KIND_LABEL: Record<Candidate["kind"], string> = {
  win: "Wins destacados",
  contribution: "Contribuciones del equipo",
  issue: "Bloqueos y decisiones (resumen compartible)",
  commitment: "Acuerdos",
};

export default function CloseMeetingButton({
  meetingId,
  currentNotes,
  isCompleted,
}: {
  meetingId: string;
  currentNotes: string;
  isCompleted: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notes, setNotes] = useState(currentNotes);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [included, setIncluded] = useState<Record<string, boolean>>({});
  const [skipping, setSkipping] = useState(false);
  const [skipReason, setSkipReason] = useState("");
  const [updateReason, setUpdateReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const choiceFrom = useCallback(
    (state: Record<string, boolean>, candidates: Candidate[]) => {
      const pick = (kind: Candidate["kind"]) => candidates.filter((c) => c.kind === kind && !c.locked && state[c.id]).map((c) => c.id);
      return { wins: pick("win"), contributions: pick("contribution"), issues: pick("issue"), commitments: pick("commitment") };
    },
    [],
  );

  const loadPreview = useCallback(
    async (state?: Record<string, boolean>, candidates?: Candidate[]) => {
      setError(null);
      const res = await fetch("/api/l10/meetings/close-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meetingId, choice: state && candidates ? choiceFrom(state, candidates) : null }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "No se pudo generar la vista previa");
        return;
      }
      setPreview(data as Preview);
      setIncluded(Object.fromEntries((data as Preview).candidates.map((c) => [c.id, c.included])));
    },
    [meetingId, choiceFrom],
  );

  function openDialog() {
    setOpen(true);
    void loadPreview();
  }

  async function refreshWith(next: Record<string, boolean>) {
    if (!preview) return;
    setLoading(true);
    await loadPreviewKeep(next, preview.candidates);
    setLoading(false);
  }

  // Recalcula la vista previa con la elección actual, conservando los toggles.
  async function loadPreviewKeep(state: Record<string, boolean>, candidates: Candidate[]) {
    setError(null);
    const res = await fetch("/api/l10/meetings/close-preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ meetingId, choice: choiceFrom(state, candidates) }),
    });
    const data = await res.json();
    if (!res.ok) return setError(data.error ?? "No se pudo actualizar la vista previa");
    setPreview(data as Preview);
    setIncluded(state);
  }

  async function handleClose(publish: boolean) {
    if (!preview) return;
    setLoading(true);
    setError(null);
    const res = await fetch("/api/l10/meetings/close", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        meetingId,
        expectedVersion: preview.meetingVersion,
        publish,
        choice: choiceFrom(included, preview.candidates),
        expectedFingerprint: preview.fingerprint,
        skipReason: publish ? null : skipReason,
        updateReason: preview.previousVersion ? updateReason || null : null,
        notes,
      }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? "No se pudo cerrar la reunión");
      // El contenido cambió desde la vista previa: se recarga para revisarlo.
      if (data.code === "preview_changed" || data.code === "version_conflict") void loadPreview();
      return;
    }
    setOpen(false);
    setPreview(null);
    router.refresh();
  }

  async function handleReopen() {
    setLoading(true);
    await fetch("/api/l10/meetings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ meetingId, status: "in_progress" }),
    });
    router.refresh();
    setLoading(false);
  }

  if (isCompleted) {
    return (
      <button
        onClick={handleReopen}
        disabled={loading}
        className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
      >
        {loading ? "..." : "Reabrir reunión"}
      </button>
    );
  }

  if (!open) {
    return (
      <button
        onClick={openDialog}
        className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
      >
        Cerrar reunión
      </button>
    );
  }

  const groups = preview
    ? (Object.keys(KIND_LABEL) as Candidate["kind"][]).map((kind) => ({ kind, items: preview.candidates.filter((c) => c.kind === kind) })).filter((g) => g.items.length > 0)
    : [];
  const canPublish = !!preview && !preview.publishBlocker;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={(e) => { if (e.target === e.currentTarget && !loading) setOpen(false); }}>
      <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-xl bg-white p-6 shadow-xl">
        <h3 className="mb-1 text-lg font-semibold text-gray-900">Cerrar reunión L10</h3>
        <p className="mb-4 text-sm text-gray-500">
          Las notas son privadas del L10. Abajo ves el resumen que saldría a la empresa: revisá el texto, el destino y qué se incluye antes de enviar.
        </p>

        <label className="block text-sm font-medium text-gray-700">Notas privadas y decisiones</label>
        <textarea
          rows={4}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="mt-1 mb-4 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          placeholder="- Qué se discutió&#10;- Principales decisiones&#10;- Aprendizajes o bloqueos"
        />

        {!preview && !error && <p className="text-sm text-gray-500">Generando vista previa…</p>}
        {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        {preview && (
          <>
            <div className="mb-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
              <strong>Destino:</strong> {preview.channel ?? "sin canal configurado"}
              {preview.publishBlocker && <span className="ml-2 text-amber-700">· {preview.publishBlocker}</span>}
              {preview.previousVersion && <span className="ml-2">· Ya se publicó la versión {preview.previousVersion}; esto sería una actualización en el mismo hilo.</span>}
              {preview.unchangedSincePublished && <span className="ml-2 text-emerald-700">· Sin cambios publicables: no se enviará otro resumen.</span>}
            </div>

            {groups.length > 0 && (
              <div className="mb-4 space-y-3">
                {groups.map((g) => (
                  <fieldset key={g.kind} className="rounded-lg border border-gray-200 p-3">
                    <legend className="px-1 text-xs font-semibold uppercase text-gray-500">{KIND_LABEL[g.kind]}</legend>
                    {g.items.map((c) => (
                      <label key={c.id} className={`flex items-start gap-2 py-1 text-sm ${c.locked ? "text-gray-400" : "text-gray-800"}`}>
                        <input
                          type="checkbox"
                          className="mt-1"
                          disabled={c.locked || loading}
                          checked={!!included[c.id] && !c.locked}
                          onChange={(e) => void refreshWith({ ...included, [c.id]: e.target.checked })}
                        />
                        <span>
                          {c.label}
                          {c.reason && <span className="ml-2 text-xs text-amber-700">({c.reason})</span>}
                        </span>
                      </label>
                    ))}
                  </fieldset>
                ))}
              </div>
            )}

            <div className="mb-4">
              <div className="mb-1 text-xs font-semibold uppercase text-gray-500">Vista previa del resumen ({preview.parts.length} {preview.parts.length === 1 ? "mensaje" : "mensajes, 1 principal + respuestas en el hilo"})</div>
              <div className="max-h-72 space-y-2 overflow-y-auto rounded-lg border border-gray-200 bg-white p-3">
                {preview.parts.map((p, i) => (
                  <pre key={i} className="whitespace-pre-wrap break-words border-b border-dashed border-gray-200 pb-2 font-sans text-xs text-gray-800 last:border-0">{p}</pre>
                ))}
              </div>
            </div>

            {preview.previousVersion && (
              <input
                value={updateReason}
                onChange={(e) => setUpdateReason(e.target.value)}
                placeholder="Qué cambió respecto de lo ya publicado (se muestra en la actualización)"
                className="mb-3 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            )}

            {skipping && (
              <input
                value={skipReason}
                onChange={(e) => setSkipReason(e.target.value)}
                placeholder="Motivo para cerrar sin enviar (queda registrado y el reporte queda pendiente)"
                className="mb-3 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            )}

            <div className="flex flex-wrap gap-3 pt-1">
              <button
                type="button"
                disabled={loading || (!canPublish && !preview.unchangedSincePublished)}
                onClick={() => void handleClose(true)}
                className="flex-1 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-40"
              >
                {loading ? "Cerrando..." : "Cerrar y enviar resumen"}
              </button>
              <button
                type="button"
                disabled={loading || (skipping && !skipReason.trim() && !preview.unchangedSincePublished)}
                onClick={() => (skipping || preview.unchangedSincePublished ? void handleClose(false) : setSkipping(true))}
                className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"
              >
                {skipping ? "Confirmar: cerrar sin enviar" : "Cerrar sin enviar"}
              </button>
              <button
                type="button"
                onClick={() => { setOpen(false); setPreview(null); }}
                className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancelar
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
