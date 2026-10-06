// Alcance de métricas del L10 con la selección trimestral. Funciones puras: el
// MetricScope se resuelve afuera (getMetricScope) y acá solo se aplica.
//
// Reglas:
//  - modo legado: todo se comporta como antes.
//  - modo selección: solo las métricas de la selección entran al tablero, a la
//    cobertura, a las rachas y al checklist; un trimestre sin selección queda
//    vacío (nunca "todas").
//  - IDS ya vinculados a métricas fuera de la selección siguen visibles: el
//    alcance solo filtra lo NUEVO, nunca borra ni oculta lo existente.

import type { MetricScope } from "@/lib/selection/quarterSelection";

export const NO_SELECTION_LABEL = "Legado sin selección registrada";

export function metricInScope(scope: MetricScope, metricId: string): boolean {
  return scope.mode === "legacy" ? true : scope.metricIds.has(metricId);
}

export function scopeMetrics<T extends { id: string }>(metrics: T[], scope: MetricScope): T[] {
  return scope.mode === "legacy" ? metrics : metrics.filter((m) => scope.metricIds.has(m.id));
}

export function isLegacyWithoutSelection(scope: MetricScope): boolean {
  return scope.mode === "selection" && !scope.hasSelection;
}

export type Frequency = "weekly" | "biweekly" | "monthly";

export function normalizeFrequency(value: string | null | undefined): Frequency {
  return value === "monthly" || value === "biweekly" ? value : "weekly";
}

// Frecuencia efectiva: la definición de la selección manda sobre la de la métrica.
export function frequencyFor(scope: MetricScope, metricId: string, metricFrequency: string | null | undefined): Frequency {
  if (scope.mode === "selection") {
    const row = scope.selection.rows.find((r) => r.scorecardMetricId === metricId);
    if (row?.definition?.frequency) return normalizeFrequency(row.definition.frequency);
  }
  return normalizeFrequency(metricFrequency);
}

// "3 sem", "2 quincenas", "2 meses" — nunca "semanas" para algo mensual.
export function periodsLabel(frequency: Frequency, n: number): string {
  if (frequency === "monthly") return n === 1 ? "1 mes" : `${n} meses`;
  if (frequency === "biweekly") return n === 1 ? "1 quincena" : `${n} quincenas`;
  return `${n} sem`;
}

export function periodsInRedTitle(frequency: Frequency): string {
  if (frequency === "monthly") return "Métrica en rojo varios meses seguidos";
  if (frequency === "biweekly") return "Métrica en rojo varias quincenas seguidas";
  return "Métrica en rojo varias semanas seguidas";
}

// Racha crónica: en legado sigue siendo 4 para todo; en selección una métrica
// mensual ya es crónica a los 2 meses.
export function chronicThreshold(frequency: Frequency, scope: MetricScope): number {
  if (scope.mode === "selection" && frequency === "monthly") return 2;
  return 4;
}

const isRedStatus = (s: string | null | undefined) => s === "off_track" || s === "riesgo";

// Entradas más recientes primero. Cuenta las rojas consecutivas desde la última.
export function redStreak(entries: Array<{ status: string }>): number {
  let streak = 0;
  for (const e of entries) {
    if (isRedStatus(e.status)) streak++;
    else break;
  }
  return streak;
}

// ¿La métrica manual ya tiene su dato del período vigente? Semanal: desde el
// lunes del ciclo; quincenal: desde la semana previa; mensual: desde el día 1
// del mes del ciclo (`cycleStart` + `monthStart`).
export function updatedForPeriod(
  frequency: Frequency,
  lastPeriodStart: Date | null | undefined,
  cycle: { weekStart: Date; monthStart: Date },
): boolean {
  if (!lastPeriodStart) return false;
  const t = new Date(lastPeriodStart).getTime();
  if (frequency === "monthly") return t >= cycle.monthStart.getTime();
  if (frequency === "biweekly") return t >= cycle.weekStart.getTime() - 7 * 24 * 60 * 60 * 1000;
  return t >= cycle.weekStart.getTime();
}

// Opciones de vínculo para un IDS nuevo: solo del dueño y dentro del alcance.
export function metricLinkOptions<T extends { id: string; ownerId: string }>(
  metrics: T[],
  ownerId: string | undefined,
  scope: MetricScope,
): T[] {
  if (!ownerId) return [];
  return scopeMetrics(metrics, scope).filter((m) => m.ownerId === ownerId);
}
