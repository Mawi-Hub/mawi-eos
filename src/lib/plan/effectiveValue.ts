// Valor efectivo de un KPI del Plan cuando su fuente es el Scorecard. Es puro
// (sin base de datos) para que la portada, el catálogo y el detalle usen
// exactamente la misma regla y se puedan probar sin Prisma.
//
// Nunca muta entradas guardadas: devuelve copias con `actual` sustituido.

import { aggregateEntries, isAggregation, toPlanValue, type Aggregation } from "@/lib/metrics/aggregation";

export type OverlayEntryShape = { period: Date | string; projected: number; actual: number | null };

export type KpiForOverlay = {
  sourceType: string;
  sourceKey: string | null;
  // Correspondencia canónica con ScorecardMetric; tiene prioridad sobre el nombre.
  scorecardMetricId?: string | null;
  unit: string;
  entries: OverlayEntryShape[];
};

export type OverlayMetric = {
  id?: string;
  name: string;
  unit: string | null;
  aggregation?: string | null;
  percentScale?: string | null;
  entries: { periodStart: Date; actualValue: number | null; dataState?: string | null }[];
};

// Solo un dato con valor (o un cero confirmado) puede sobrescribir un real del
// Plan. pending / no_sample / error / not_applicable / stale no son números.
export function isNumericScorecardEntry(e: { actualValue: number | null; dataState?: string | null }): boolean {
  if (e.actualValue === null || e.actualValue === undefined || Number.isNaN(e.actualValue)) return false;
  return e.dataState === null || e.dataState === undefined || e.dataState === "value" || e.dataState === "confirmed_zero";
}

export function monthStartUTC(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

// Valor del mes (en unidad del Plan) para una métrica del Scorecard, o null si
// no hay dato numérico válido dentro del mes.
export function effectiveMonthValue(metric: OverlayMetric, planUnit: string, period: Date | string): number | null {
  const periodDate = period instanceof Date ? period : new Date(period);
  const start = monthStartUTC(periodDate);
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
  const valid = metric.entries.filter(isNumericScorecardEntry);
  const aggregation: Aggregation = isAggregation(metric.aggregation) ? metric.aggregation : "last";
  const raw = aggregateEntries(valid, aggregation, start, end);
  if (raw === null) return null;
  return toPlanValue(raw, planUnit, metric.unit, metric.percentScale);
}

export function overlayKpiWithMetric<T extends KpiForOverlay>(kpi: T, metric: OverlayMetric | undefined | null): T {
  if (!metric) return kpi;
  const entries = kpi.entries.map((entry) => {
    const value = effectiveMonthValue(metric, kpi.unit, entry.period);
    return value === null ? entry : { ...entry, actual: value };
  });
  return { ...kpi, entries };
}

export function resolveMetricForKpi<M extends { id?: string; name: string }>(
  kpi: KpiForOverlay,
  byId: Map<string, M>,
  byName: Map<string, M>,
): M | undefined {
  if (kpi.scorecardMetricId) {
    const mapped = byId.get(kpi.scorecardMetricId);
    if (mapped) return mapped;
  }
  return kpi.sourceKey ? byName.get(kpi.sourceKey) : undefined;
}

// Versión pura de todo el overlay: recibe las métricas ya cargadas.
export function overlayKpisWithMetrics<T extends KpiForOverlay, M extends OverlayMetric>(kpis: T[], metrics: M[]): T[] {
  const byId = new Map(metrics.filter((m) => m.id).map((m) => [m.id as string, m]));
  const byName = new Map(metrics.map((m) => [m.name, m]));
  return kpis.map((kpi) => {
    if (kpi.sourceType !== "SCORECARD") return kpi;
    return overlayKpiWithMetric(kpi, resolveMetricForKpi(kpi, byId, byName));
  });
}
