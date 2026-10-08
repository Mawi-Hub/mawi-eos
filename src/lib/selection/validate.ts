// Validación pura de una selección trimestral. La usan el script de
// configuración y la API de administración; no toca la base.

export type CandidateRow = {
  key: string; // para identificar la fila en los errores
  quarterPlanId: string | null; // plan al que pertenece el trimestre
  planKpi?: {
    id: string;
    planId: string;
    scorecardMetricId: string | null;
    unit: string; // USD | PCT | count
    direction: "ABOVE" | "BELOW";
  } | null;
  scorecardMetric?: {
    id: string;
    unit: string | null;
    targetDirection: string;
  } | null;
  proposalKey?: string | null;
};

export type ValidationIssue = { key: string; code: string; message: string; level: "error" | "review" };

const UNIT_PAIRS: Record<string, string[]> = { USD: ["$"], PCT: ["%"], count: ["count", "days", "hours", "score", "ratio", "months"] };

export function validateSelection(rows: CandidateRow[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const kpiSeen = new Set<string>();
  const metricSeen = new Set<string>();
  const proposalSeen = new Set<string>();

  for (const row of rows) {
    const refs = [row.planKpi?.id, row.scorecardMetric?.id, row.proposalKey].filter(Boolean).length;
    if (refs === 0) {
      issues.push({ key: row.key, code: "no_reference", level: "error", message: "La fila no apunta a un KPI, una métrica ni una definición propuesta." });
      continue;
    }

    if (row.planKpi) {
      if (kpiSeen.has(row.planKpi.id)) {
        issues.push({ key: row.key, code: "duplicate_kpi", level: "error", message: "El mismo KPI del plan aparece dos veces en el trimestre." });
      }
      kpiSeen.add(row.planKpi.id);

      if (row.quarterPlanId && row.planKpi.planId !== row.quarterPlanId) {
        issues.push({ key: row.key, code: "other_plan", level: "error", message: "El KPI pertenece a otro plan distinto al del trimestre." });
      }

      const mapped = row.planKpi.scorecardMetricId;
      if (row.scorecardMetric && mapped && mapped !== row.scorecardMetric.id) {
        issues.push({ key: row.key, code: "ambiguous_mapping", level: "error", message: "El KPI ya está mapeado a otra métrica del Scorecard; un KPI no puede apuntar a dos." });
      }
      if (!mapped && !row.scorecardMetric) {
        issues.push({ key: row.key, code: "unmapped", level: "review", message: "El KPI no tiene correspondencia con una métrica del Scorecard: queda marcado para revisión." });
      }

      const metric = row.scorecardMetric;
      if (metric) {
        const allowed = UNIT_PAIRS[row.planKpi.unit] ?? [];
        if (metric.unit && allowed.length > 0 && !allowed.includes(metric.unit)) {
          issues.push({ key: row.key, code: "unit_mismatch", level: "review", message: `Unidad distinta: plan ${row.planKpi.unit} vs scorecard ${metric.unit}.` });
        }
        const planDir = row.planKpi.direction === "ABOVE" ? "above" : "below";
        if (metric.targetDirection !== planDir && metric.targetDirection !== "equal") {
          issues.push({ key: row.key, code: "direction_mismatch", level: "review", message: `Sentido de mejora distinto: plan ${planDir} vs scorecard ${metric.targetDirection}.` });
        }
      }
    }

    if (row.scorecardMetric) {
      if (metricSeen.has(row.scorecardMetric.id)) {
        issues.push({ key: row.key, code: "duplicate_metric", level: "error", message: "La misma métrica del Scorecard aparece dos veces en el trimestre." });
      }
      metricSeen.add(row.scorecardMetric.id);
    }

    if (row.proposalKey) {
      if (proposalSeen.has(row.proposalKey)) {
        issues.push({ key: row.key, code: "duplicate_proposal", level: "error", message: "La misma definición propuesta aparece dos veces." });
      }
      proposalSeen.add(row.proposalKey);
    }
  }
  return issues;
}

export function hasBlockingIssues(issues: ValidationIssue[]): boolean {
  return issues.some((i) => i.level === "error");
}
