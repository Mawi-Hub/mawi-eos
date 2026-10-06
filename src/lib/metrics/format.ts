// Formato único de valores de métricas: scorecard, plan, L10 y Slack muestran
// el mismo texto para el mismo número.

export function formatMetricValue(value: number | null | undefined, unit: string | null | undefined): string | null {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  const u = (unit ?? "").trim();
  const n = (max: number) => value.toLocaleString("en-US", { maximumFractionDigits: max });
  if (u === "$" || u === "USD") return `$${n(0)}`;
  if (u === "%" || u === "PCT") return `${n(1)}%`;
  if (u === "ratio") return n(2);
  if (u === "days") return `${n(0)} d`;
  if (u === "hours") return `${n(1)} h`;
  if (u === "months") return `${n(0)} m`;
  if (u === "boolean") return value === 1 ? "Sí" : "No";
  return n(1);
}

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

// Etiqueta honesta del período al que corresponde un dato. Las métricas
// mensuales dicen "mes a la fecha" o "último mes cerrado": nunca se presentan
// como un resultado semanal.
export function describePeriod(
  frequency: string,
  periodStart: Date,
  nowParts: { year: number; month: number },
  periodParts: { year: number; month: number; day: number },
): string {
  if (frequency === "weekly" || frequency === "daily") {
    return `semana del ${periodParts.day} ${MONTHS[periodParts.month - 1]}`;
  }
  const isCurrentMonth = periodParts.year === nowParts.year && periodParts.month === nowParts.month;
  const label = `${MONTHS[periodParts.month - 1]} ${periodParts.year}`;
  return isCurrentMonth ? `mes a la fecha (${label})` : `último mes cerrado (${label})`;
}
