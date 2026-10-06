// ¿Este KPI del Plan está en la selección del trimestre? Coincide por el KPI
// elegido directamente o por la métrica del Scorecard a la que está mapeado.

export type SelectionRefs = { planKpiId: string | null; scorecardMetricId: string | null };

export function kpiInSelection(
  kpi: { id: string; scorecardMetricId?: string | null },
  rows: SelectionRefs[],
): boolean {
  return rows.some(
    (r) => r.planKpiId === kpi.id || (!!kpi.scorecardMetricId && r.scorecardMetricId === kpi.scorecardMetricId),
  );
}
