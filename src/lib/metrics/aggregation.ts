// Valor efectivo de una métrica en un período (normalmente un mes). Reglas
// explícitas por métrica en vez de "último valor no nulo" para todo, y
// normalización de la escala de porcentajes sin tocar las entradas guardadas.

export type Aggregation = "last" | "sum" | "avg" | "max";

export type AggEntry = { periodStart: Date; actualValue: number | null };

export function isAggregation(value: string | null | undefined): value is Aggregation {
  return value === "last" || value === "sum" || value === "avg" || value === "max";
}

// `entries` en cualquier orden; solo cuentan las que caen en [start, end).
export function aggregateEntries(
  entries: AggEntry[],
  aggregation: Aggregation,
  start: Date,
  end: Date,
): number | null {
  const inRange = entries
    .filter((e) => e.actualValue !== null && e.periodStart >= start && e.periodStart < end)
    .sort((a, b) => b.periodStart.getTime() - a.periodStart.getTime());
  if (inRange.length === 0) return null;

  const values = inRange.map((e) => e.actualValue as number);
  switch (aggregation) {
    case "sum":
      return values.reduce((a, b) => a + b, 0);
    case "avg":
      return values.reduce((a, b) => a + b, 0) / values.length;
    case "max":
      return Math.max(...values);
    case "last":
    default:
      return values[0]; // el más reciente (orden descendente)
  }
}

// Escala declarada → porcentaje 0–100. No adivina: depende de lo que la
// métrica dice de sí misma.
export function toPercent100(value: number, declaredScale: string | null | undefined): number {
  return declaredScale === "0-1" ? value * 100 : value;
}

// De la unidad del Scorecard a la del Plan (PCT = fracción 0–1, USD/count = tal cual).
export function toPlanValue(
  rawValue: number,
  planUnit: string,
  scorecardUnit: string | null | undefined,
  percentScale: string | null | undefined,
): number {
  if (planUnit === "PCT" && scorecardUnit === "%") return toPercent100(rawValue, percentScale) / 100;
  return rawValue;
}
