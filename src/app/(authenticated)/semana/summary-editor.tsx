"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

const THREAD_MARKER = "——— hilo ———";

type Props = {
  week: string;
  initialText: string | null;
  status: string;
  canManage: boolean;
  channelConfigured: boolean;
  permalink: string | null;
  sentAt: string | null;
  lastError: string | null;
  edited: boolean;
};

// Vista simple de mrkdwn de Slack: *negrita*, _cursiva_ y saltos de línea.
function SlackText({ text }: { text: string }) {
  const html = useMemo(() => {
    // El texto ya viene con las entidades de Slack (&amp; &lt; &gt;): se decodifican
    // y se vuelven a escapar para el navegador.
    const decoded = text.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
    const esc = decoded.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    return esc
      .replace(/(^|[\s(])\*([^*\n]+)\*/g, "$1<strong>$2</strong>")
      .replace(/(^|[\s(])_([^_\n]+)_/g, "$1<em>$2</em>");
  }, [text]);
  return <div className="whitespace-pre-wrap text-sm leading-relaxed text-gray-800" dangerouslySetInnerHTML={{ __html: html }} />;
}

export function SummaryEditor(props: Props) {
  const [text, setText] = useState(props.initialText ?? "");
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"preview" | "edit">("preview");
  const router = useRouter();
  const sent = props.status === "sent";
  const sending = props.status === "sending";

  async function call(action: "generate" | "save" | "send") {
    setBusy(action);
    setError(null);
    const res = await fetch("/api/weekly/summary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, week: props.week, ...(action !== "generate" ? { text } : {}) }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) {
      setError(data.error ?? "No se pudo completar la acción");
      return;
    }
    if (action === "generate" && typeof data.draftText === "string") setText(data.draftText);
    setDirty(false);
    router.refresh();
  }

  const [main, thread] = text.split(THREAD_MARKER);

  return (
    <div className="space-y-4">
      {sent && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          ✅ Enviado a #weekly-check-ins{props.sentAt ? ` el ${props.sentAt}` : ""}.{" "}
          {props.permalink && (
            <a href={props.permalink} target="_blank" rel="noopener noreferrer" className="font-medium underline">
              Ver en Slack
            </a>
          )}
          {props.lastError && <div className="mt-1 text-amber-700">{props.lastError}</div>}
        </div>
      )}
      {sending && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Enviando o en duda. {props.lastError ?? "Revisá el canal antes de volver a intentar."}
        </div>
      )}
      {!sent && props.lastError && !sending && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{props.lastError}</div>
      )}
      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      {props.canManage && !sent && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-gray-200 bg-white p-0.5">
            <button onClick={() => setMode("preview")} className={`rounded-md px-3 py-1.5 text-xs font-medium ${mode === "preview" ? "bg-mawi-100 text-mawi-800" : "text-gray-500"}`}>
              Vista previa
            </button>
            <button onClick={() => setMode("edit")} className={`rounded-md px-3 py-1.5 text-xs font-medium ${mode === "edit" ? "bg-mawi-100 text-mawi-800" : "text-gray-500"}`}>
              Editar texto
            </button>
          </div>
          <button
            onClick={() => {
              if (!text || window.confirm("Se rearma el borrador con los datos actuales y se pierden tus ediciones. ¿Seguir?")) void call("generate");
            }}
            disabled={!!busy}
            className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {busy === "generate" ? "Generando…" : text ? "Regenerar borrador" : "Generar borrador"}
          </button>
          {dirty && (
            <button onClick={() => call("save")} disabled={!!busy} className="rounded-lg border border-mawi-200 bg-white px-3 py-1.5 text-xs font-medium text-mawi-700 hover:bg-mawi-50 disabled:opacity-50">
              {busy === "save" ? "Guardando…" : "Guardar cambios"}
            </button>
          )}
          <button
            onClick={() => {
              if (window.confirm("Se publica en #weekly-check-ins para toda la empresa. ¿Enviar?")) void call("send");
            }}
            disabled={!!busy || !text.trim() || !props.channelConfigured || sending}
            title={props.channelConfigured ? undefined : "Falta configurar WEEKLY_CHANNEL_ID"}
            className="ml-auto rounded-lg bg-mawi-700 px-4 py-1.5 text-xs font-semibold text-white hover:bg-mawi-800 disabled:opacity-50"
          >
            {busy === "send" ? "Enviando…" : "Enviar a #weekly-check-ins"}
          </button>
        </div>
      )}
      {props.canManage && !sent && !props.channelConfigured && (
        <p className="text-xs text-amber-700">El envío está desactivado hasta configurar el canal (WEEKLY_CHANNEL_ID).</p>
      )}
      {props.edited && !dirty && !sent && <p className="text-xs text-gray-400">Este borrador tiene ediciones a mano; el cron del viernes no lo pisa.</p>}

      {mode === "edit" && props.canManage && !sent ? (
        <div className="space-y-1">
          <textarea
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setDirty(true);
            }}
            rows={28}
            className="w-full rounded-lg border border-gray-200 bg-white p-3 font-mono text-xs leading-relaxed text-gray-800 focus:border-mawi-400 focus:outline-none"
          />
          <p className="text-xs text-gray-400">
            Formato de Slack: *negrita*, _cursiva_. Lo que va después de la línea «{THREAD_MARKER}» se publica como respuesta en el hilo.
          </p>
        </div>
      ) : text ? (
        <div className="space-y-3">
          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <div className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">Mensaje principal</div>
            <SlackText text={main.trim()} />
          </div>
          {thread?.trim() && (
            <div className="ml-6 rounded-xl border border-dashed border-gray-200 bg-white p-5">
              <div className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">En el hilo</div>
              <SlackText text={thread.trim()} />
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-gray-200 bg-white p-8 text-center text-sm text-gray-500">
          Todavía no hay borrador. Se genera solo el viernes a las 12:00{props.canManage ? ", o generalo ahora." : "."}
        </div>
      )}
    </div>
  );
}
