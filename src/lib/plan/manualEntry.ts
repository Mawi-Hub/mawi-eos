// Validación pura de la captura manual del Scorecard. La API la usa para
// decidir qué se guarda; así las reglas de estados de dato se prueban sin base.

export const MANUAL_DATA_STATES = ["confirmed_zero", "pending", "not_applicable", "no_sample", "error"] as const;
export type ManualDataState = (typeof MANUAL_DATA_STATES)[number];

export type ManualEntryInput = {
  actualValue?: unknown;
  dataState?: unknown;
  numerator?: unknown;
  denominator?: unknown;
  provenance?: unknown;
};

export type ManualEntryResult =
  | {
      ok: true;
      actualValue: number | null;
      dataState: ManualDataState | null;
      numerator: number | null;
      denominator: number | null;
      provenance: string;
      // true cuando no hay un número que evaluar contra la meta.
      noValue: boolean;
    }
  | { ok: false; error: string };

function optionalNumber(v: unknown): { ok: true; value: number | null } | { ok: false } {
  if (v === undefined || v === null || v === "") return { ok: true, value: null };
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? { ok: true, value: n } : { ok: false };
}

export function normalizeManualEntry(input: ManualEntryInput, metric: { unit: string | null; percentScale?: string | null }): ManualEntryResult {
  let dataState: ManualDataState | null = null;
  if (input.dataState !== undefined && input.dataState !== null && input.dataState !== "" && input.dataState !== "value") {
    if (typeof input.dataState !== "string" || !(MANUAL_DATA_STATES as readonly string[]).includes(input.dataState)) {
      return { ok: false, error: "dataState inválido" };
    }
    dataState = input.dataState as ManualDataState;
  }

  const num = optionalNumber(input.numerator);
  const den = optionalNumber(input.denominator);
  const val = optionalNumber(input.actualValue);
  if (!num.ok) return { ok: false, error: "numerator inválido" };
  if (!den.ok) return { ok: false, error: "denominator inválido" };
  if (!val.ok) return { ok: false, error: "actualValue inválido" };
  if (den.value !== null && den.value < 0) return { ok: false, error: "denominator no puede ser negativo" };

  let provenance = "manual";
  if (input.provenance !== undefined && input.provenance !== null && input.provenance !== "") {
    if (typeof input.provenance !== "string") return { ok: false, error: "provenance inválido" };
    const trimmed = input.provenance.trim();
    if (trimmed.length > 500) return { ok: false, error: "provenance demasiado largo" };
    if (trimmed) provenance = trimmed;
  }

  const base = { numerator: num.value, denominator: den.value, provenance };

  // Denominador 0: no hay muestra. Nunca 0%.
  if (den.value === 0) {
    return { ok: true, ...base, actualValue: null, dataState: "no_sample", noValue: true };
  }

  if (dataState === "pending" || dataState === "not_applicable" || dataState === "no_sample" || dataState === "error") {
    return { ok: true, ...base, actualValue: null, dataState, noValue: true };
  }

  let actual = val.value;
  if (actual === null && num.value !== null && den.value !== null && metric.unit === "%") {
    const pct = (num.value / den.value) * 100;
    actual = metric.percentScale === "0-1" ? pct / 100 : pct;
  }
  if (actual === null) {
    return dataState === "confirmed_zero"
      ? { ok: true, ...base, actualValue: 0, dataState: "confirmed_zero", noValue: false }
      : { ok: false, error: "actualValue es requerido" };
  }
  if (dataState === "confirmed_zero" && actual !== 0) {
    return { ok: false, error: "confirmed_zero exige actualValue = 0" };
  }
  // Un 0 manual explícito queda marcado como cero confirmado por una persona.
  if (actual === 0) return { ok: true, ...base, actualValue: 0, dataState: "confirmed_zero", noValue: false };
  return { ok: true, ...base, actualValue: actual, dataState: null, noValue: false };
}
