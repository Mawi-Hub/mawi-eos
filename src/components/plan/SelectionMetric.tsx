// Piezas visuales compartidas por Scorecard y Plan H2 para mostrar una métrica
// de la selección trimestral. Cada estado de dato tiene su propio aspecto: un
// pendiente, una falta de muestra o un error nunca se parecen a un resultado.

import type { DataState } from "@/lib/metrics/dataState";
import { DATA_STATE_LABEL } from "@/lib/metrics/dataState";
import type { SelectionMetricView } from "@/lib/selection/types";
import { PENDING_EXPLAINER, pendingMissing } from "@/lib/selection/pending";

const STATE_STYLE: Record<DataState, string> = {
  value: "bg-gray-100 text-gray-700",
  confirmed_zero: "bg-sky-100 text-sky-800 ring-1 ring-sky-300",
  pending: "border border-dashed border-gray-400 bg-white text-gray-600",
  not_applicable: "bg-slate-100 text-slate-600 italic",
  no_sample: "bg-violet-100 text-violet-800",
  stale: "bg-amber-100 text-amber-800 ring-1 ring-amber-300",
  error: "border border-red-400 bg-red-50 text-red-800",
};

export function DataStateBadge({ state }: { state: DataState }) {
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATE_STYLE[state]}`}>
      {DATA_STATE_LABEL[state]}
    </span>
  );
}

const SIGNAL_STYLE: Record<NonNullable<SelectionMetricView["signal"]>, { label: string; className: string }> = {
  on_track: { label: "On Track", className: "bg-emerald-100 text-emerald-800" },
  riesgo: { label: "Riesgo", className: "bg-amber-100 text-amber-800" },
  off_track: { label: "Off Track", className: "bg-red-100 text-red-800" },
};

// Solo se pinta si el resolvedor entrega una señal; null = sin semáforo.
export function SignalBadge({ signal }: { signal: SelectionMetricView["signal"] }) {
  if (!signal) return null;
  const s = SIGNAL_STYLE[signal];
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${s.className}`}>{s.label}</span>;
}

export function PendingConfigBadge({ view }: { view?: SelectionMetricView }) {
  const missing = view ? pendingMissing(view) : [];
  return (
    <div className="space-y-0.5" title={missing.map((m) => `${m.label}: ${m.hint}`).join("\n") || undefined}>
      <span className="inline-flex rounded-full border border-dashed border-gray-400 bg-white px-2 py-0.5 text-xs font-medium text-gray-500">
        Pendiente de configuración
      </span>
      {missing.length > 0 && (
        <div className="text-[11px] leading-tight text-gray-500">Falta: {missing.map((m) => m.label.toLowerCase()).join(" · ")}</div>
      )}
    </div>
  );
}

// Explica en una línea qué significa "pendiente de configuración".
export function PendingExplainer() {
  return (
    <details className="rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-600">
      <summary className="cursor-pointer select-none font-medium text-gray-700">¿Qué significa «Pendiente de configuración»?</summary>
      <p className="mt-2 text-xs leading-relaxed">{PENDING_EXPLAINER}</p>
    </details>
  );
}

const DATA_STATES_WITH_VALUE: ReadonlySet<DataState> = new Set(["value", "confirmed_zero"]);

// Valor, o el estado que explica por qué no hay uno. Una fila pendiente de
// configuración no muestra ningún valor ni 0.
export function SelectionMetricValue({ view }: { view: SelectionMetricView }) {
  if (view.pendingConfig) return <PendingConfigBadge view={view} />;

  const hasValue = DATA_STATES_WITH_VALUE.has(view.dataState) && view.valueText !== null;
  return (
    <div className="space-y-0.5">
      {hasValue ? (
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="text-sm font-semibold text-gray-900">{view.valueText}</span>
          {view.nOverN && <span className="text-xs text-gray-500">({view.nOverN})</span>}
          {view.dataState === "confirmed_zero" && <DataStateBadge state="confirmed_zero" />}
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <DataStateBadge state={view.dataState} />
          {view.nOverN && <span className="text-xs text-gray-500">({view.nOverN})</span>}
        </div>
      )}
      {!hasValue && view.lastValid && (
        <div className="text-xs text-gray-500">
          anterior: {view.lastValid.valueText} ({view.lastValid.periodLabel})
        </div>
      )}
    </div>
  );
}
