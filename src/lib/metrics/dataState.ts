// Estados de un dato de métrica. Un cero solo existe cuando la fuente lo
// confirma; todo lo demás tiene un estado propio para que nunca se confunda
// con un buen (o mal) resultado.

export type DataState =
  | "value"
  | "confirmed_zero"
  | "pending"
  | "not_applicable"
  | "no_sample"
  | "stale"
  | "error";

export const DATA_STATE_LABEL: Record<DataState, string> = {
  value: "Con dato",
  confirmed_zero: "Cero confirmado",
  pending: "Pendiente",
  not_applicable: "No aplica",
  no_sample: "Sin muestra",
  stale: "Desactualizado",
  error: "Error",
};

export type EntryLike = {
  actualValue: number | null;
  dataState?: string | null;
  periodStart?: Date | null;
  updatedAt?: Date | null;
};

const KNOWN: ReadonlySet<string> = new Set([
  "confirmed_zero",
  "pending",
  "not_applicable",
  "no_sample",
  "stale",
  "error",
]);

// Frecuencia → cuántos días puede tener la última actualización antes de
// considerarse vieja.
const STALE_AFTER_DAYS: Record<string, number> = {
  daily: 3,
  weekly: 10,
  biweekly: 18,
  monthly: 40,
};

export function resolveDataState(
  entry: EntryLike | null | undefined,
  options?: { frequency?: string; now?: Date; autoSynced?: boolean },
): DataState {
  if (!entry) return "pending";
  const explicit = entry.dataState && KNOWN.has(entry.dataState) ? (entry.dataState as DataState) : null;
  if (explicit) return explicit;

  if (entry.actualValue === null || entry.actualValue === undefined || Number.isNaN(entry.actualValue)) {
    return "pending";
  }

  // Un 0 sin confirmación de la fuente es sospechoso: no se presenta como
  // resultado, queda pendiente de confirmar.
  if (entry.actualValue === 0 && options?.autoSynced) return "pending";

  const now = options?.now ?? new Date();
  const limit = STALE_AFTER_DAYS[options?.frequency ?? "weekly"] ?? 10;
  const ref = entry.updatedAt ?? entry.periodStart ?? null;
  if (ref && (now.getTime() - ref.getTime()) / 86_400_000 > limit) return "stale";

  return "value";
}

// Un semáforo exige dato vigente. Pendiente, sin muestra, error o viejo no
// pintan ni verde ni rojo.
export function isActionableState(state: DataState): boolean {
  return state === "value" || state === "confirmed_zero";
}

export function formatNOverN(numerator: number | null | undefined, denominator: number | null | undefined): string | null {
  if (numerator === null || numerator === undefined || denominator === null || denominator === undefined) return null;
  return `${numerator}/${denominator}`;
}

// Tasa a partir de numerador/denominador: denominador 0 → sin muestra, no 0%.
export function rateFromCounts(
  numerator: number,
  denominator: number,
): { value: number | null; state: DataState } {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator)) return { value: null, state: "error" };
  if (denominator === 0) return { value: null, state: "no_sample" };
  const value = (numerator / denominator) * 100;
  return { value, state: numerator === 0 ? "confirmed_zero" : "value" };
}
