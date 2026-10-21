"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Settings2 } from "lucide-react";

export type MetricSettingsValue = {
  selectionId: string;
  label: string;
  description: string | null;
  numerator: string | null;
  denominator: string | null;
  unit: string | null;
  frequency: string;
  direction: string;
  aggregation: string;
  target: number | null;
  targetText: string | null;
  targetConfirmed: boolean;
  approved: boolean;
  notes: string | null;
  // De la métrica; null si la fila es una propuesta sin métrica.
  metric: { dataSource: string; ownerId: string } | null;
};

const UNITS = [
  ["%", "Porcentaje"],
  ["$", "Dólares"],
  ["count", "Cantidad"],
  ["days", "Días"],
  ["hours", "Horas"],
  ["ratio", "Ratio"],
  ["months", "Meses"],
  ["boolean", "Sí / No"],
];
const FREQUENCIES = [
  ["weekly", "Semanal"],
  ["biweekly", "Quincenal"],
  ["monthly", "Mensual"],
];
const DIRECTIONS = [
  ["above", "Más es mejor (≥ meta)"],
  ["below", "Menos es mejor (≤ meta)"],
  ["equal", "Igual a la meta"],
];
const AGGREGATIONS = [
  ["last", "Último valor del mes"],
  ["sum", "Suma del mes"],
  ["avg", "Promedio del mes"],
  ["max", "Máximo del mes"],
];
const SOURCES = [
  ["manual", "Manual (la carga el responsable)"],
  ["hubspot", "HubSpot (sync)"],
  ["chartmogul", "ChartMogul (sync)"],
  ["posthog", "PostHog (sync)"],
];

const field = "mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-mawi-600 focus:outline-none focus:ring-1 focus:ring-mawi-600";

function Select({ name, value, options, onChange }: { name: string; value: string; options: string[][]; onChange: (v: string) => void }) {
  return (
    <select name={name} value={value} onChange={(e) => onChange(e.target.value)} className={field}>
      {options.map(([v, l]) => (
        <option key={v} value={v}>
          {l}
        </option>
      ))}
    </select>
  );
}

export function MetricSettings({ value, leaders }: { value: MetricSettingsValue; leaders: Array<{ id: string; name: string }> }) {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState(value);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const up = <K extends keyof MetricSettingsValue>(k: K, x: MetricSettingsValue[K]) => setV((s) => ({ ...s, [k]: x }));

  async function save() {
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/scorecard/selections/${v.selectionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        label: v.label,
        description: v.description,
        numerator: v.numerator,
        denominator: v.denominator,
        unit: v.unit ?? undefined,
        frequency: v.frequency,
        direction: v.direction,
        aggregation: v.aggregation,
        target: v.target,
        targetText: v.targetText,
        targetConfirmed: v.targetConfirmed,
        approved: v.approved,
        notes: v.notes,
        ...(v.metric ? { dataSource: v.metric.dataSource, ownerId: v.metric.ownerId } : {}),
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const j = await res.json().catch(() => null);
      setError(j?.error ?? "No se pudo guardar");
      return;
    }
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <button
        onClick={() => {
          setV(value);
          setOpen(true);
        }}
        className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-mawi-700"
        aria-label={`Cambiar cómo se calcula ${value.label}`}
        title="Cambiar cómo se calcula"
      >
        <Settings2 className="h-4 w-4" />
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 md:items-center">
          <div className="w-full max-w-2xl rounded-xl bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Cómo se calcula</h3>
                <p className="text-xs text-gray-500">Cambia la definición de esta métrica en el trimestre. El semáforo se recalcula con la meta nueva.</p>
              </div>
              <button onClick={() => setOpen(false)} className="text-sm text-gray-400 hover:text-gray-600">Cerrar</button>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <label className="block text-sm font-medium text-gray-700 md:col-span-2">
                Nombre
                <input value={v.label} onChange={(e) => up("label", e.target.value)} className={field} />
              </label>
              <label className="block text-sm font-medium text-gray-700 md:col-span-2">
                Qué mide
                <textarea value={v.description ?? ""} onChange={(e) => up("description", e.target.value || null)} rows={2} className={field} />
              </label>
              <label className="block text-sm font-medium text-gray-700">
                Numerador
                <input value={v.numerator ?? ""} onChange={(e) => up("numerator", e.target.value || null)} placeholder="Ej.: demos realizadas" className={field} />
              </label>
              <label className="block text-sm font-medium text-gray-700">
                Denominador
                <input value={v.denominator ?? ""} onChange={(e) => up("denominator", e.target.value || null)} placeholder="Ej.: demos agendadas" className={field} />
              </label>
              <label className="block text-sm font-medium text-gray-700">
                Unidad
                <Select name="unit" value={v.unit ?? "count"} options={UNITS} onChange={(x) => up("unit", x)} />
              </label>
              <label className="block text-sm font-medium text-gray-700">
                Frecuencia
                <Select name="frequency" value={v.frequency} options={FREQUENCIES} onChange={(x) => up("frequency", x)} />
              </label>
              <label className="block text-sm font-medium text-gray-700">
                Dirección
                <Select name="direction" value={v.direction} options={DIRECTIONS} onChange={(x) => up("direction", x)} />
              </label>
              <label className="block text-sm font-medium text-gray-700">
                Cómo se combina en el mes
                <Select name="aggregation" value={v.aggregation} options={AGGREGATIONS} onChange={(x) => up("aggregation", x)} />
              </label>
              <label className="block text-sm font-medium text-gray-700">
                Meta (número)
                <input
                  type="number"
                  step="any"
                  value={v.target ?? ""}
                  onChange={(e) => up("target", e.target.value === "" ? null : Number(e.target.value))}
                  className={field}
                />
              </label>
              <label className="block text-sm font-medium text-gray-700">
                Meta (cómo se muestra)
                <input value={v.targetText ?? ""} onChange={(e) => up("targetText", e.target.value || null)} placeholder="Ej.: ≥ 65%" className={field} />
              </label>
              {v.metric && (
                <>
                  <label className="block text-sm font-medium text-gray-700">
                    Fuente del dato
                    <Select name="dataSource" value={v.metric.dataSource} options={SOURCES} onChange={(x) => up("metric", { ...v.metric!, dataSource: x })} />
                  </label>
                  <label className="block text-sm font-medium text-gray-700">
                    Responsable de cargarla
                    <Select
                      name="ownerId"
                      value={v.metric.ownerId}
                      options={leaders.map((l) => [l.id, l.name])}
                      onChange={(x) => up("metric", { ...v.metric!, ownerId: x })}
                    />
                  </label>
                </>
              )}
              <label className="block text-sm font-medium text-gray-700 md:col-span-2">
                Notas
                <textarea value={v.notes ?? ""} onChange={(e) => up("notes", e.target.value || null)} rows={2} className={field} />
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={v.targetConfirmed} onChange={(e) => up("targetConfirmed", e.target.checked)} />
                Meta confirmada (pinta el semáforo)
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={v.approved} onChange={(e) => up("approved", e.target.checked)} disabled={!v.metric} />
                Definición aprobada{!v.metric ? " (falta una métrica con datos)" : ""}
              </label>
            </div>

            {v.metric && (
              <p className="mt-4 text-xs text-gray-400">La fuente y el responsable son de la métrica: aplican también en otros trimestres que la usen.</p>
            )}
            {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setOpen(false)} className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
                Cancelar
              </button>
              <button onClick={() => void save()} disabled={saving} className="rounded-lg bg-mawi-700 px-4 py-2 text-sm font-semibold text-white hover:bg-mawi-800 disabled:opacity-50">
                {saving ? "Guardando…" : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
